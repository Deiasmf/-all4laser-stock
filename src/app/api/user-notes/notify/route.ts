import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Envia (best-effort) o email de aviso de um recado URGENTE — e só se o
// destinatário tiver feito opt-in (user_notification_prefs). A decisão é toda
// do servidor: o cliente só passa o id do recado.
//
// Segurança: usa o TOKEN de quem envia (admin). A RLS garante que:
//  • só quem enviou/recebeu o recado o consegue ler (user_notes);
//  • só admin lê as preferências de outro utilizador (user_notification_prefs).

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ))
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  let body: { recadoId?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const recadoId = String(body.recadoId ?? '')
  if (!recadoId) return Response.json({ ok: false, erro: 'recadoId em falta.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  // Recado (RLS: o remetente/admin vê-o).
  const { data: recado } = await sb.from('user_notes')
    .select('to_user, mensagem, urgente').eq('id', recadoId).maybeSingle()
  if (!recado) return Response.json({ ok: false, erro: 'Recado não encontrado.' }, { status: 404 })
  if (!recado.urgente) return Response.json({ ok: true, notificado: false, motivo: 'Recado não urgente.' })

  // Opt-in do destinatário (RLS: admin pode ler).
  const { data: pref } = await sb.from('user_notification_prefs')
    .select('notif_recado_urgente').eq('user_id', recado.to_user).maybeSingle()
  if (!pref?.notif_recado_urgente) {
    return Response.json({ ok: true, notificado: false, motivo: 'Destinatário não ativou o aviso.' })
  }

  const { data: dest } = await sb.from('profiles')
    .select('nome, email').eq('id', recado.to_user).maybeSingle()
  if (!dest?.email) return Response.json({ ok: true, notificado: false, motivo: 'Destinatário sem email.' })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const link = base ? `<p><a href="${base}/a-minha-area">Abrir A Minha Área</a></p>` : ''
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
    <p>Olá ${escaparHtml(dest.nome ?? '')},</p>
    <p>Recebeste um <strong style="color:#B91C1C">recado urgente</strong> na tua área da plataforma All4laser:</p>
    <blockquote style="border-left:3px solid #B91C1C;margin:12px 0;padding:6px 0 6px 12px;color:#333">${escaparHtml(recado.mensagem)}</blockquote>
    ${link}
    <p style="color:#888;font-size:12px">Recebeste este email porque ativaste o aviso de recados urgentes. Podes desligá-lo em "A Minha Área".</p>
  </div>`

  const r = await enviarEmail({ para: dest.email, assunto: 'Recado urgente — All4laser', html })
  return Response.json({ ok: r.ok, notificado: r.ok, motivo: r.motivo })
}
