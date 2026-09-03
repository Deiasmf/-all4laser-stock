import { supabase } from './supabase'
import {
  listarMovimentos, alocarFaturas, entidadeIdDe, hojeISO, contaParaSaldo,
  compararEmissaoDesc, formatarEuro, formatarData, type MovimentoCC,
} from './contasCorrentes'
import { semAcentos } from './categorizacaoFinanceira'

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PAGAMENTO ao cliente (o que está por receber).
//
// O que está por pagar é calculado a partir da conta corrente (alocação FIFO +
// pagamento confirmado à mão): não há estado duplicado, o documento sai da lista
// assim que fica liquidado. Cada pedido enviado fica registado em
// financeiro_pedidos_pagamento (quem, quando, para quem, automático ou não) —
// tabela distinta de financeiro_cobrancas, que é do módulo Recolhas.
//
// Envio manual: sempre disponível, a partir da página de Pedidos de Pagamento.
// Envio automático: opt-in por documento (lembretes_auto) + configuração global
// da cadência; o cron /api/financeiro/pedidos-pagamento trata do resto.
// ─────────────────────────────────────────────────────────────────────────────

export type ConfigPedidos = {
  lembretes_ativos: boolean
  cadencia_dias: number
  dias_apos_vencimento: number
  valor_minimo: number
  assunto_modelo: string | null
  mensagem_modelo: string | null
  atualizado_em?: string
  atualizado_por_nome?: string | null
}

export const ASSUNTO_PADRAO = 'All4laser — Pagamento pendente: {documento}'
export const MENSAGEM_PADRAO = [
  'Exmos. Senhores,',
  '',
  'Vimos por este meio relembrar que se encontra pendente o pagamento do documento {documento}, no valor de {valor}, com vencimento a {vencimento} ({atraso}).',
  '',
  'Caso o pagamento já tenha sido efetuado, agradecemos que ignorem este email e nos enviem o comprovativo.',
  '',
  'Com os melhores cumprimentos,',
  'All4laser',
].join('\n')

export const CONFIG_PADRAO: ConfigPedidos = {
  lembretes_ativos: false,
  cadencia_dias: 15,
  dias_apos_vencimento: 1,
  valor_minimo: 0,
  assunto_modelo: ASSUNTO_PADRAO,
  mensagem_modelo: MENSAGEM_PADRAO,
}

export async function carregarConfig(): Promise<ConfigPedidos> {
  const { data } = await supabase.from('financeiro_config').select('*').maybeSingle()
  if (!data) return { ...CONFIG_PADRAO }
  const c = data as Partial<ConfigPedidos>
  return {
    ...CONFIG_PADRAO,
    ...c,
    assunto_modelo: c.assunto_modelo || ASSUNTO_PADRAO,
    mensagem_modelo: c.mensagem_modelo || MENSAGEM_PADRAO,
  }
}

export async function guardarConfig(cfg: ConfigPedidos, porNome: string | null) {
  return supabase.from('financeiro_config').upsert({
    id: true,
    lembretes_ativos: cfg.lembretes_ativos,
    cadencia_dias: cfg.cadencia_dias,
    dias_apos_vencimento: cfg.dias_apos_vencimento,
    valor_minimo: cfg.valor_minimo,
    assunto_modelo: cfg.assunto_modelo,
    mensagem_modelo: cfg.mensagem_modelo,
    atualizado_em: new Date().toISOString(),
    atualizado_por_nome: porNome,
  })
}

// ─── Documentos por cobrar ───────────────────────────────────────────────────

const DIA = 86400000
export function diasDesde(hoje: string, data: string): number {
  return Math.floor((Date.parse(hoje) - Date.parse(data)) / DIA)
}

export type DocEmDivida = {
  movimento: MovimentoCC
  porLiquidar: number
  diasAtraso: number          // >0 vencido há N dias; <=0 ainda por vencer
  clienteEmail: string | null
  nPedidos: number
  ultimoPedido: string | null // ISO do último pedido enviado
}

