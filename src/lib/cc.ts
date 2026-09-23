// ─────────────────────────────────────────────────────────────────────────────
// Módulo Contas Correntes (cc_*) — camada de acesso a dados.
//
// NÃO confundir com src/lib/contasCorrentes.ts (razão cliente/fornecedor do
// Keyinvoice, em /financeiro/contas-correntes). Este módulo vive em
// /contas-correntes e cobre a consignação Laserix + planos de prestações.
//
// Todos os cálculos (margem, valor devido, saldo, contravalor EUR) vivem em SQL
// (triggers/funções/views). Aqui só se lê/escreve; nunca se recalcula no cliente.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoConta = 'consignacao' | 'prestacoes' | 'mista'
export type TipoMovimento = 'esperado' | 'recebido' | 'nota_credito' | 'ajuste'

export type ContaCC = {
  id: string
  cliente_id: string | null
  nome: string
  tipo: TipoConta
  moeda: string
  taxa_contratual: number | null
  taxa_contratual_inicio: string | null
  taxa_contratual_fim: string | null
  partilha_margem_pct: number
  prazo_pagamento_dias: number
  limite_exposicao: number | null
  mapeamento_excel: Record<string, string> | null
  ativa: boolean
  notas: string | null
  created_at: string
  updated_at: string
}

// Linha da view v_cc_saldo_conta (cálculos feitos em SQL).
export type SaldoConta = {
  conta_id: string
  nome: string
  moeda: string
  saldo_moeda: number
  saldo_eur: number
  total_esperado_eur: number
  total_recebido_eur: number
  maquinas_em_stock: number
  proximo_vencimento: string | null
}

export type ContaComSaldo = ContaCC & { saldo: SaldoConta | null }

// Linha da view v_cc_extrato (o próprio movimento + saldo acumulado).
export type MovimentoLedger = {
  id: string
  conta_id: string
  tipo: TipoMovimento
  data: string
  valor: number
  moeda: string
  taxa_cambio_eur: number
  valor_eur: number | null
  origem_tipo: 'venda' | 'prestacao' | 'manual' | 'reconciliacao' | null
  origem_id: string | null
  referencia_bancaria: string | null
  fatura_keyinvoice_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
  saldo_acumulado: number
}

// ─── Constantes de apresentação ──────────────────────────────────────────────

export const TIPOS_CONTA: { valor: TipoConta; label: string }[] = [
  { valor: 'consignacao', label: 'Consignação' },
  { valor: 'prestacoes', label: 'Prestações' },
  { valor: 'mista', label: 'Mista' },
]
export function tipoContaLabel(v: string): string {
  return TIPOS_CONTA.find((t) => t.valor === v)?.label ?? v
}

// Moedas mais usadas (o campo aceita qualquer código; isto é só o picker).
export const MOEDAS = ['EUR', 'AED', 'GBP', 'USD'] as const

// Cada tipo de movimento e o seu sinal no saldo (espelha as views SQL:
// esperado/ajuste somam; recebido/nota de crédito subtraem).
export const TIPOS_MOVIMENTO: {
  valor: TipoMovimento; label: string; sinal: 1 | -1; cor: string; bg: string
}[] = [
  { valor: 'esperado', label: 'Esperado', sinal: 1, cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'recebido', label: 'Recebido', sinal: -1, cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'nota_credito', label: 'Nota de crédito', sinal: -1, cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'ajuste', label: 'Ajuste', sinal: 1, cor: '#3730A3', bg: '#E0E7FF' },
]
export function tipoMovInfo(v: string) {
  return TIPOS_MOVIMENTO.find((t) => t.valor === v) ?? TIPOS_MOVIMENTO[0]
}

// ─── Formatação ──────────────────────────────────────────────────────────────

export function formatarMoeda(v: number | null | undefined, moeda = 'EUR'): string {
  if (v == null) return '—'
  try {
    return v.toLocaleString('pt-PT', { style: 'currency', currency: moeda })
  } catch {
    // Código de moeda desconhecido → número + código à parte.
    return `${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moeda}`
  }
}

export function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

// Lista as contas com o respetivo saldo (uma query a cada; junta-se em memória).
export async function listarContas(): Promise<ContaComSaldo[]> {
  const [contasRes, saldosRes] = await Promise.all([
    supabase.from('cc_contas').select('*').order('nome'),
    supabase.from('v_cc_saldo_conta').select('*'),
  ])
  const contas = (contasRes.data ?? []) as ContaCC[]
  const saldos = (saldosRes.data ?? []) as SaldoConta[]
  const mapa = new Map(saldos.map((s) => [s.conta_id, s]))
  return contas.map((c) => ({ ...c, saldo: mapa.get(c.id) ?? null }))
}

