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
  ficheiro_caminho: string | null
  ficheiro_nome: string | null
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

// Agrupa os movimentos por entidade (chave tipo:id).
function agruparPorEntidade(movs: MovimentoCC[]): Map<string, MovimentoCC[]> {
  const g = new Map<string, MovimentoCC[]>()
  for (const m of movs) {
    const id = entidadeIdDe(m)
    if (!id) continue
    const k = `${m.entidade_tipo}:${id}`
    const arr = g.get(k)
    if (arr) arr.push(m)
    else g.set(k, [m])
  }
  return g
}

// Alocação FIFO: os créditos (recibos/pagamentos/notas de crédito/adiantamentos)
// são distribuídos pelas faturas por ordem cronológica (mais antigas primeiro).
// Devolve, por id de fatura, o valor liquidado, o que falta e o estado derivado.
// Assim o saldo (Σdébito−Σcrédito) e o aging (Σ por liquidar) ficam sempre
// coerentes, sem dupla contagem entre "valor liquidado" e movimentos de crédito.
export type AlocFatura = { liquidado: number; porLiquidar: number; estado: EstadoMov }

export function alocarFaturas(movsEntidade: MovimentoCC[]): Map<string, AlocFatura> {
  const faturas = movsEntidade
    .filter((m) => m.tipo_documento === 'fatura')
    .slice()
    .sort((a, b) =>
      a.data_documento < b.data_documento ? -1
      : a.data_documento > b.data_documento ? 1
      : a.created_at < b.created_at ? -1 : 1
    )
  let pool = movsEntidade.reduce((s, m) => s + (m.tipo_documento === 'fatura' ? 0 : m.valor_credito), 0)
  const out = new Map<string, AlocFatura>()
  for (const f of faturas) {
    const aloc = Math.min(pool, f.valor_debito)
    pool -= aloc
    const porLiq = Math.max(0, f.valor_debito - aloc)
    const estado: EstadoMov = aloc <= 0 ? 'pendente' : porLiq <= 0 ? 'liquidado' : 'parcial'
    out.set(f.id, { liquidado: aloc, porLiquidar: porLiq, estado })
  }
  return out
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
  const res: ResumoEntidade[] = []
  for (const ms of agruparPorEntidade(movs).values()) {
    const tipo = ms[0].entidade_tipo
    const id = entidadeIdDe(ms[0]) as string
    const nome = ms.find((m) => m.entidade_nome)?.entidade_nome ?? '—'
    const saldo = ms.reduce((s, m) => s + m.valor_debito - m.valor_credito, 0)
    const aloc = alocarFaturas(ms)
    let vencido = 0
    let pendentes = 0
    for (const m of ms) {
      if (m.tipo_documento !== 'fatura') continue
      const a = aloc.get(m.id)
      if (!a || a.porLiquidar <= 0) continue
      pendentes += 1
      if (m.data_vencimento && diasAtraso(hoje, m.data_vencimento) > 0) vencido += a.porLiquidar
    }
    res.push({ tipo, id, nome, saldo, vencido, pendentes })
  }
  return res.sort((a, b) => b.saldo - a.saldo)
}

export type Aging = {
  porVencer: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90p: number
  total: number
}

// Aging das faturas por liquidar (após alocação FIFO), por escalão de dias de atraso.
export function aging(movs: MovimentoCC[], hoje = hojeISO()): Aging {
  const a: Aging = { porVencer: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0 }
  for (const ms of agruparPorEntidade(movs).values()) {
    const aloc = alocarFaturas(ms)
    for (const m of ms) {
      if (m.tipo_documento !== 'fatura') continue
      const pl = aloc.get(m.id)?.porLiquidar ?? 0
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

export type LinhaExtrato = MovimentoCC & {
  saldoAcumulado: number
  estadoCalc: EstadoMov | null // estado da fatura após alocação (null para outros docs)
  porLiquidarCalc: number
}

// Extrato cronológico com saldo acumulado. Para uso na ficha de UMA entidade
// (movs de uma só entidade). O estado das faturas vem da alocação FIFO.
export function extrato(movs: MovimentoCC[]): LinhaExtrato[] {
  const aloc = alocarFaturas(movs)
  let acc = 0
  return movs.map((m) => {
    acc += m.valor_debito - m.valor_credito
    const a = m.tipo_documento === 'fatura' ? aloc.get(m.id) ?? null : null
    return { ...m, saldoAcumulado: acc, estadoCalc: a ? a.estado : null, porLiquidarCalc: a ? a.porLiquidar : 0 }
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
