import { supabase } from './supabase'
import { formatarEuro } from '@/types/envioPecas'

export { formatarEuro }

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EntidadeTipo = 'cliente' | 'fornecedor'
export type TipoDocumento = 'fatura' | 'nota_credito' | 'recibo' | 'pagamento' | 'adiantamento'
export type EstadoMov = 'pendente' | 'parcial' | 'liquidado'
export type OrigemMov = 'manual' | 'keyinvoice'

// Convenção: 'fatura' aumenta o saldo (débito); os restantes reduzem (crédito).
// Saldo da entidade = Σdébito − Σcrédito → cliente>0 a receber; fornecedor>0 a pagar.
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; label: string; sentido: 'debito' | 'credito' }[] = [
  { valor: 'fatura', label: 'Fatura', sentido: 'debito' },
  { valor: 'nota_credito', label: 'Nota de crédito', sentido: 'credito' },
  { valor: 'recibo', label: 'Recibo', sentido: 'credito' },
  { valor: 'pagamento', label: 'Pagamento', sentido: 'credito' },
  { valor: 'adiantamento', label: 'Adiantamento', sentido: 'credito' },
]
export function tipoDocInfo(v: string) {
  return TIPOS_DOCUMENTO.find((t) => t.valor === v) ?? TIPOS_DOCUMENTO[0]
}

export const ESTADOS_MOV: { valor: EstadoMov; label: string; cor: string; bg: string }[] = [
  { valor: 'pendente', label: 'Pendente', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'parcial', label: 'Parcial', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'liquidado', label: 'Liquidado', cor: '#065F46', bg: '#D1FAE5' },
]
export function estadoMovInfo(v: string) {
  return ESTADOS_MOV.find((e) => e.valor === v) ?? ESTADOS_MOV[0]
}

export type MovimentoCC = {
  id: string
  entidade_tipo: EntidadeTipo
  cliente_id: string | null
  fornecedor_id: string | null
  entidade_nome: string | null
  tipo_documento: TipoDocumento
  documento_ref: string | null
  data_documento: string
  data_vencimento: string | null
  valor_debito: number
  valor_credito: number
  valor_liquidado: number
  estado: EstadoMov
  notas: string | null
  origem: OrigemMov
  keyinvoice_doc_id: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export function entidadeIdDe(m: MovimentoCC): string | null {
  return m.entidade_tipo === 'cliente' ? m.cliente_id : m.fornecedor_id
}

// ─── Leitura / escrita ───────────────────────────────────────────────────────

export async function listarMovimentos(tipo?: EntidadeTipo): Promise<MovimentoCC[]> {
  let q = supabase
    .from('financeiro_movimentos')
    .select('*')
    .order('data_documento', { ascending: true })
    .order('created_at', { ascending: true })
  if (tipo) q = q.eq('entidade_tipo', tipo)
  const { data } = await q
  return (data as MovimentoCC[]) ?? []
}

export async function movimentosDaEntidade(tipo: EntidadeTipo, id: string): Promise<MovimentoCC[]> {
  const col = tipo === 'cliente' ? 'cliente_id' : 'fornecedor_id'
  const { data } = await supabase
    .from('financeiro_movimentos')
    .select('*')
    .eq('entidade_tipo', tipo)
    .eq(col, id)
    .order('data_documento', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as MovimentoCC[]) ?? []
}

export type MovimentoInput = {
  entidade_tipo: EntidadeTipo
  cliente_id: string | null
  fornecedor_id: string | null
  entidade_nome: string | null
  tipo_documento: TipoDocumento
  documento_ref: string | null
  data_documento: string
  data_vencimento: string | null
  valor: number // valor único; débito/crédito derivam do tipo de documento
  valor_liquidado: number // só aplicável a faturas
  notas: string | null
}

export async function criarMovimento(
  input: MovimentoInput,
  criadoPor: { id: string | null; nome: string | null }
) {
  const sentido = tipoDocInfo(input.tipo_documento).sentido
  const linha = {
    entidade_tipo: input.entidade_tipo,
    cliente_id: input.entidade_tipo === 'cliente' ? input.cliente_id : null,
    fornecedor_id: input.entidade_tipo === 'fornecedor' ? input.fornecedor_id : null,
    entidade_nome: input.entidade_nome,
    tipo_documento: input.tipo_documento,
    documento_ref: input.documento_ref?.trim() || null,
    data_documento: input.data_documento,
    data_vencimento: input.data_vencimento || null,
    valor_debito: sentido === 'debito' ? input.valor : 0,
    valor_credito: sentido === 'credito' ? input.valor : 0,
    valor_liquidado: input.tipo_documento === 'fatura' ? input.valor_liquidado : 0,
    origem: 'manual' as const,
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
    notas: input.notas?.trim() || null,
  }
  return supabase.from('financeiro_movimentos').insert(linha).select().single()
}

// ─── Cálculos (saldos / aging / indicadores / extrato) ───────────────────────

const DIA = 86400000
export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}
// Dias de atraso: >0 = vencido há N dias; <=0 = ainda por vencer.
function diasAtraso(hoje: string, venc: string): number {
  return Math.floor((Date.parse(hoje) - Date.parse(venc)) / DIA)
}

