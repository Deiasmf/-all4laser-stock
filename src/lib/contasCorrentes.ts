import { supabase } from './supabase'
import { formatarEuro } from '@/types/envioPecas'
import { categorizar, type CategoriaDoc } from './categorizacaoFinanceira'

export { formatarEuro }

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EntidadeTipo = 'cliente' | 'fornecedor'
export type TipoDocumento =
  | 'fatura' | 'pro_forma' | 'nota_credito' | 'recibo' | 'pagamento' | 'adiantamento'
export type EstadoMov = 'pendente' | 'parcial' | 'liquidado'
export type OrigemMov = 'manual' | 'keyinvoice'

// Convenção: 'fatura' aumenta o saldo (débito); os restantes reduzem (crédito).
// Saldo da entidade = Σdébito − Σcrédito → cliente>0 a receber; fornecedor>0 a pagar.
// A pró-forma é a exceção: guarda-se o valor no débito, mas NÃO conta para o
// saldo (não é documento fiscal — é uma proposta que pode nunca ser faturada).
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; label: string; sentido: 'debito' | 'credito' }[] = [
  { valor: 'fatura', label: 'Fatura', sentido: 'debito' },
  { valor: 'pro_forma', label: 'Pró-forma', sentido: 'debito' },
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
  descricao: string | null
  categoria: string | null            // chave da categoria de topo; null = por classificar
  subcategoria_id: string | null      // subcategoria opcional (financeiro_subcategorias)
  categoria_manual: boolean           // true = definida à mão (a reimportação respeita)
  categoria_auto: boolean             // true = pré-categorizada pelo defeito do cliente, por rever
  data_pagamento: string | null
  metodo_pagamento: string | null
  afeta_saldo: boolean                // false nas pró-formas
  lembretes_auto: boolean             // pedidos de pagamento automáticos ligados
  lembrete_ultimo: string | null
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

// ─── Ordenação por emissão (data + nº do documento) ──────────────────────────
// A referência ("FT 2026/1", "FT2026/101", "FTA 2026/9") divide-se em SÉRIE
// (tudo menos a última sequência de dígitos) e SEQUÊNCIA (o último número). A
// sequência tem de ser comparada como NÚMERO — senão "FT2026/9" viria depois de
// "FT2026/10" (ordenação alfabética). Documentos sem nº vão para o fim.
export function parseNumeroDoc(ref: string | null | undefined): { serie: string; seq: number } {
  const s = (ref ?? '').trim()
  const m = s.match(/(\d+)\s*$/)
  if (!m) return { serie: s.toLowerCase(), seq: -1 }
  const seq = Number(m[1])
  const serie = s.slice(0, m.index).replace(/[\s/–-]+$/, '').trim().toLowerCase()
  return { serie, seq: isNaN(seq) ? -1 : seq }
}

// Chaves mínimas para ordenar por emissão (serve movimentos, comissões, etc.).
export type OrdenavelPorEmissao = {
  documento_ref: string | null
  data_documento: string | null
  created_at: string
}

// Comparador por defeito das listagens de faturas: emissão mais recente primeiro
// (data desc; dentro da mesma data, série igual → nº numérico desc). Estável por
// created_at. Usar com [...arr].sort(compararEmissaoDesc).
export function compararEmissaoDesc(a: OrdenavelPorEmissao, b: OrdenavelPorEmissao): number {
  const dd = (b.data_documento ?? '').localeCompare(a.data_documento ?? '')
  if (dd !== 0) return dd
  const na = parseNumeroDoc(a.documento_ref)
  const nb = parseNumeroDoc(b.documento_ref)
  if (na.serie === nb.serie && na.seq !== nb.seq) return nb.seq - na.seq
  if (na.serie !== nb.serie) return na.serie.localeCompare(nb.serie)
  return (b.created_at ?? '').localeCompare(a.created_at ?? '')
}

// Variante ascendente para o extrato (conta corrente), onde o saldo é acumulado
// e a leitura tem de ser cronológica; o nº serve de desempate numérico crescente.
export function compararEmissaoAsc(a: OrdenavelPorEmissao, b: OrdenavelPorEmissao): number {
  return -compararEmissaoDesc(a, b)
}

// A pró-forma aparece no extrato mas não mexe no saldo nem no aging.
export function contaParaSaldo(m: MovimentoCC): boolean {
  return m.tipo_documento !== 'pro_forma' && m.afeta_saldo !== false
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
  return ((data as MovimentoCC[]) ?? []).sort(compararEmissaoAsc)
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
  return ((data as MovimentoCC[]) ?? []).sort(compararEmissaoAsc)
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
  descricao?: string | null
  categoria?: CategoriaDoc | null
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
    descricao: input.descricao?.trim() || null,
    categoria: input.categoria ?? categorizar(input.descricao, input.documento_ref, input.notas),
    categoria_manual: !!input.categoria,
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
  const movs = movsEntidade.filter(contaParaSaldo)
  const faturas = movs
    .filter((m) => m.tipo_documento === 'fatura')
    .slice()
    .sort((a, b) =>
      a.data_documento < b.data_documento ? -1
      : a.data_documento > b.data_documento ? 1
      : a.created_at < b.created_at ? -1 : 1
    )
  let pool = movs.reduce((s, m) => s + (m.tipo_documento === 'fatura' ? 0 : m.valor_credito), 0)
  const out = new Map<string, AlocFatura>()
  for (const f of faturas) {
    // Liquidação confirmada à mão na própria fatura (campo de pagamento);
    // o que sobrar é coberto pelos créditos por ordem cronológica.
    const manual = Math.min(Math.max(0, f.valor_liquidado ?? 0), f.valor_debito)
    const aloc = Math.min(pool, Math.max(0, f.valor_debito - manual))
    pool -= aloc
    const liquidado = manual + aloc
    const porLiq = Math.max(0, f.valor_debito - liquidado)
    const estado: EstadoMov = liquidado <= 0 ? 'pendente' : porLiq <= 0 ? 'liquidado' : 'parcial'
    out.set(f.id, { liquidado, porLiquidar: porLiq, estado })
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
    const saldo = ms.filter(contaParaSaldo).reduce((s, m) => s + m.valor_debito - m.valor_credito, 0)
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
    if (contaParaSaldo(m)) acc += m.valor_debito - m.valor_credito
    if (m.tipo_documento === 'pro_forma') {
      // Fora do saldo: o estado é o do próprio documento (pagamento confirmado à mão).
      const porLiq = Math.max(0, m.valor_debito - (m.valor_liquidado ?? 0))
      return { ...m, saldoAcumulado: acc, estadoCalc: m.estado, porLiquidarCalc: porLiq }
    }
    const a = m.tipo_documento === 'fatura' ? aloc.get(m.id) ?? null : null
    return { ...m, saldoAcumulado: acc, estadoCalc: a ? a.estado : null, porLiquidarCalc: a ? a.porLiquidar : 0 }
  })
}