export async function obterConta(id: string): Promise<ContaComSaldo | null> {
  const [contaRes, saldoRes] = await Promise.all([
    supabase.from('cc_contas').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_cc_saldo_conta').select('*').eq('conta_id', id).maybeSingle(),
  ])
  if (!contaRes.data) return null
  return { ...(contaRes.data as ContaCC), saldo: (saldoRes.data as SaldoConta) ?? null }
}

// Extrato cronológico (ascendente) com saldo acumulado, direto da view SQL.
export async function movimentosDaConta(contaId: string): Promise<MovimentoLedger[]> {
  const { data } = await supabase
    .from('v_cc_extrato')
    .select('*')
    .eq('conta_id', contaId)
    .order('data', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as MovimentoLedger[]
}

export type ClientePicker = { id: string; nome: string }
export async function listarClientesPicker(): Promise<ClientePicker[]> {
  const { data } = await supabase.from('clientes').select('id, nome').order('nome')
  return (data ?? []) as ClientePicker[]
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

export type NovaConta = {
  nome: string
  tipo: TipoConta
  moeda: string
  cliente_id: string | null
  partilha_margem_pct: number
  prazo_pagamento_dias: number
  taxa_contratual: number | null
  taxa_contratual_inicio: string | null
  taxa_contratual_fim: string | null
  limite_exposicao: number | null
  notas: string | null
}

export async function criarConta(
  dados: NovaConta,
  autor: { id: string | null; nome: string | null },
): Promise<{ id: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('cc_contas')
    .insert({ ...dados, criado_por: autor.id, criado_por_nome: autor.nome })
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error ? { message: error.message } : null }
}

// ─── Consignação e vendas ────────────────────────────────────────────────────

export type EstadoConsignacao = 'em_stock' | 'vendido' | 'devolvido' | 'cancelado'
export type EstadoVenda = 'registada' | 'confirmada' | 'recebida'
export type OrigemConsignacao = 'envio_direto' | 'medika_bazaar' | 'outro'
export type EntidadeFaturada = 'laserix' | 'dermamed'

export const ESTADOS_CONSIGNACAO: {
  valor: EstadoConsignacao; label: string; cor: string; bg: string
}[] = [
  { valor: 'em_stock', label: 'Em stock', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'vendido', label: 'Vendido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'devolvido', label: 'Devolvido', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#6B7280', bg: '#F3F4F6' },
]
export function estadoConsignacaoInfo(v: string) {
  return ESTADOS_CONSIGNACAO.find((e) => e.valor === v) ?? ESTADOS_CONSIGNACAO[0]
}

export const ESTADOS_VENDA: { valor: EstadoVenda; label: string; cor: string; bg: string }[] = [
  { valor: 'registada', label: 'Registada', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'confirmada', label: 'Confirmada', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'recebida', label: 'Recebida', cor: '#065F46', bg: '#D1FAE5' },
]
export function estadoVendaInfo(v: string) {
  return ESTADOS_VENDA.find((e) => e.valor === v) ?? ESTADOS_VENDA[0]
}

export const ORIGENS_CONSIGNACAO: { valor: OrigemConsignacao; label: string }[] = [
  { valor: 'envio_direto', label: 'Envio direto' },
  { valor: 'medika_bazaar', label: 'Medika Bazaar' },
  { valor: 'outro', label: 'Outro' },
]

export type Venda = {
  id: string
  consignacao_id: string
  data_venda: string
  preco_venda: number
  moeda_venda: string
  cliente_final: string | null
  taxa_cambio_custo: number | null
  custo_convertido: number | null
  margem: number | null
  valor_devido: number | null
  margem_negativa: boolean
  estado: EstadoVenda
  notas: string | null
  created_at: string
}

export type EquipRef = {
  modelo: string | null
  marca: string | null
  ano: string | null
  serial_number: string | null
  status: string | null
} | null

export type Consignacao = {
  id: string
  conta_id: string
  equipamento_id: string | null
  numero_serie: string | null
  custo_declarado: number
  moeda_custo: string
  origem: OrigemConsignacao | null
  data_envio: string | null
  estado: EstadoConsignacao
  entidade_faturada: EntidadeFaturada | null
  acessorios: string[]
  notas: string | null
  created_at: string
  updated_at: string
}

export type ConsignacaoRow = Consignacao & { equipamento: EquipRef; vendas: Venda[] }

export type EquipamentoPicker = {
  id: string
  modelo: string | null
  marca: string | null
  serial_number: string | null
  status: string | null
}

// Consignações da conta, com o equipamento e as vendas embutidos.
export async function listarConsignacoes(contaId: string): Promise<ConsignacaoRow[]> {
  const { data } = await supabase
    .from('cc_consignacoes')
    .select('*, equipamentos(modelo,marca,ano,serial_number,status), cc_vendas(*)')
    .eq('conta_id', contaId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const acessorios = Array.isArray(row.acessorios) ? (row.acessorios as string[]) : []
    return {
      ...(row as unknown as Consignacao),
      acessorios,
      equipamento: (row.equipamentos ?? null) as EquipRef,
      vendas: ((row.cc_vendas ?? []) as Venda[]),
    }
  })
}