// Todas as faturas de clientes com valor por liquidar, com o contacto do cliente
// e o histórico de pedidos já enviados.
export async function listarEmDivida(hoje = hojeISO()): Promise<DocEmDivida[]> {
  const movs = (await listarMovimentos('cliente')).filter(contaParaSaldo)

  // Alocação FIFO por entidade (o que cada fatura ainda tem em aberto).
  const grupos = new Map<string, MovimentoCC[]>()
  for (const m of movs) {
    const id = entidadeIdDe(m)
    if (!id) continue
    const arr = grupos.get(id)
    if (arr) arr.push(m)
    else grupos.set(id, [m])
  }
  const emAberto: { m: MovimentoCC; porLiquidar: number }[] = []
  for (const ms of grupos.values()) {
    const aloc = alocarFaturas(ms)
    for (const m of ms) {
      const pl = aloc.get(m.id)?.porLiquidar ?? 0
      if (pl > 0.005) emAberto.push({ m, porLiquidar: pl })
    }
  }
  if (emAberto.length === 0) return []

  const [emails, pedidos] = await Promise.all([
    emailsDosClientes([...new Set(emAberto.map((e) => e.m.cliente_id).filter((v): v is string => !!v))]),
    contagemPedidos(emAberto.map((e) => e.m.id)),
  ])

  return emAberto
    .map(({ m, porLiquidar }) => ({
      movimento: m,
      porLiquidar,
      diasAtraso: m.data_vencimento ? diasDesde(hoje, m.data_vencimento) : diasDesde(hoje, m.data_documento) - 30,
      clienteEmail: (m.cliente_id && emails.get(m.cliente_id)) || null,
      nPedidos: pedidos.get(m.id)?.n ?? 0,
      ultimoPedido: pedidos.get(m.id)?.ultimo ?? m.lembrete_ultimo ?? null,
    }))
    // Ordem por defeito: emissão mais recente primeiro (ponto 1), como as
    // restantes listagens de faturas. O atraso vê-se na coluna/indicadores.
    .sort((a, b) => compararEmissaoDesc(a.movimento, b.movimento))
}

// ─── Pesquisa (nome do cliente OU valor OU nº de fatura) ─────────────────────

// Só os dígitos de um termo (para casar valores: "1.250,00 €" ~ "1250").
function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

// Verdadeiro se o documento casa o termo de pesquisa. Tolerante:
//  - nome do cliente e nº de documento: sem acentos, sem maiúsculas, por inclusão
//  - valor: dígitos do termo dentro do valor em dívida ou do total da fatura
export function correspondePesquisa(d: DocEmDivida, termo: string): boolean {
  const t = termo.trim()
  if (!t) return true
  const alvo = semAcentos(`${d.movimento.entidade_nome ?? ''} ${d.movimento.documento_ref ?? ''}`).toLowerCase()
  if (alvo.includes(semAcentos(t).toLowerCase())) return true
  const dig = soDigitos(t)
  if (dig.length >= 2) {
    for (const v of [d.porLiquidar, d.movimento.valor_debito]) {
      if (String(Math.trunc(v)).includes(dig) || Math.round(v * 100).toString().includes(dig)) return true
    }
  }
  return false
}

async function emailsDosClientes(ids: string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase.from('clientes').select('id, email').in('id', ids.slice(i, i + 500))
    for (const c of (data as { id: string; email: string | null }[]) ?? []) mapa.set(c.id, c.email)
  }
  return mapa
}

async function contagemPedidos(ids: string[]): Promise<Map<string, { n: number; ultimo: string }>> {
  const mapa = new Map<string, { n: number; ultimo: string }>()
  if (ids.length === 0) return mapa
  const { data } = await supabase
    .from('financeiro_pedidos_pagamento')
    .select('movimento_id, enviado_em, ok')
    .in('movimento_id', ids)
    .eq('ok', true)
  for (const r of (data as { movimento_id: string | null; enviado_em: string }[]) ?? []) {
    if (!r.movimento_id) continue
    const atual = mapa.get(r.movimento_id)
    if (!atual) mapa.set(r.movimento_id, { n: 1, ultimo: r.enviado_em })
    else mapa.set(r.movimento_id, { n: atual.n + 1, ultimo: r.enviado_em > atual.ultimo ? r.enviado_em : atual.ultimo })
  }
  return mapa
}

