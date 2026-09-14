import { createClient } from '@supabase/supabase-js'
import { sincronizar } from '@/lib/notionSync'
import { ANDREIA_NOTION_USER_ID } from '@/lib/notionApi'

// Sincronização A Minha Área ↔ Notion.
//   GET  → cron (GitHub Actions, protegido por CRON_SECRET). Sincroniza todas as
//          contas ativas (fase 1 = só a Andreia). ?dryrun=1 para simular.
//   POST → "Sincronizar agora" (staff autenticado): sincroniza a SUA conta.
// O token do Notion (NOTION_TOKEN) fica sempre no servidor.

export const runtime = 'nodejs'
export const maxDuration = 300

const ADMIN_EMAIL = 'andreia.fernandes@all4laser.com'

function servico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

// ─── GET: cron ─────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  const sb = servico()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'

  // Contas ativas; se não houver nenhuma, arranca a da Andreia pelo email.
  let { data: contas } = await sb.from('notion_sync_contas').select('user_id').eq('ativo', true)
  if (!contas || contas.length === 0) {
    const { data: perfil } = await sb.from('profiles').select('id').eq('email', ADMIN_EMAIL).maybeSingle()
    const uid = (perfil as { id: string } | null)?.id
    if (uid) {
      await sb.from('notion_sync_contas').upsert({ user_id: uid, notion_user_id: ANDREIA_NOTION_USER_ID, ativo: true }, { onConflict: 'user_id' })
      contas = [{ user_id: uid }]
    } else {
      return Response.json({ ok: false, erro: 'Sem contas de sync e não encontrei o perfil da Andreia.' })
    }
  }

  const resultados = []
  for (const c of contas as { user_id: string }[]) {
    resultados.push({ user_id: c.user_id, ...(await sincronizar(sb, { userId: c.user_id, origem: 'cron', dryrun })) })
  }
  const ok = resultados.every((r) => r.ok)
  return Response.json({ ok, dryrun, resultados })
}

// ─── POST: manual (staff autenticado sincroniza a sua conta) ────────────────────
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = servico()
  if (!url || !anon || !sb) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ ok: false, erro: 'Sessão em falta.' }, { status: 401 })
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: u } = await userClient.auth.getUser()
  const uid = u.user?.id
  if (!uid) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await userClient.from('profiles').select('role').eq('id', uid).maybeSingle()
  const role = (perfil as { role: string } | null)?.role
  if (!role || !['admin', 'financeiro', 'standard'].includes(role)) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }
  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'
  const r = await sincronizar(sb, { userId: uid, origem: 'manual', dryrun })
  return Response.json(r)
}
