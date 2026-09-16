import { createClient } from '@supabase/supabase-js'
import { enviarGmail } from '@/lib/gmailSend'
import { obterAssinaturaHtml, corpoHtmlComAssinatura } from '@/lib/emailAssinatura'
import { render, varsAssunto, remetenteValido, type FreightRequest, type FreightRecipient, type FreightEmailTemplate } from '@/types/freight'

// Envio do email de AGRADECIMENTO aos transitários NÃO escolhidos — UM email
// individual por transitário (sem CC/BCC), cordial, sem mencionar o vencedor
// nem valores. Regista quem recebeu e quando. Corre no servidor.
export const runtime = 'nodejs'

const THROTTLE_MS = 600
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role, nome').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string | null } | null
  if (!['admin', 'financeiro', 'standard'].includes(p?.role ?? '')) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  let corpo: { requestId?: string; incluirNaoResponderam?: boolean }
  try { corpo = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const requestId = corpo.requestId
  if (!requestId) return Response.json({ ok: false, erro: 'Falta requestId.' }, { status: 400 })

  const { data: pedidoRow } = await db.from('freight_quote_requests').select('*').eq('id', requestId).single()
  if (!pedidoRow) return Response.json({ ok: false, erro: 'Pedido não encontrado.' }, { status: 404 })
  const pedido = pedidoRow as FreightRequest

  const [{ data: templateRow }, { data: recRows }, { data: quoteRows }] = await Promise.all([
    db.from('freight_email_templates').select('*').eq('idioma', pedido.idioma).single(),
    db.from('freight_quote_recipients').select('*').eq('request_id', requestId),
    db.from('freight_quotes').select('forwarder_id').eq('request_id', requestId).is('deleted_at', null),
  ])
  const template = templateRow as FreightEmailTemplate | null
  if (!template?.agrad_assunto || !template?.agrad_corpo) {
    return Response.json({ ok: false, erro: `Sem template de agradecimento para o idioma ${pedido.idioma}.` }, { status: 400 })
  }
  const responderam = new Set(((quoteRows as { forwarder_id: string | null }[]) ?? []).map((q) => q.forwarder_id).filter(Boolean))

  // Candidatos: já enviados, NÃO o vencedor, ainda não agradecidos. Por
  // omissão só quem respondeu; opcionalmente inclui quem não respondeu.
  const todos = (recRows as FreightRecipient[]) ?? []
  const destinatarios = todos.filter((d) =>
    d.estado === 'enviado' &&
    d.forwarder_id !== pedido.vencedor_forwarder_id &&
    !d.agradecido_em &&
    (corpo.incluirNaoResponderam || (d.forwarder_id && responderam.has(d.forwarder_id))),
  )
  if (destinatarios.length === 0) return Response.json({ ok: false, erro: 'Não há transitários para agradecer.' }, { status: 400 })

  const remetente = remetenteValido(pedido.remetente) ? pedido.remetente!.trim() : 'comercial@all4laser.com'
  const assinatura = await obterAssinaturaHtml(db, remetente)
  const referencia = pedido.numero ?? ''
  // Assunto = o assunto ORIGINAL da cotação (para o transitário identificar o
  // pedido) + o sufixo de agradecimento. O assunto original vem, por
  // destinatário, do que foi mesmo enviado (assunto_final); senão, do template.
  const assuntoBase = (pedido.assunto_email && pedido.assunto_email.trim()) || render(template.assunto_template, varsAssunto(pedido))
  const sufixo = (template.agrad_assunto && template.agrad_assunto.trim())
    ? render(template.agrad_assunto, { referencia })
    : (pedido.idioma === 'en' ? 'Thank you for your quote' : 'Obrigado pela vossa cotação')

  const agora = new Date().toISOString()
  const resultados: { id: string; ok: boolean; erro?: string }[] = []
  for (let i = 0; i < destinatarios.length; i++) {
    const d = destinatarios[i]
    const assuntoOriginal = ((d as { assunto_final?: string | null }).assunto_final?.trim()) || assuntoBase
    const assunto = `${assuntoOriginal} — ${sufixo}`
    const corpoTexto = render(template.agrad_corpo, { saudacao: d.saudacao ?? d.nome_empresa ?? '', referencia })
    const corpoHtml = corpoHtmlComAssinatura(corpoTexto, assinatura)
    const r = await enviarGmail({ para: d.emails, assunto, corpoTexto, corpoHtml, remetente })
    if (r.ok) {
      await db.from('freight_quote_recipients')
        .update({ agradecido_em: agora, agradecido_por_nome: p?.nome ?? null }).eq('id', d.id)
    }
    resultados.push({ id: d.id, ok: r.ok, erro: r.ok ? undefined : r.erro })
    if (i < destinatarios.length - 1) await sleep(THROTTLE_MS)
  }

  const enviados = resultados.filter((r) => r.ok).length
  return Response.json({ ok: true, enviados, falhados: resultados.length - enviados, resultados })
}
