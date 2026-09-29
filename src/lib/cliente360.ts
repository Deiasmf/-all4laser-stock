import { supabase } from './supabase'
import {
  movimentosDaEntidade, resumoEntidades, extrato, aging,
  type LinhaExtrato, type ResumoEntidade, type Aging,
} from './contasCorrentes'

// Agregação da página de Cliente 360º. Não cria conteúdo — só lê dos módulos
// existentes, por cliente_id (e por nome nas peças/equipamentos, que ligam por
// texto). Cada função devolve o resumo de uma secção.

// ─── Financeiro (reutiliza a conta corrente) ─────────────────────────────────
export type FinanceiroCliente = { resumo: ResumoEntidade | null; aging: Aging; extrato: LinhaExtrato[] }
export async function carregarFinanceiroCliente(clienteId: string): Promise<FinanceiroCliente> {
  const movs = await movimentosDaEntidade('cliente', clienteId)
  return { resumo: resumoEntidades(movs)[0] ?? null, aging: aging(movs), extrato: extrato(movs) }
}

// ─── Envios de peças ─────────────────────────────────────────────────────────
export type EnvioResumo = {
  id: string; numero: string | null; estado: string | null
  transportadora: string | null; tracking_numero: string | null; awb_numero: string | null
  carta_porte_url: string | null; expedido_em: string | null; entregue_em: string | null; created_at: string
}
export async function carregarEnvios(clienteId: string): Promise<EnvioResumo[]> {
  const { data } = await supabase
    .from('envios_pecas')
    .select('id, numero, estado, transportadora, tracking_numero, awb_numero, carta_porte_url, expedido_em, entregue_em, created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  return (data as EnvioResumo[]) ?? []
}

// ─── Tracking (Ship24) ───────────────────────────────────────────────────────
export type TrackingResumo = {
  id: string; tracking_number: string | null; awb: string | null; carrier_nome: string | null
  direcao: string | null; descricao_conteudo: string | null; estado: string | null
  last_status_milestone: string | null; last_event_descricao: string | null
  data_expedicao: string | null; entrega_prevista: string | null; entrega_efetiva: string | null
  created_at: string
}
// Em trânsito = ainda sem entrega efetiva e não concluído/cancelado.
export function emTransito(t: TrackingResumo): boolean {
  if (t.entrega_efetiva) return false
  const e = (t.last_status_milestone || t.estado || '').toLowerCase()
  return !/entreg|delivered|conclu|cancel/.test(e)
}
export async function carregarTracking(clienteId: string): Promise<TrackingResumo[]> {
  const { data } = await supabase
    .from('shipments_tracking')
    .select('id, tracking_number, awb, carrier_nome, direcao, descricao_conteudo, estado, last_status_milestone, last_event_descricao, data_expedicao, entrega_prevista, entrega_efetiva, created_at')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return (data as TrackingResumo[]) ?? []
}

// ─── Alugueres (ativos + passados) ───────────────────────────────────────────
export type AluguerResumo = {
  id: string; modelo: string | null; serial_number: string | null; tipo_aluguer: string | null
  data_entrega: string | null; data_recolha: string | null; nao_faturar: boolean | null
}
export async function carregarAlugueres(clienteId: string): Promise<AluguerResumo[]> {
  const { data } = await supabase
    .from('alugueres')
    .select('id, modelo, serial_number, tipo_aluguer, data_entrega, data_recolha, nao_faturar')
    .eq('cliente_id', clienteId)
    .order('data_entrega', { ascending: false })
  return (data as AluguerResumo[]) ?? []
}

// ─── Equipamentos do cliente (por destino texto) ─────────────────────────────
export type EquipamentoResumo = {
  id: string; modelo: string | null; marca: string | null; serial_number: string | null
  status: string | null; data_saida: string | null; preco_venda: number | null
}
export async function carregarEquipamentos(nome: string): Promise<EquipamentoResumo[]> {
  const n = nome.trim()
  if (!n) return []
  const { data } = await supabase
    .from('equipamentos')
    .select('id, modelo, marca, serial_number, status, data_saida, preco_venda')
    .ilike('destino', n)
    .order('data_saida', { ascending: false, nullsFirst: false })
    .limit(500)
  return (data as EquipamentoResumo[]) ?? []
}

// ─── Saldo de peças (por PARCEIRO/entidade, quando o nome bate) ───────────────
export type PecaSaldo = {
  peca: string | null; total_enviado: number | null; total_recebido: number | null
  em_reparacao: number | null; saldo: number | null; em_reparacao_desde: string | null
}
export async function carregarPecasParceiro(nome: string): Promise<PecaSaldo[]> {
  const n = nome.trim()
  if (!n) return []
  const { data } = await supabase
    .from('entity_parts_balance')
    .select('peca, total_enviado, total_recebido, em_reparacao, saldo, em_reparacao_desde')
    .eq('entidade', n)
    .order('saldo', { ascending: true })
  return (data as PecaSaldo[]) ?? []
}

// ─── Notas internas (a única secção com escrita própria) ─────────────────────
export type ClienteNota = { id: string; cliente_id: string; texto: string; autor_id: string | null; autor_nome: string | null; created_at: string }
export async function listarNotasCliente(clienteId: string): Promise<ClienteNota[]> {
  const { data } = await supabase
    .from('cliente_notas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  return (data as ClienteNota[]) ?? []
}
export async function criarNotaCliente(clienteId: string, texto: string, autor: { id: string | null; nome: string | null }) {
  return supabase.from('cliente_notas').insert({
    cliente_id: clienteId, texto: texto.trim(), autor_id: autor.id, autor_nome: autor.nome,
  }).select().single()
}
export async function apagarNotaCliente(id: string) {
  return supabase.from('cliente_notas').delete().eq('id', id)
}

// ─── Indicadores de topo (composto) ──────────────────────────────────────────
export type Indicadores360 = {
  saldoCC: number
  vencido: number
  enviosTransito: number
  saldoPecas: number | null
  alugueresAtivos: number
  ultimaInteracao: string | null
}
