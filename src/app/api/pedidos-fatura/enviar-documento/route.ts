import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { enviarGmail } from '@/lib/gmailSend'
import { obterAssinaturaHtml, corpoHtmlComAssinatura } from '@/lib/emailAssinatura'
import { notificarFaturaEnviada } from '@/lib/pedidosFaturaServer'
import { EMAIL_VANESSA, EMAIL_ANDREIA } from '@/types/freight'

// Envia ao cliente a fatura de um pedido: email a partir da conta da VANESSA
// (personificada via DWD) com CC automático para a Andreia, assunto/corpo do
// template (editáveis na pré-visualização) + assinatura única da Vanessa e o
// PDF em anexo. Ao enviar: marca "enviado_cliente" e lança a fatura na conta
// corrente do cliente (sem duplicar; o sync Keyinvoice reconcilia pelo nº).
export const runtime = 'nodejs'

type Pedido = {
  id: string; numero: string | null; tipo: string; estado: string
  cliente_id: string | null; cliente_nome: string | null; cliente_email: string | null
  descricao: string | null; valor: number | null
  num_fatura: string | null; data_fatura: string | null; valor_total: number | null
  documento_url: string | null; canais_usados: string[] | null; financeiro_movimento_id: string | null
  proforma_url: string | null; proforma_num: string | null; proforma_data: string | null; proforma_valor: number | null
}

// Etapa a enviar: pró-forma (1ª etapa) ou fatura fiscal (fatura direta ou final).
function etapaDe(p: Pedido): 'proforma' | 'fatura' {
  if (p.tipo !== 'pro_forma') return 'fatura'
  return ['fatura_pedida', 'fatura_realizada', 'fechado'].includes(p.estado) ? 'fatura' : 'proforma'
}

async function anexoDeUrl(url: string, nomeBase: string) {
  const r = await fetch(url)
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase()
  const mimeType = r.headers.get('content-type')?.split(';')[0].trim() || 'application/pdf'
  return { filename: `${nomeBase}.${ext}`, contentBase64: buf.toString('base64'), mimeType }
}

