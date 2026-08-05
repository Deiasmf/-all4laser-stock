import { supabase } from './supabase'
import type {
  FreightForwarder, ForwarderGroup, StandardBox, FreightRequest, CargoLine,
  FreightRecipient, FreightQuote, FreightEmailTemplate, FreightSettings,
  IdiomaFreight, TipoTransporte, EstadoPedido,
} from '@/types/freight'
import { saudacaoPara } from '@/types/freight'

// Camada de dados do módulo Cotações de Transporte.
// RLS na BD: só admin + administrativo (has_administrativo_access()).

export const BUCKET_FREIGHT = 'freight-quotes'

// ─── Transitários (freight_forwarders) ───────────────────────────────────────
export type ForwarderInput = {
  nome: string
  pessoa_contacto: string | null
  emails: string[]
  telefone: string | null
  pais: string | null
  notas: string | null
  ativo: boolean
  fornecedor_id: string | null
}

export function forwarderVazio(): ForwarderInput {
  return { nome: '', pessoa_contacto: null, emails: [], telefone: null, pais: 'Portugal', notas: null, ativo: true, fornecedor_id: null }
}

export async function listarForwarders(soAtivos = false): Promise<FreightForwarder[]> {
  let q = supabase.from('freight_forwarders').select('*').order('nome')
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as FreightForwarder[]) ?? []
}

function limparEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))))
}

function limparForwarder(input: ForwarderInput) {
  const t = (v: string | null) => (v && v.trim() !== '' ? v.trim() : null)
  return {
    nome: input.nome.trim(),
    pessoa_contacto: t(input.pessoa_contacto),
    emails: limparEmails(input.emails),
    telefone: t(input.telefone),
    pais: t(input.pais),
    notas: t(input.notas),
    ativo: input.ativo,
    fornecedor_id: input.fornecedor_id,
  }
}

export async function criarForwarder(input: ForwarderInput) {
  return supabase.from('freight_forwarders').insert(limparForwarder(input)).select().single()
}
export async function atualizarForwarder(id: string, input: ForwarderInput) {
  return supabase.from('freight_forwarders').update({ ...limparForwarder(input), updated_at: new Date().toISOString() }).eq('id', id).select().single()
}
export async function eliminarForwarder(id: string) {
  return supabase.from('freight_forwarders').delete().eq('id', id)
}

// ─── Grupos (forwarder_groups + membros N:N) ─────────────────────────────────
export type GroupInput = { nome: string; idioma: IdiomaFreight; notas: string | null; ativo: boolean }

export async function listarGrupos(soAtivos = false): Promise<ForwarderGroup[]> {
  let q = supabase.from('forwarder_groups').select('*').order('nome')
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as ForwarderGroup[]) ?? []
}
export async function criarGrupo(input: GroupInput) {
  return supabase.from('forwarder_groups').insert({ ...input, notas: input.notas?.trim() || null, nome: input.nome.trim() }).select().single()
}
export async function atualizarGrupo(id: string, input: GroupInput) {
  return supabase.from('forwarder_groups').update({ ...input, notas: input.notas?.trim() || null, nome: input.nome.trim(), updated_at: new Date().toISOString() }).eq('id', id).select().single()
}
export async function eliminarGrupo(id: string) {
  return supabase.from('forwarder_groups').delete().eq('id', id)
}

export async function membrosDoGrupo(groupId: string): Promise<string[]> {
  const { data } = await supabase.from('forwarder_group_members').select('forwarder_id').eq('group_id', groupId)
  return ((data as { forwarder_id: string }[]) ?? []).map((r) => r.forwarder_id)
}
export async function adicionarMembro(groupId: string, forwarderId: string) {
  return supabase.from('forwarder_group_members').upsert({ group_id: groupId, forwarder_id: forwarderId })
}
export async function removerMembro(groupId: string, forwarderId: string) {
  return supabase.from('forwarder_group_members').delete().eq('group_id', groupId).eq('forwarder_id', forwarderId)
}
export async function forwardersDoGrupo(groupId: string, soAtivos = true): Promise<FreightForwarder[]> {
  const ids = await membrosDoGrupo(groupId)
  if (ids.length === 0) return []
  let q = supabase.from('freight_forwarders').select('*').in('id', ids).order('nome')
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as FreightForwarder[]) ?? []
}

