import { createClient } from '@supabase/supabase-js'
import { enviarGmail } from '@/lib/gmailSend'
import {
  render, varsAssunto, moradaOrigem, moradaDestino, datasTexto, extrasTexto,
  tabelaVolumesTexto, tipoTransporteAdjetivo,
  type FreightRequest, type CargoLine, type FreightRecipient, type FreightEmailTemplate, type FreightSettings,
} from '@/types/freight'

// Envio dos pedidos de cotação por Gmail — UM email individual por transitário
// (sem CC/BCC cruzado). Corre no servidor: valida o utilizador (admin/
// administrativo) e usa a service role para ler/gravar. Throttling entre envios
// para não disparar limites do Gmail; retry por destinatário.

export const runtime = 'nodejs'

const THROTTLE_MS = 600      // pausa entre envios
const TENTATIVAS_MAX = 2     // tentativas por destinatário dentro de um envio

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Data-limite de resposta: hoje + N dias úteis (formato YYYY-MM-DD).
function prazoRespostaData(diasUteis: number): string {
  const d = new Date()
  let restantes = Math.max(1, diasUteis)
  while (restantes > 0) {
    d.setDate(d.getDate() + 1)
    const dia = d.getDay()
    if (dia !== 0 && dia !== 6) restantes--
  }
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // 1) Autenticação: o cliente envia o access token da sessão.
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 2) Autorização: só admin / administrativo.
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'administrativo') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  // 3) Corpo do pedido.
  let corpo: { requestId?: string; recipientIds?: string[] }
  try { corpo = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const requestId = corpo.requestId
  if (!requestId) return Response.json({ ok: false, erro: 'Falta requestId.' }, { status: 400 })

  // 4) Carregar pedido, linhas, template, settings e destinatários.
  const { data: pedidoRow, error: erroPedido } = await db.from('freight_quote_requests').select('*').eq('id', requestId).single()
  if (erroPedido || !pedidoRow) return Response.json({ ok: false, erro: 'Pedido não encontrado.' }, { status: 404 })
  const pedido = pedidoRow as FreightRequest

  const [{ data: linhasRows }, { data: templateRow }, { data: settingsRow }] = await Promise.all([
    db.from('freight_quote_cargo_lines').select('*').eq('request_id', requestId).order('ordem'),
    db.from('freight_email_templates').select('*').eq('idioma', pedido.idioma).single(),
    db.from('freight_settings').select('*').eq('id', 1).single(),
  ])
  const linhas = (linhasRows as CargoLine[]) ?? []
  const template = templateRow as FreightEmailTemplate | null
  if (!template) return Response.json({ ok: false, erro: `Sem template para o idioma ${pedido.idioma}.` }, { status: 400 })
  const dias = (settingsRow as FreightSettings | null)?.dias_uteis_alerta ?? 3

  let q = db.from('freight_quote_recipients').select('*').eq('request_id', requestId)
  if (corpo.recipientIds?.length) q = q.in('id', corpo.recipientIds)
  else q = q.in('estado', ['pendente', 'falhou'])
  const { data: recRows } = await q
  const destinatarios = (recRows as FreightRecipient[]) ?? []
  if (destinatarios.length === 0) return Response.json({ ok: false, erro: 'Sem destinatários pendentes.' }, { status: 400 })

  // 5) Variáveis comuns do corpo (as específicas do destinatário juntam-se no loop).
  const assunto = (pedido.assunto_email && pedido.assunto_email.trim())
    || render(template.assunto_template, varsAssunto(pedido))
  const varsComuns: Record<string, string> = {
    tipo: tipoTransporteAdjetivo(pedido.tipo_transporte),
    origem: moradaOrigem(pedido),
    destino: moradaDestino(pedido) || (pedido.destino_pais ?? ''),
    datas: datasTexto(pedido, pedido.idioma),
    tabela_volumes: tabelaVolumesTexto(linhas, pedido.idioma),
    extras: extrasTexto(pedido, pedido.idioma),
    prazo_resposta: prazoRespostaData(dias),
  }

  // 6) Envio individual, com throttling e retry.
  const resultados: { id: string; ok: boolean; erro?: string }[] = []
  for (let i = 0; i < destinatarios.length; i++) {
    const d = destinatarios[i]
    const corpoEmail = render(template.corpo_template, { ...varsComuns, saudacao: d.saudacao ?? d.nome_empresa ?? '' })

    let ok = false, erroEnvio: string | undefined, messageId: string | undefined, threadId: string | undefined
    for (let tentativa = 1; tentativa <= TENTATIVAS_MAX && !ok; tentativa++) {
      const r = await enviarGmail({ para: d.emails, assunto, corpoTexto: corpoEmail })
      if (r.ok) { ok = true; messageId = r.messageId; threadId = r.threadId }
      else { erroEnvio = r.erro; if (tentativa < TENTATIVAS_MAX) await sleep(400) }
    }

    await db.from('freight_quote_recipients').update({
      estado: ok ? 'enviado' : 'falhou',
      tentativas: (d.tentativas ?? 0) + 1,
      erro: ok ? null : (erroEnvio ?? 'Falha desconhecida.'),
      enviado_em: ok ? new Date().toISOString() : d.enviado_em,
      gmail_message_id: messageId ?? d.gmail_message_id,
      gmail_thread_id: threadId ?? d.gmail_thread_id,
    }).eq('id', d.id)

    resultados.push({ id: d.id, ok, erro: ok ? undefined : erroEnvio })
    if (i < destinatarios.length - 1) await sleep(THROTTLE_MS)
  }

  // 7) Se pelo menos um saiu e o pedido ainda era rascunho, passa a "enviado".
  const algumEnviado = resultados.some((r) => r.ok)
  if (algumEnviado && pedido.estado === 'rascunho') {
    await db.from('freight_quote_requests').update({ estado: 'enviado', updated_at: new Date().toISOString() }).eq('id', requestId)
  }

  const enviados = resultados.filter((r) => r.ok).length
  const falhados = resultados.length - enviados
  return Response.json({ ok: true, enviados, falhados, resultados })
}
