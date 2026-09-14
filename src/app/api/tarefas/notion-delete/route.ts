import { createClient } from '@supabase/supabase-js'
import { tokenNotion, arquivarPagina } from '@/lib/notionApi'

// Apagar uma tarefa em definitivo. Se estiver ligada ao Notion, manda a página
// para o lixo lá primeiro (senão o cron voltava a importá-la) e só depois apaga
// na app. Staff autenticado. Remove também eventuais linhas de staging.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ ok: false, erro: 'Sessão em falta.' }, { status: 401 })
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: u } = await userClient.auth.getUser()
  const uid = u.user?.id
  if (!uid) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await userClient.from('profiles').select('role').eq('id', uid).maybeSingle()
  const role = (perfil as { role: string } | null)?.role
  if (!role || !['admin', 'financeiro', 'standard'].includes(role)) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let taskId: string | undefined
  try { taskId = (await req.json())?.taskId } catch { /* ignore */ }
  if (!taskId) return Response.json({ ok: false, erro: 'Falta o taskId.' }, { status: 400 })

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: tarefa } = await sb.from('user_tasks').select('notion_page_id').eq('id', taskId).maybeSingle()
  const pageId = (tarefa as { notion_page_id: string | null } | null)?.notion_page_id ?? null

  // Manda a página do Notion para o lixo (best-effort: não bloqueia o apagar).
  const nt = tokenNotion()
  if (pageId && nt) {
    try { await arquivarPagina(nt, pageId, true) } catch { /* segue mesmo assim */ }
    await sb.from('notion_sync_import_staging').delete().eq('notion_page_id', pageId)
  }

  const { error } = await sb.from('user_tasks').delete().eq('id', taskId)
  if (error) return Response.json({ ok: false, erro: error.message })
  return Response.json({ ok: true })
}