function euro(v: number | null | undefined) {
  return v == null ? '' : v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Lança a fatura FISCAL na conta corrente do cliente. Chamada só quando se envia
// a etapa "fatura" (fatura direta ou fatura final da pró-forma) — a pró-forma
// NUNCA entra na conta corrente. Idempotente por (cliente, nº).
async function lancarNaContaCorrente(db: SupabaseClient, p: Pedido): Promise<string | null> {
  if (!p.cliente_id || !p.num_fatura || p.valor_total == null) return null
  if (p.financeiro_movimento_id) return p.financeiro_movimento_id
  const { data: existente } = await db.from('financeiro_movimentos')
    .select('id').eq('cliente_id', p.cliente_id).eq('documento_ref', p.num_fatura).eq('tipo_documento', 'fatura').maybeSingle()
  if (existente) return (existente as { id: string }).id
  const { data: novo } = await db.from('financeiro_movimentos').insert({
    entidade_tipo: 'cliente', cliente_id: p.cliente_id, entidade_nome: p.cliente_nome,
    tipo_documento: 'fatura', documento_ref: p.num_fatura,
    data_documento: p.data_fatura ?? new Date().toISOString().slice(0, 10),
    valor_debito: p.valor_total, descricao: p.descricao,
    origem: 'manual', categoria_manual: true, criado_por_nome: 'Pedidos de Fatura',
  }).select('id').single()
  return (novo as { id: string } | null)?.id ?? null
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  // Autenticação + autorização (só financeiro/admin envia ao cliente).
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  if (!['admin', 'financeiro'].includes((perfil as { role?: string } | null)?.role ?? '')) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  let body: { id?: string; assunto?: string; corpo?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const id = String(body.id ?? '')
  if (!id) return Response.json({ ok: false, erro: 'Falta o id do pedido.' }, { status: 400 })

  const { data, error } = await db.from('pedidos_fatura')
    .select('id, numero, tipo, estado, cliente_id, cliente_nome, cliente_email, descricao, valor, num_fatura, data_fatura, valor_total, documento_url, canais_usados, financeiro_movimento_id, proforma_url, proforma_num, proforma_data, proforma_valor')
    .eq('id', id).single()
  if (error || !data) return Response.json({ ok: false, erro: 'Pedido não encontrado.' }, { status: 404 })
  const p = data as Pedido

  // Etapa a enviar e os campos do documento correspondente.
  const etapa = etapaDe(p)
  const docUrl = etapa === 'proforma' ? p.proforma_url : p.documento_url
  const docNum = etapa === 'proforma' ? p.proforma_num : p.num_fatura
  const docData = etapa === 'proforma' ? p.proforma_data : p.data_fatura
  const docValor = etapa === 'proforma' ? p.proforma_valor : p.valor_total

  if (!p.cliente_email) return Response.json({ ok: false, erro: 'O cliente não tem email definido.' }, { status: 400 })
  if (!docUrl) return Response.json({ ok: false, erro: 'Ainda não há documento anexado para enviar.' }, { status: 400 })
  // A fatura fiscal exige nº, data e valor; a pró-forma pode seguir sem nº formal.
  if (etapa === 'fatura' && (!docNum || docValor == null || !docData)) {
    return Response.json({ ok: false, erro: 'Preenche o nº, a data e o valor total da fatura antes de enviar.' }, { status: 400 })
  }

  // Assunto/corpo: os EDITADOS na pré-visualização, ou o template com substituição básica.
  const docLabel = etapa === 'proforma' ? 'Fatura pró-forma' : 'Fatura'
  const assunto = (body.assunto && body.assunto.trim())
    || `All4laser – ${docLabel} ${docNum ?? ''} – ${p.cliente_nome ?? ''}`
  const corpo = (body.corpo && body.corpo.trim())
    || `Exmo.(a) Sr.(a) ${p.cliente_nome ?? ''},\n\nServe o presente email para envio do documento ${docNum ?? ''}, referente a ${p.cliente_nome ?? ''}, com data de ${docData ?? ''}, no valor total de ${euro(docValor)} €.\n\nO documento segue em anexo.\n\nPara qualquer esclarecimento adicional, estamos inteiramente ao dispor.\n\nCom os melhores cumprimentos,`

  const assinatura = await obterAssinaturaHtml(db, EMAIL_VANESSA)
  const nomeDoc = etapa === 'proforma' ? 'Fatura-pro-forma' : 'Fatura'
  const anexo = await anexoDeUrl(docUrl, `${nomeDoc}-${docNum ?? p.numero ?? 'documento'}`)

  const r = await enviarGmail({
    para: [p.cliente_email],
    cc: [EMAIL_ANDREIA],
    assunto,
    corpoTexto: corpo,
    corpoHtml: corpoHtmlComAssinatura(corpo, assinatura),
    remetente: EMAIL_VANESSA,
    anexos: anexo ? [anexo] : [],
  })
  if (!r.ok) return Response.json({ ok: false, erro: r.erro ?? 'Falha no envio.' }, { status: 502 })

  const canais = Array.from(new Set([...(p.canais_usados ?? []), 'email']))
  const agora = new Date().toISOString()

  if (etapa === 'proforma') {
    // Pró-forma enviada → aguarda pagamento do cliente (fora da fila da Vanessa).
    // A pró-forma NÃO lança conta corrente. Reinicia o relógio de lembretes.
    await db.from('pedidos_fatura').update({
      estado: 'aguarda_pagamento', proforma_enviada_em: agora, respondido_em: agora,
      canais_usados: canais, lembrete_ultimo: null, lembretes_count: 0,
    }).eq('id', id)
    try { await notificarFaturaEnviada(db, id) } catch { /* ignora */ }
    return Response.json({ ok: true, conta_corrente: false, etapa })
  }

  // Fatura fiscal (direta ou final da pró-forma) → lança na conta corrente.
  const movimentoId = await lancarNaContaCorrente(db, p)
  const estadoFinal = p.tipo === 'pro_forma' ? 'fechado' : 'enviado_cliente'
  await db.from('pedidos_fatura').update({
    estado: estadoFinal, enviado_em: agora, respondido_em: agora,
    fechado_em: p.tipo === 'pro_forma' ? agora : null,
    canais_usados: canais, financeiro_movimento_id: movimentoId ?? p.financeiro_movimento_id,
  }).eq('id', id)

  // Avisa o colega que pediu (recado + email); best-effort, não falha o envio.
  try { await notificarFaturaEnviada(db, id) } catch { /* ignora */ }

  return Response.json({ ok: true, conta_corrente: !!movimentoId, etapa })
}