// ─── Pagamento, classificação e lembretes (escrita pontual) ──────────────────

// Confirma o pagamento total de uma fatura/pró-forma: liquida o valor do
// documento e regista a data/método. O trigger da BD acerta o estado.
export async function marcarPago(
  m: MovimentoCC,
  opts: { data?: string | null; metodo?: string | null } = {}
) {
  return supabase
    .from('financeiro_movimentos')
    .update({
      valor_liquidado: m.valor_debito,
      data_pagamento: opts.data || hojeISO(),
      metodo_pagamento: opts.metodo?.trim() || null,
    })
    .eq('id', m.id)
}

// Retira a confirmação de pagamento (volta a pendente/parcial pela alocação).
export async function marcarPorPagar(id: string) {
  return supabase
    .from('financeiro_movimentos')
    .update({ valor_liquidado: 0, data_pagamento: null, metodo_pagamento: null })
    .eq('id', id)
}

// Liquidação parcial (ex.: pagamento a conta confirmado no banco).
export async function registarLiquidacaoParcial(id: string, valor: number) {
  return supabase
    .from('financeiro_movimentos')
    .update({ valor_liquidado: Math.max(0, valor), data_pagamento: hojeISO() })
    .eq('id', id)
}

// Classificação à mão: fixa a categoria para a reimportação não a sobrepor.
export async function definirCategoria(id: string, categoria: CategoriaDoc | null) {
  return supabase
    .from('financeiro_movimentos')
    .update({ categoria, categoria_manual: categoria !== null })
    .eq('id', id)
}

// Liga/desliga os pedidos de pagamento automáticos de um documento.
export async function definirLembretesAuto(ids: string[], ativo: boolean) {
  if (ids.length === 0) return { error: null }
  return supabase.from('financeiro_movimentos').update({ lembretes_auto: ativo }).in('id', ids)
}

// ─── Pickers de entidade (para o registo manual) ─────────────────────────────

export type EntidadeOpc = { id: string; nome: string; pais?: string | null; cidade?: string | null }

export async function listarClientesPicker(): Promise<EntidadeOpc[]> {
  const { data } = await supabase.from('clientes').select('id, nome, pais, cidade').order('nome').limit(3000)
  return ((data as { id: string; nome: string | null; pais: string | null; cidade: string | null }[]) ?? [])
    .filter((c) => c.nome)
    .map((c) => ({ id: c.id, nome: c.nome as string, pais: c.pais, cidade: c.cidade }))
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