// Equipamentos disponíveis para consignar (exclui os já ligados a uma consignação
// não cancelada, para não duplicar máquinas).
export async function listarEquipamentosPicker(): Promise<EquipamentoPicker[]> {
  const [equipRes, consRes] = await Promise.all([
    supabase.from('equipamentos').select('id, modelo, marca, serial_number, status').order('serial_number'),
    supabase.from('cc_consignacoes').select('equipamento_id').neq('estado', 'cancelado'),
  ])
  const usados = new Set(
    ((consRes.data ?? []) as { equipamento_id: string | null }[])
      .map((x) => x.equipamento_id)
      .filter(Boolean) as string[],
  )
  return ((equipRes.data ?? []) as EquipamentoPicker[]).filter((e) => !usados.has(e.id))
}

// Custo declarado sugerido pela regra de família (função SQL). n_conjuntos só
// afeta o Cynosure Elite+ com Zimmer.
export async function custoDeclaradoSugerido(
  equipamentoId: string, nConjuntos = 1,
): Promise<number | null> {
  const { data } = await supabase.rpc('cc_custo_declarado_sugerido', {
    p_equipamento_id: equipamentoId,
    p_n_conjuntos: nConjuntos,
  })
  return data == null ? null : Number(data)
}

export type NovaConsignacao = {
  conta_id: string
  equipamento_id: string | null
  numero_serie: string | null
  custo_declarado: number
  moeda_custo: string
  origem: OrigemConsignacao | null
  data_envio: string | null
  entidade_faturada: EntidadeFaturada | null
  acessorios: string[]
  notas: string | null
}

export async function criarConsignacao(
  dados: NovaConsignacao,
  autor: { id: string | null; nome: string | null },
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('cc_consignacoes')
    .insert({ ...dados, criado_por: autor.id, criado_por_nome: autor.nome })
  return { error: error ? { message: error.message } : null }
}

export type NovaVenda = {
  consignacao_id: string
  data_venda: string
  preco_venda: number
  moeda_venda: string
  cliente_final: string | null
  taxa_cambio_custo: number | null
  notas: string | null
}

// Regista a venda no estado 'registada'. O trigger SQL calcula custo convertido,
// margem e valor devido; devolvemos a linha já calculada para mostrar ao utilizador.
// Só ao confirmar (confirmarVenda) é criado o movimento esperado no ledger.
export async function registarVenda(
  dados: NovaVenda,
  autor: { id: string | null; nome: string | null },
): Promise<{ venda: Venda | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('cc_vendas')
    .insert({ ...dados, estado: 'registada', criado_por: autor.id, criado_por_nome: autor.nome })
    .select('*')
    .single()
  return { venda: (data as Venda) ?? null, error: error ? { message: error.message } : null }
}

export async function confirmarVenda(vendaId: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('cc_vendas').update({ estado: 'confirmada' }).eq('id', vendaId)
  return { error: error ? { message: error.message } : null }
}

// Apaga uma venda ainda 'registada' (ainda não entrou no ledger).
export async function eliminarVendaRegistada(vendaId: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('cc_vendas').delete().eq('id', vendaId).eq('estado', 'registada')
  return { error: error ? { message: error.message } : null }
}

export async function marcarDevolucao(consignacaoId: string): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('cc_consignacoes').update({ estado: 'devolvido' }).eq('id', consignacaoId)
  return { error: error ? { message: error.message } : null }
}

// ─── Planos de pagamento e prestações ────────────────────────────────────────

export type Periodicidade = 'mensal' | 'trimestral' | 'custom'
export type EstadoPlano = 'ativo' | 'concluido' | 'cancelado'
export type EstadoPrestacao = 'pendente' | 'paga' | 'parcial' | 'atrasada'

export const PERIODICIDADES: { valor: Periodicidade; label: string }[] = [
  { valor: 'mensal', label: 'Mensal' },
  { valor: 'trimestral', label: 'Trimestral' },
  { valor: 'custom', label: 'Personalizada' },
]

export const ESTADOS_PRESTACAO: {
  valor: EstadoPrestacao; label: string; cor: string; bg: string
}[] = [
  { valor: 'pendente', label: 'Pendente', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'paga', label: 'Paga', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'parcial', label: 'Parcial', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'atrasada', label: 'Atrasada', cor: '#B91C1C', bg: '#FEE2E2' },
]
export function estadoPrestacaoInfo(v: string) {
  return ESTADOS_PRESTACAO.find((e) => e.valor === v) ?? ESTADOS_PRESTACAO[0]
}

