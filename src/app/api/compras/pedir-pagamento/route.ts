import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Pedido de pagamento a partir de uma cotação de compra.
//   POST → envio manual (da página do pedido). Valida a sessão (staff), envia o
//          email (editado pela utilizadora) e regista na cotação:
//          pagamento_pedido_em (1.ª vez), lembrete_ultimo, lembretes_count,
//          destinatarios. Os lembretes de 24h (cron) reaproveitam estes dados.

export const runtime = 'nodejs'

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ))
}

// Corpo em texto → HTML simples (escapa e converte quebras de linha).
export function textoParaHtml(corpo: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;white-space:pre-wrap">${escaparHtml(corpo)}</div>`
}

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  let body: { cotacaoId?: string; destinatarios?: string[]; assunto?: string; corpo?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }

  const cotacaoId = String(body.cotacaoId ?? '')
  const destinatarios = (body.destinatarios ?? []).map((e) => String(e).trim()).filter(Boolean)
  const assunto = String(body.assunto ?? '').trim()
  const corpo = String(body.corpo ?? '').trim()
  if (!cotacaoId) return Response.json({ ok: false, erro: 'Cotação em falta.' }, { status: 400 })
  if (destinatarios.length === 0) return Response.json({ ok: false, erro: 'Indica pelo menos um destinatário.' }, { status: 400 })
  if (!assunto || !corpo) return Response.json({ ok: false, erro: 'Assunto e corpo são obrigatórios.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData } = await sb.auth.getUser()
  if (!userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  // Estado atual da cotação (para não perder a data do 1.º pedido e contar envios).
  const { data: cot } = await sb.from('pedidos_compra_cotacoes')
    .select('pagamento_pedido_em, lembretes_count').eq('id', cotacaoId).maybeSingle()
  if (!cot) return Response.json({ ok: false, erro: 'Cotação não encontrada.' }, { status: 404 })

  const envio = await enviarEmail({ para: destinatarios, assunto, html: textoParaHtml(corpo) })
  if (!envio.ok) return Response.json({ ok: false, erro: envio.motivo ?? 'Falha ao enviar o email.' }, { status: 502 })

  const agora = new Date().toISOString()
  const c = cot as { pagamento_pedido_em: string | null; lembretes_count: number | null }
  const { error } = await sb.from('pedidos_compra_cotacoes').update({
    pagamento_pedido_em: c.pagamento_pedido_em ?? agora,
    lembrete_ultimo: agora,
    lembretes_count: (c.lembretes_count ?? 0) + 1,
    destinatarios,
  }).eq('id', cotacaoId)
  if (error) return Response.json({ ok: false, erro: 'Email enviado, mas falhou registar: ' + error.message }, { status: 500 })

  return Response.json({ ok: true })
}