// Montante por liquidar de uma fatura (0 para outros documentos).
export function porLiquidar(m: MovimentoCC): number {
  if (m.tipo_documento !== 'fatura') return 0
  return Math.max(0, m.valor_debito - m.valor_liquidado)
}

export type ResumoEntidade = {
  tipo: EntidadeTipo
  id: string
  nome: string
  saldo: number
  vencido: number
  pendentes: number
}

// Agrega os movimentos por entidade: saldo, total vencido e nº de documentos pendentes.
export function resumoEntidades(movs: MovimentoCC[], hoje = hojeISO()): ResumoEntidade[] {
  const map = new Map<string, ResumoEntidade>()
  for (const m of movs) {
    const id = entidadeIdDe(m)
    if (!id) continue
    const key = `${m.entidade_tipo}:${id}`
    let r = map.get(key)
    if (!r) {
      r = { tipo: m.entidade_tipo, id, nome: m.entidade_nome ?? '—', saldo: 0, vencido: 0, pendentes: 0 }
      map.set(key, r)
    }
    if (m.entidade_nome) r.nome = m.entidade_nome
    r.saldo += m.valor_debito - m.valor_credito
    const pl = porLiquidar(m)
    if (pl > 0) {
      r.pendentes += 1
      if (m.data_vencimento && diasAtraso(hoje, m.data_vencimento) > 0) r.vencido += pl
    }
  }
  return [...map.values()].sort((a, b) => b.saldo - a.saldo)
}

export type Aging = {
  porVencer: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90p: number
  total: number
}

// Aging das faturas por liquidar, por escalão de dias de atraso.
export function aging(movs: MovimentoCC[], hoje = hojeISO()): Aging {
  const a: Aging = { porVencer: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0 }
  for (const m of movs) {
    const pl = porLiquidar(m)
    if (pl <= 0) continue
    a.total += pl
    // Sem data de vencimento -> tratado como "por vencer".
    const d = m.data_vencimento ? diasAtraso(hoje, m.data_vencimento) : -1
    if (d <= 0) a.porVencer += pl
    else if (d <= 30) a.d0_30 += pl
    else if (d <= 60) a.d31_60 += pl
    else if (d <= 90) a.d61_90 += pl
    else a.d90p += pl
  }
  return a
}

export type Indicadores = {
  aReceber: number
  aPagar: number
  vencidoReceber: number
  vencidoPagar: number
}

export function indicadores(movs: MovimentoCC[], hoje = hojeISO()): Indicadores {
  const clientes = resumoEntidades(movs.filter((m) => m.entidade_tipo === 'cliente'), hoje)
  const forns = resumoEntidades(movs.filter((m) => m.entidade_tipo === 'fornecedor'), hoje)
  const somaPos = (arr: ResumoEntidade[]) => arr.reduce((s, r) => s + Math.max(0, r.saldo), 0)
  const somaVenc = (arr: ResumoEntidade[]) => arr.reduce((s, r) => s + r.vencido, 0)
  return {
    aReceber: somaPos(clientes),
    aPagar: somaPos(forns),
    vencidoReceber: somaVenc(clientes),
    vencidoPagar: somaVenc(forns),
  }
}

export type LinhaExtrato = MovimentoCC & { saldoAcumulado: number }

// Extrato cronológico com saldo acumulado. `movs` deve vir ordenado por data asc.
export function extrato(movs: MovimentoCC[]): LinhaExtrato[] {
  let acc = 0
  return movs.map((m) => {
    acc += m.valor_debito - m.valor_credito
    return { ...m, saldoAcumulado: acc }
  })
}

// ─── Pickers de entidade (para o registo manual) ─────────────────────────────

export type EntidadeOpc = { id: string; nome: string }

export async function listarClientesPicker(): Promise<EntidadeOpc[]> {
  const { data } = await supabase.from('clientes').select('id, nome').order('nome').limit(3000)
  return ((data as { id: string; nome: string | null }[]) ?? [])
    .filter((c) => c.nome)
    .map((c) => ({ id: c.id, nome: c.nome as string }))
}

export async function listarFornecedoresPicker(): Promise<EntidadeOpc[]> {
  const { data } = await supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome')
  return ((data as { id: string; nome: string | null }[]) ?? [])
    .filter((f) => f.nome)
    .map((f) => ({ id: f.id, nome: f.nome as string }))
}

// Formata uma data ISO (yyyy-mm-dd) para dd/mm/aaaa.
export function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return a && m && dia ? `${dia}/${m}/${a}` : d
}