export type Prestacao = {
  id: string
  plano_id: string
  numero: number
  data_vencimento: string
  valor: number
  moeda: string
  estado: EstadoPrestacao
  movimento_id: string | null
  data_pagamento: string | null
  created_at: string
}

export type Plano = {
  id: string
  conta_id: string
  descricao: string | null
  equipamento_id: string | null
  valor_total: number
  moeda: string
  n_prestacoes: number
  periodicidade: Periodicidade
  data_inicio: string
  entrada: number | null
  estado: EstadoPlano
  notas: string | null
  created_at: string
  updated_at: string
}

export type PlanoRow = Plano & { prestacoes: Prestacao[] }

// Planos da conta com as prestações (e a data de pagamento de cada uma, do
// movimento recebido ligado).
export async function listarPlanos(contaId: string): Promise<PlanoRow[]> {
  const { data } = await supabase
    .from('cc_planos_pagamento')
    .select('*, cc_prestacoes(*, cc_movimentos(data))')
    .eq('conta_id', contaId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const prestacoes = ((row.cc_prestacoes ?? []) as Record<string, unknown>[])
      .map((p) => ({
        ...(p as unknown as Prestacao),
        data_pagamento: (p.cc_movimentos as { data: string } | null)?.data ?? null,
      }))
      .sort((a, b) => a.numero - b.numero)
    return { ...(row as unknown as Plano), prestacoes }
  })
}

export type NovoPlano = {
  conta_id: string
  descricao: string | null
  equipamento_id: string | null
  valor_total: number
  moeda: string
  n_prestacoes: number
  periodicidade: Periodicidade
  data_inicio: string
  entrada: number | null
  notas: string | null
}

export async function criarPlano(
  dados: NovoPlano,
  autor: { id: string | null; nome: string | null },
): Promise<{ id: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('cc_planos_pagamento')
    .insert({ ...dados, criado_por: autor.id, criado_por_nome: autor.nome })
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error ? { message: error.message } : null }
}

// Gera as prestações do plano (função SQL cc_gerar_prestacoes); devolve o total.
export async function gerarPrestacoes(planoId: string): Promise<{ count: number; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('cc_gerar_prestacoes', { p_plano_id: planoId })
  return { count: Number(data ?? 0), error: error ? { message: error.message } : null }
}

// Edita uma prestação à mão (valor/vencimento) e alinha o movimento esperado
// que lhe corresponde, para o ledger não divergir.
export async function editarPrestacao(
  prestacaoId: string,
  dados: { valor: number; data_vencimento: string },
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('cc_prestacoes')
    .update({ valor: dados.valor, data_vencimento: dados.data_vencimento })
    .eq('id', prestacaoId)
  if (error) return { error: { message: error.message } }
  await supabase
    .from('cc_movimentos')
    .update({ valor: dados.valor, data: dados.data_vencimento })
    .eq('origem_tipo', 'prestacao')
    .eq('origem_id', prestacaoId)
    .eq('tipo', 'esperado')
  return { error: null }
}

export type RecebimentoPrestacao = {
  valor: number
  moeda: string
  taxa: number
  referencia: string | null
  fatura_keyinvoice_id: string | null
  data: string
}

// Regista um recebimento ligado a uma prestação (função SQL cc_registar_recebimento):
// cria o movimento recebido e muda a prestação para paga/parcial.
export async function registarRecebimentoPrestacao(
  prestacaoId: string, r: RecebimentoPrestacao,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('cc_registar_recebimento', {
    p_origem_tipo: 'prestacao',
    p_origem_id: prestacaoId,
    p_valor: r.valor,
    p_moeda: r.moeda,
    p_taxa: r.taxa,
    p_ref: r.referencia,
    p_fatura_kv: r.fatura_keyinvoice_id,
    p_data: r.data,
  })
  return { error: error ? { message: error.message } : null }
}

// Marca como atrasadas as prestações vencidas e pendentes (função SQL). O mesmo
// corre diariamente pelo cron; aqui serve o botão manual.
export async function marcarAtrasos(): Promise<{ count: number; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('cc_marcar_atrasos')
  return { count: Number(data ?? 0), error: error ? { message: error.message } : null }
}

export type NovoMovimento = {
  conta_id: string
  tipo: TipoMovimento
  data: string
  valor: number
  moeda: string
  taxa_cambio_eur: number
  referencia_bancaria: string | null
  notas: string | null
}

// Movimento manual no ledger (origem "manual"). O valor_eur é calculado pelo
// trigger cc_movimentos_eur a partir de valor / taxa_cambio_eur.
export async function criarMovimentoManual(
  dados: NovoMovimento,
  autor: { id: string | null; nome: string | null },
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('cc_movimentos').insert({
    ...dados,
    origem_tipo: 'manual',
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  })
  return { error: error ? { message: error.message } : null }
}
