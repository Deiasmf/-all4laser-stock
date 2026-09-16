import { createClient } from '@supabase/supabase-js'
import { obterAssinaturaGmail } from '@/lib/gmailSettings'

// Gestão da assinatura única dos emails.
//   GET  → estado atual (fonte, HTML em uso, manual).
//   POST { acao: 'refresh_gmail' } → lê a assinatura do Gmail (comercial@) e passa a usá-la.
//   POST { acao: 'manual', html }  → guarda a assinatura colada à mão e passa a usá-la.
// Acesso: qualquer staff (RLS de email_config = is_staff).
export const runtime = 'nodejs'

async function autenticar(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return { erro: 'Servidor não configurado.', status: 500 as const }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { erro: 'Sem sessão.', status: 401 as const }
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: u } = await sb.auth.getUser()
  if (!u.user) return { erro: 'Sessão inválida.', status: 401 as const }
  const { data: perfil } = await sb.from('profiles').select('role, nome').eq('id', u.user.id).maybeSingle()
  const p = perfil as { role: string; nome: string | null } | null
  if (!p || !['admin', 'financeiro', 'standard'].includes(p.role)) return { erro: 'Sem permissão.', status: 403 as const }
  return { sb, nome: p.nome }
}

export async function GET(req: Request) {
  const a = await autenticar(req)
  if ('erro' in a) return Response.json({ ok: false, erro: a.erro }, { status: a.status })
  // ?remetente=... devolve a assinatura DESSA conta; sem parâmetro, a global.
  const remetente = new URL(req.url).searchParams.get('remetente')
  if (remetente && remetente.trim()) {
    const { data } = await a.sb.from('email_assinaturas').select('*').eq('remetente', remetente.trim()).maybeSingle()
    return Response.json({ ok: true, config: data })
  }
  const { data } = await a.sb.from('email_config').select('*').eq('id', true).maybeSingle()
  return Response.json({ ok: true, config: data })
}

export async function POST(req: Request) {
  const a = await autenticar(req)
  if ('erro' in a) return Response.json({ ok: false, erro: a.erro }, { status: a.status })
  let corpo: { acao?: string; html?: string; remetente?: string } = {}
  try { corpo = await req.json() } catch { /* ignore */ }
  const remetente = (corpo.remetente ?? '').trim() || null

  if (corpo.acao === 'refresh_gmail') {
    // Conta a ler: a indicada (por remetente) ou a global do email_config.
    let conta = remetente
    if (!conta) {
      const { data: cfg } = await a.sb.from('email_config').select('remetente').eq('id', true).maybeSingle()
      conta = (cfg as { remetente: string } | null)?.remetente ?? null
    }
    const r = await obterAssinaturaGmail(conta ?? undefined)
    if (!r.ok) return Response.json({ ok: false, erro: r.erro })
    if (!r.signature || !r.signature.trim()) return Response.json({ ok: false, erro: 'A conta do Gmail não tem assinatura definida.' })
    const patch = { fonte: 'gmail', assinatura_html: r.signature, atualizada_em: new Date().toISOString(), atualizada_por_nome: a.nome }
    const error = remetente
      ? (await a.sb.from('email_assinaturas').upsert({ remetente, ...patch }, { onConflict: 'remetente' })).error
      : (await a.sb.from('email_config').update(patch).eq('id', true)).error
    if (error) return Response.json({ ok: false, erro: error.message })
    return Response.json({ ok: true, assinatura_html: r.signature })
  }

  if (corpo.acao === 'manual') {
    const html = (corpo.html ?? '').trim()
    const patch = { fonte: 'manual', assinatura_manual_html: html, assinatura_html: html, atualizada_em: new Date().toISOString(), atualizada_por_nome: a.nome }
    const error = remetente
      ? (await a.sb.from('email_assinaturas').upsert({ remetente, ...patch }, { onConflict: 'remetente' })).error
      : (await a.sb.from('email_config').update(patch).eq('id', true)).error
    if (error) return Response.json({ ok: false, erro: error.message })
    return Response.json({ ok: true, assinatura_html: html })
  }

  return Response.json({ ok: false, erro: 'Ação inválida.' }, { status: 400 })
}