// ─── Elegibilidade para envio automático (pura: usada na app e no cron) ──────

export type CandidatoAuto = {
  lembretes_auto: boolean
  porLiquidar: number
  diasAtraso: number
  ultimoPedido: string | null
  temEmail: boolean
}

export function elegivelAuto(d: CandidatoAuto, cfg: ConfigPedidos, agora = new Date()): boolean {
  if (!cfg.lembretes_ativos || !d.lembretes_auto || !d.temEmail) return false
  if (d.porLiquidar < Math.max(0, cfg.valor_minimo)) return false
  if (d.diasAtraso < cfg.dias_apos_vencimento) return false
  if (!d.ultimoPedido) return true
  const dias = (agora.getTime() - Date.parse(d.ultimoPedido)) / DIA
  return dias >= cfg.cadencia_dias
}

// ─── Modelo do email ─────────────────────────────────────────────────────────

export type DadosPedido = {
  cliente: string
  documento: string
  valor: number
  vencimento: string | null
  diasAtraso: number
}

export function textoAtraso(dias: number): string {
  if (dias > 0) return `em atraso há ${dias} dia${dias === 1 ? '' : 's'}`
  if (dias === 0) return 'vence hoje'
  return `vence em ${-dias} dia${dias === -1 ? '' : 's'}`
}

// Substitui os marcadores {cliente} {documento} {valor} {vencimento} {atraso} {dias}.
export function preencherModelo(modelo: string, d: DadosPedido): string {
  return (modelo || '')
    .replaceAll('{cliente}', d.cliente)
    .replaceAll('{documento}', d.documento)
    .replaceAll('{valor}', formatarEuro(d.valor))
    .replaceAll('{vencimento}', formatarData(d.vencimento))
    .replaceAll('{atraso}', textoAtraso(d.diasAtraso))
    .replaceAll('{dias}', String(Math.abs(d.diasAtraso)))
}

// ─── Histórico ───────────────────────────────────────────────────────────────

export type PedidoPagamento = {
  id: string
  movimento_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  documento_ref: string | null
  valor: number
  dias_atraso: number
  destinatario: string | null
  assunto: string | null
  automatico: boolean
  ok: boolean
  erro: string | null
  enviado_em: string
  enviado_por_nome: string | null
}

export async function listarPedidos(limite = 100): Promise<PedidoPagamento[]> {
  const { data } = await supabase
    .from('financeiro_pedidos_pagamento')
    .select('*')
    .order('enviado_em', { ascending: false })
    .limit(limite)
  return (data as PedidoPagamento[]) ?? []
}

// ─── Envio manual (passa pela API: a chave de email vive no servidor) ────────

export type ResultadoEnvio = { enviados: number; falhas: number; erros: string[] }

export async function enviarPedidos(movimentoIds: string[]): Promise<ResultadoEnvio> {
  if (movimentoIds.length === 0) return { enviados: 0, falhas: 0, erros: [] }
  // O servidor revalida a sessão e o papel (admin/financeiro) antes de enviar.
  const { data: sessao } = await supabase.auth.getSession()
  const token = sessao.session?.access_token
  if (!token) return { enviados: 0, falhas: movimentoIds.length, erros: ['Sessão expirada — volta a entrar.'] }
  const r = await fetch('/api/financeiro/pedidos-pagamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ movimento_ids: movimentoIds }),
  })
  const j = (await r.json().catch(() => null)) as
    | { enviados?: number; falhas?: number; erros?: string[]; erro?: string }
    | null
  if (!r.ok || !j) return { enviados: 0, falhas: movimentoIds.length, erros: [j?.erro ?? 'Falha no envio.'] }
  return { enviados: j.enviados ?? 0, falhas: j.falhas ?? 0, erros: j.erros ?? (j.erro ? [j.erro] : []) }
}