// ─── Caixas standard (standard_boxes) ────────────────────────────────────────
export type BoxInput = {
  nome: string
  int_c: number | null; int_l: number | null; int_a: number | null
  ext_c: number; ext_l: number; ext_a: number
  peso_tipico: number | null
  notas: string | null
  ativo: boolean
  ordem: number
}
export function boxVazia(): BoxInput {
  return { nome: '', int_c: null, int_l: null, int_a: null, ext_c: 0, ext_l: 0, ext_a: 0, peso_tipico: null, notas: null, ativo: true, ordem: 0 }
}
export async function listarBoxes(soAtivas = false): Promise<StandardBox[]> {
  let q = supabase.from('standard_boxes').select('*').order('ordem').order('nome')
  if (soAtivas) q = q.eq('ativo', true)
  const { data } = await q
  return (data as StandardBox[]) ?? []
}
export async function criarBox(input: BoxInput) {
  return supabase.from('standard_boxes').insert({ ...input, nome: input.nome.trim(), notas: input.notas?.trim() || null }).select().single()
}
export async function atualizarBox(id: string, input: BoxInput) {
  return supabase.from('standard_boxes').update({ ...input, nome: input.nome.trim(), notas: input.notas?.trim() || null, updated_at: new Date().toISOString() }).eq('id', id).select().single()
}
export async function eliminarBox(id: string) {
  return supabase.from('standard_boxes').delete().eq('id', id)
}

// ─── Pedidos (freight_quote_requests) ────────────────────────────────────────
export type FiltroPedidos = { estado?: EstadoPedido; tipo?: TipoTransporte; procura?: string }

export async function listarPedidos(f: FiltroPedidos = {}): Promise<FreightRequest[]> {
  let q = supabase.from('freight_quote_requests').select('*').order('created_at', { ascending: false })
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.tipo) q = q.eq('tipo_transporte', f.tipo)
  if (f.procura && f.procura.trim()) {
    const t = f.procura.trim()
    q = q.or(`numero.ilike.%${t}%,destino_pais.ilike.%${t}%,destino_cidade_cp.ilike.%${t}%,assunto_email.ilike.%${t}%`)
  }
  const { data } = await q
  return (data as FreightRequest[]) ?? []
}

export async function obterPedido(id: string) {
  return supabase.from('freight_quote_requests').select('*').eq('id', id).single()
}

// Campos editáveis do pedido (tudo menos numero/estado/fecho/created).
export type PedidoInput = Omit<FreightRequest,
  'id' | 'numero' | 'estado' | 'vencedor_forwarder_id' | 'fechado_em' | 'created_by' | 'created_at' | 'updated_at'>

export function pedidoVazio(): PedidoInput {
  return {
    tipo_transporte: 'terrestre',
    origem_nome: 'All4laser', origem_morada: 'Rua dos Caniços 31/33', origem_cp: '2625-253',
    origem_localidade: 'Vialonga', origem_pais: 'Portugal',
    destino_pais: null, destino_cidade_cp: null, destino_morada: null,
    data_recolha: null, flexibilidade: null,
    extra_paletizar: false, extra_seguro: false, extra_plataforma: false, extra_urgente: false,
    observacoes: null, idioma: 'pt', assunto_email: null, group_id: null,
  }
}

async function proximoNumero(): Promise<string | null> {
  const { data } = await supabase.rpc('freight_next_numero')
  return (data as string) ?? null
}

export async function criarPedido(input: PedidoInput, criadoPor: string | null) {
  const numero = await proximoNumero()
  return supabase.from('freight_quote_requests')
    .insert({ ...input, numero, estado: 'rascunho', created_by: criadoPor })
    .select().single()
}

export async function atualizarPedido(id: string, patch: Partial<FreightRequest>) {
  return supabase.from('freight_quote_requests').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single()
}

export async function apagarPedido(id: string) {
  return supabase.from('freight_quote_requests').delete().eq('id', id)
}

export async function mudarEstadoPedido(id: string, estado: EstadoPedido) {
  return atualizarPedido(id, { estado })
}

// ─── Linhas de carga ─────────────────────────────────────────────────────────
export async function listarLinhas(requestId: string): Promise<CargoLine[]> {
  const { data } = await supabase.from('freight_quote_cargo_lines').select('*').eq('request_id', requestId).order('ordem')
  return (data as CargoLine[]) ?? []
}

export type LinhaInput = {
  box_id: string | null
  descricao: string | null
  ext_c: number; ext_l: number; ext_a: number
  quantidade: number
  peso_volume: number | null
}

// Substitui todas as linhas do pedido (apaga e reinsere) — simples e robusto.
export async function guardarLinhas(requestId: string, linhas: LinhaInput[]) {
  const { error: erroDel } = await supabase.from('freight_quote_cargo_lines').delete().eq('request_id', requestId)
  if (erroDel) return { error: erroDel }
  if (linhas.length === 0) return { error: null }
  const rows = linhas.map((l, i) => ({ ...l, request_id: requestId, ordem: i }))
  return supabase.from('freight_quote_cargo_lines').insert(rows)
}

// ─── Duplicar pedido (base para um novo) ─────────────────────────────────────
export async function duplicarPedido(id: string, criadoPor: string | null): Promise<{ id?: string; error?: string }> {
  const { data: orig, error } = await obterPedido(id)
  if (error || !orig) return { error: error?.message ?? 'Pedido não encontrado.' }
  const o = orig as FreightRequest
  const input: PedidoInput = {
    tipo_transporte: o.tipo_transporte,
    origem_nome: o.origem_nome, origem_morada: o.origem_morada, origem_cp: o.origem_cp,
    origem_localidade: o.origem_localidade, origem_pais: o.origem_pais,
    destino_pais: o.destino_pais, destino_cidade_cp: o.destino_cidade_cp, destino_morada: o.destino_morada,
    data_recolha: null, flexibilidade: o.flexibilidade,
    extra_paletizar: o.extra_paletizar, extra_seguro: o.extra_seguro,
    extra_plataforma: o.extra_plataforma, extra_urgente: o.extra_urgente,
    observacoes: o.observacoes, idioma: o.idioma, assunto_email: o.assunto_email, group_id: o.group_id,
  }
  const { data: novo, error: erroNovo } = await criarPedido(input, criadoPor)
  if (erroNovo || !novo) return { error: erroNovo?.message ?? 'Falha ao duplicar.' }
  const novoId = (novo as FreightRequest).id
  const linhas = await listarLinhas(id)
  if (linhas.length > 0) {
    await guardarLinhas(novoId, linhas.map((l) => ({
      box_id: l.box_id, descricao: l.descricao, ext_c: l.ext_c, ext_l: l.ext_l, ext_a: l.ext_a,
      quantidade: l.quantidade, peso_volume: l.peso_volume,
    })))
  }
  return { id: novoId }
}

// ─── Destinatários (freight_quote_recipients) ────────────────────────────────
export async function listarDestinatarios(requestId: string): Promise<FreightRecipient[]> {
  const { data } = await supabase.from('freight_quote_recipients').select('*').eq('request_id', requestId).order('created_at')
  return (data as FreightRecipient[]) ?? []
}

// Cria as linhas de destinatário (snapshot) para os transitários do grupo que
// ainda não estejam associados ao pedido. Não duplica.
export async function prepararDestinatarios(requestId: string, groupId: string): Promise<{ criados: number; error?: string }> {
  const forwarders = await forwardersDoGrupo(groupId, true)
  if (forwarders.length === 0) return { criados: 0, error: 'O grupo não tem transitários ativos.' }
  const existentes = await listarDestinatarios(requestId)
  const jaTem = new Set(existentes.map((r) => r.forwarder_id))
  const novos = forwarders.filter((f) => !jaTem.has(f.id) && f.emails.length > 0).map((f) => ({
    request_id: requestId,
    forwarder_id: f.id,
    nome_empresa: f.nome,
    emails: f.emails,
    saudacao: saudacaoPara(f),
    estado: 'pendente' as const,
  }))
  if (novos.length === 0) return { criados: 0 }
  const { error } = await supabase.from('freight_quote_recipients').insert(novos)
  if (error) return { criados: 0, error: error.message }
  return { criados: novos.length }
}

export async function removerDestinatario(id: string) {
  return supabase.from('freight_quote_recipients').delete().eq('id', id)
}

// ─── Cotações recebidas (freight_quotes) ─────────────────────────────────────
export type QuoteInput = {
  forwarder_id: string | null
  recipient_id: string | null
  valor: number | null
  moeda: string
  prazo_transito: string | null
  validade: string | null
  notas: string | null
}
export async function listarCotacoes(requestId: string): Promise<FreightQuote[]> {
  const { data } = await supabase.from('freight_quotes').select('*').eq('request_id', requestId).order('valor', { ascending: true, nullsFirst: false })
  return (data as FreightQuote[]) ?? []
}
export async function criarCotacao(requestId: string, input: QuoteInput) {
  return supabase.from('freight_quotes').insert({ ...input, request_id: requestId }).select().single()
}
export async function atualizarCotacao(id: string, input: Partial<QuoteInput>) {
  return supabase.from('freight_quotes').update(input).eq('id', id).select().single()
}
export async function eliminarCotacao(id: string) {
  return supabase.from('freight_quotes').delete().eq('id', id)
}

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}
export async function anexarPdfCotacao(quoteId: string, requestId: string, ficheiro: File): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${requestId}/${quoteId}-${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_FREIGHT).upload(caminho, ficheiro, { upsert: true })
  if (error) return { ok: false, motivo: error.message }
  const { error: erroBd } = await supabase.from('freight_quotes').update({ pdf_path: caminho }).eq('id', quoteId)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}
export async function urlPdfCotacao(pdfPath: string, segundos = 120): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_FREIGHT).createSignedUrl(pdfPath, segundos)
  return data?.signedUrl ?? null
}

// Marca uma cotação como vencedora → fecha o pedido e regista o vencedor.
export async function marcarVencedor(requestId: string, quote: FreightQuote): Promise<{ ok: boolean; motivo?: string }> {
  await supabase.from('freight_quotes').update({ escolhido: false }).eq('request_id', requestId)
  const { error: e1 } = await supabase.from('freight_quotes').update({ escolhido: true }).eq('id', quote.id)
  if (e1) return { ok: false, motivo: e1.message }
  const { error: e2 } = await atualizarPedido(requestId, {
    estado: 'fechado', vencedor_forwarder_id: quote.forwarder_id, fechado_em: new Date().toISOString(),
  })
  if (e2) return { ok: false, motivo: e2.message }
  return { ok: true }
}

// ─── Templates e configuração ────────────────────────────────────────────────
export async function obterTemplate(idioma: IdiomaFreight): Promise<FreightEmailTemplate | null> {
  const { data } = await supabase.from('freight_email_templates').select('*').eq('idioma', idioma).single()
  return (data as FreightEmailTemplate) ?? null
}
export async function listarTemplates(): Promise<FreightEmailTemplate[]> {
  const { data } = await supabase.from('freight_email_templates').select('*').order('idioma')
  return (data as FreightEmailTemplate[]) ?? []
}
export async function atualizarTemplate(idioma: IdiomaFreight, assunto_template: string, corpo_template: string) {
  return supabase.from('freight_email_templates').update({ assunto_template, corpo_template, updated_at: new Date().toISOString() }).eq('idioma', idioma)
}

export async function obterSettings(): Promise<FreightSettings | null> {
  const { data } = await supabase.from('freight_settings').select('*').eq('id', 1).single()
  return (data as FreightSettings) ?? null
}
export async function atualizarSettings(dias_uteis_alerta: number) {
  return supabase.from('freight_settings').update({ dias_uteis_alerta, updated_at: new Date().toISOString() }).eq('id', 1)
}

// ─── Contagens para a listagem (X de Y responderam, nº volumes) ──────────────
export type ContagemPedido = { destinatarios: number; enviados: number; falhados: number; respostas: number; volumes: number }
export async function contagensPedidos(): Promise<Record<string, ContagemPedido>> {
  const [{ data: recs }, { data: quotes }, { data: linhas }] = await Promise.all([
    supabase.from('freight_quote_recipients').select('request_id, estado'),
    supabase.from('freight_quotes').select('request_id'),
    supabase.from('freight_quote_cargo_lines').select('request_id, quantidade'),
  ])
  const out: Record<string, ContagemPedido> = {}
  const get = (id: string) => (out[id] ??= { destinatarios: 0, enviados: 0, falhados: 0, respostas: 0, volumes: 0 })
  for (const r of (recs as { request_id: string; estado: string }[]) ?? []) {
    const c = get(r.request_id)
    c.destinatarios++
    if (r.estado === 'enviado') c.enviados++
    if (r.estado === 'falhou') c.falhados++
  }
  for (const q of (quotes as { request_id: string }[]) ?? []) get(q.request_id).respostas++
  for (const l of (linhas as { request_id: string; quantidade: number }[]) ?? []) get(l.request_id).volumes += Number(l.quantidade) || 0
  return out
}
