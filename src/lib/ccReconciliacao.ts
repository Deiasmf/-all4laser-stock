// ─────────────────────────────────────────────────────────────────────────────
// Reconciliação do Excel da Laserix com os nossos registos.
//
// A importação NUNCA altera dados sozinha: lê o ficheiro, normaliza as colunas
// por um mapeamento configurável (guardado em cc_contas.mapeamento_excel) e
// devolve só as divergências por número de série. As ações ficam para o ecrã de
// revisão, decididas à mão.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import type { ConsignacaoRow, MovimentoLedger } from './cc'

// ─── Mapeamento de colunas ───────────────────────────────────────────────────

// Campos canónicos que precisamos do ficheiro deles.
export const CAMPOS_EXCEL = [
  { chave: 'numero_serie', label: 'Nº de série' },
  { chave: 'modelo', label: 'Modelo' },
  { chave: 'custo', label: 'Custo declarado' },
  { chave: 'preco_venda', label: 'Preço de venda' },
  { chave: 'data_venda', label: 'Data de venda' },
  { chave: 'valor_pago', label: 'Valor pago' },
] as const

export type CampoExcel = (typeof CAMPOS_EXCEL)[number]['chave']
export type MapeamentoExcel = Partial<Record<CampoExcel, string>>

// Mapeamento por defeito (nomes prováveis do ficheiro deles; afina-se quando
// tivermos um exemplar real da Laserix).
export const MAPEAMENTO_PADRAO: MapeamentoExcel = {
  numero_serie: 'Serial Number',
  modelo: 'Model',
  custo: 'Cost',
  preco_venda: 'Sale Price',
  data_venda: 'Sale Date',
  valor_pago: 'Paid',
}

// Sugere um mapeamento a partir dos cabeçalhos do ficheiro, por parecença.
export function sugerirMapeamento(headers: string[], base?: MapeamentoExcel): MapeamentoExcel {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const pistas: Record<CampoExcel, string[]> = {
    numero_serie: ['serial', 'serie', 'sn', 'nºserie', 'numeroserie'],
    modelo: ['model', 'modelo', 'equipment', 'equipamento'],
    custo: ['cost', 'custo', 'declared', 'declarado'],
    preco_venda: ['saleprice', 'price', 'preco', 'preço', 'sold', 'venda'],
    data_venda: ['saledate', 'date', 'data', 'sold'],
    valor_pago: ['paid', 'pago', 'payment', 'pagamento', 'received', 'recebido'],
  }
  const out: MapeamentoExcel = { ...(base ?? {}) }
  for (const { chave } of CAMPOS_EXCEL) {
    if (out[chave] && headers.includes(out[chave]!)) continue
    const achado = headers.find((h) => pistas[chave].some((p) => norm(h).includes(norm(p))))
    if (achado) out[chave] = achado
  }
  return out
}

// ─── Leitura do ficheiro (xlsx/csv) ──────────────────────────────────────────

export type FicheiroLido = { headers: string[]; linhas: Record<string, unknown>[] }

// Transforma uma matriz [linha][coluna] (1ª linha = cabeçalhos) em {headers, linhas}.
function matrizParaFicheiro(matriz: unknown[][]): FicheiroLido {
  const naoVazias = matriz.filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''))
  if (naoVazias.length === 0) return { headers: [], linhas: [] }
  const headers = (naoVazias[0] as unknown[]).map((h) => String(h ?? '').trim())
  const linhas = naoVazias.slice(1).map((row) => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { if (h) obj[h] = (row as unknown[])[i] ?? null })
    return obj
  })
  return { headers: headers.filter(Boolean), linhas }
}

// Lê a primeira folha do ficheiro (.xlsx/.xls via read-excel-file — a mesma lib
// já usada na conciliação bancária; ou .csv por parsing simples). Import dinâmico
// para só carregar no cliente quando é preciso.
export async function lerFicheiro(file: File): Promise<FicheiroLido> {
  if (/\.csv$/i.test(file.name)) {
    const txt = await file.text()
    const matriz = txt.split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((c) => c.trim()))
    return matrizParaFicheiro(matriz)
  }
  const { readSheet } = await import('read-excel-file/browser')
  // Descobre os nomes das folhas sem ler dados (o erro traz a lista) e lê a 1ª.
  let nomes: string[] = []
  try {
    await readSheet(file, '__inexistente_folha_a4l__')
  } catch (e) {
    const ex = e as { name?: string; sheets?: string[] }
    if (ex?.name === 'SheetNotFoundError' && Array.isArray(ex.sheets)) nomes = ex.sheets
    else throw e
  }
  if (nomes.length === 0) throw new Error('O ficheiro não tem folhas legíveis.')
  const matriz = (await readSheet(file, nomes[0])) as unknown[][]
  return matrizParaFicheiro(matriz)
}

// ─── Normalização ────────────────────────────────────────────────────────────

export type LinhaExcel = {
  numero_serie: string
  modelo: string | null
  custo: number | null
  preco_venda: number | null
  data_venda: string | null
  valor_pago: number | null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/[^\d.,-]/g, '')
  if (!s) return null
  let n: number
  if (s.includes(',') && s.includes('.')) {
    // Ambos: assume ponto como milhares e vírgula como decimal (formato pt).
    n = Number(s.replace(/\./g, '').replace(',', '.'))
  } else {
    n = Number(s.replace(',', '.'))
  }
  return isNaN(n) ? null : n
}

function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function toData(v: unknown): string | null {
  if (v == null || v === '') return null
  // Data local (não UTC) para não deslocar o dia num fuso positivo.
  if (v instanceof Date) return ymdLocal(v)
  const s = String(v).trim()
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : ymdLocal(d)
}

export function normalizarLinhas(raw: Record<string, unknown>[], mapa: MapeamentoExcel): LinhaExcel[] {
  const col = (row: Record<string, unknown>, chave: CampoExcel) =>
    mapa[chave] ? row[mapa[chave]!] : null
  return raw
    .map((row) => ({
      numero_serie: String(col(row, 'numero_serie') ?? '').trim(),
      modelo: (col(row, 'modelo') as string) ?? null,
      custo: toNum(col(row, 'custo')),
      preco_venda: toNum(col(row, 'preco_venda')),
      data_venda: toData(col(row, 'data_venda')),
      valor_pago: toNum(col(row, 'valor_pago')),
    }))
    .filter((l) => l.numero_serie)
}

// ─── Divergências ────────────────────────────────────────────────────────────

export type TipoDivergencia =
  | 'nao_registada' | 'nao_listada' | 'custo_diferente'
  | 'venda_nao_registada' | 'preco_diferente' | 'pagamento_diferente'

export const TIPOS_DIVERGENCIA: {
  valor: TipoDivergencia; label: string; descricao: string; cor: string; bg: string
}[] = [
  { valor: 'nao_registada', label: 'Não registada', descricao: 'No ficheiro deles, não nas nossas consignações.', cor: '#9A3412', bg: '#FFEDD5' },
  { valor: 'nao_listada', label: 'Não listada', descricao: 'Máquina nossa que não aparece no ficheiro.', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'custo_diferente', label: 'Custo diferente', descricao: 'Custo declarado diverge.', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'venda_nao_registada', label: 'Venda não registada', descricao: 'Indicam venda que não temos.', cor: '#9A3412', bg: '#FFEDD5' },
  { valor: 'preco_diferente', label: 'Preço diferente', descricao: 'Preço de venda diverge.', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'pagamento_diferente', label: 'Pagamento diferente', descricao: 'Valor pago diverge do nosso ledger.', cor: '#3730A3', bg: '#E0E7FF' },
]
export function tipoDivergenciaInfo(v: string) {
  return TIPOS_DIVERGENCIA.find((t) => t.valor === v) ?? TIPOS_DIVERGENCIA[0]
}

export type Divergencia = {
  tipo: TipoDivergencia
  numero_serie: string
  modelo: string | null
  valor_deles: number | null
  valor_nosso: number | null
  estado: 'aberta' | 'resolvida'
  nota: string | null
  consignacao_id: string | null
}

const TOLERANCIA = 0.5 // diferenças abaixo disto são arredondamento, não divergência

// Compara o ficheiro (linhas normalizadas) com as nossas consignações/vendas/
// movimentos e devolve as divergências por número de série.
export function compararComExcel(
  linhas: LinhaExcel[],
  consignacoes: ConsignacaoRow[],
  movimentos: MovimentoLedger[],
): Divergencia[] {
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  const porSerie = new Map<string, ConsignacaoRow>()
  for (const cg of consignacoes) {
    const sn = norm(cg.numero_serie || cg.equipamento?.serial_number)
    if (sn) porSerie.set(sn, cg)
  }
  const divs: Divergencia[] = []
  const vistos = new Set<string>()

  for (const l of linhas) {
    const sn = norm(l.numero_serie)
    vistos.add(sn)
    const cg = porSerie.get(sn)
    if (!cg) {
      divs.push(base('nao_registada', l.numero_serie, l.modelo, l.preco_venda ?? l.custo, null, null))
      continue
    }
    // custo
    if (l.custo != null && Math.abs(l.custo - cg.custo_declarado) > TOLERANCIA) {
      divs.push(base('custo_diferente', l.numero_serie, l.modelo, l.custo, cg.custo_declarado, cg.id))
    }
    // venda
    const venda = cg.vendas?.[0] ?? null
    const temVendaDeles = l.preco_venda != null || l.data_venda != null
    if (temVendaDeles && !venda) {
      divs.push(base('venda_nao_registada', l.numero_serie, l.modelo, l.preco_venda, null, cg.id))
    } else if (venda && l.preco_venda != null && Math.abs(l.preco_venda - venda.preco_venda) > TOLERANCIA) {
      divs.push(base('preco_diferente', l.numero_serie, l.modelo, l.preco_venda, venda.preco_venda, cg.id))
    }
    // pagamento
    if (l.valor_pago != null && venda) {
      const recebido = movimentos
        .filter((m) => m.tipo === 'recebido' && m.origem_tipo === 'venda' && m.origem_id === venda.id)
        .reduce((s, m) => s + m.valor, 0)
      if (Math.abs(l.valor_pago - recebido) > TOLERANCIA) {
        divs.push(base('pagamento_diferente', l.numero_serie, l.modelo, l.valor_pago, recebido, cg.id))
      }
    }
  }

  // Máquinas nossas (ativas) que não aparecem no ficheiro.
  for (const cg of consignacoes) {
    if (cg.estado === 'cancelado' || cg.estado === 'devolvido') continue
    const sn = norm(cg.numero_serie || cg.equipamento?.serial_number)
    if (sn && !vistos.has(sn)) {
      divs.push(base('nao_listada', cg.numero_serie || cg.equipamento?.serial_number || '—',
        [cg.equipamento?.marca, cg.equipamento?.modelo].filter(Boolean).join(' ') || null,
        null, cg.custo_declarado, cg.id))
    }
  }
  return divs
}

function base(
  tipo: TipoDivergencia, numero_serie: string, modelo: string | null,
  valor_deles: number | null, valor_nosso: number | null, consignacao_id: string | null,
): Divergencia {
  return { tipo, numero_serie, modelo, valor_deles, valor_nosso, estado: 'aberta', nota: null, consignacao_id }
}

// ─── Persistência ────────────────────────────────────────────────────────────

export type Reconciliacao = {
  id: string
  conta_id: string
  data_import: string
  ficheiro_nome: string | null
  linhas_total: number | null
  divergencias: Divergencia[]
  estado: 'aberta' | 'resolvida'
  created_at: string
}

export async function obterMapeamentoConta(contaId: string): Promise<MapeamentoExcel> {
  const { data } = await supabase.from('cc_contas').select('mapeamento_excel').eq('id', contaId).maybeSingle()
  const m = (data as { mapeamento_excel: MapeamentoExcel | null } | null)?.mapeamento_excel
  return m && Object.keys(m).length ? m : { ...MAPEAMENTO_PADRAO }
}

export async function guardarMapeamento(contaId: string, mapa: MapeamentoExcel): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('cc_contas').update({ mapeamento_excel: mapa }).eq('id', contaId)
  return { error: error ? { message: error.message } : null }
}

export async function listarReconciliacoes(contaId: string): Promise<Reconciliacao[]> {
  const { data } = await supabase
    .from('cc_reconciliacoes').select('*').eq('conta_id', contaId)
    .order('data_import', { ascending: false })
  return (data ?? []) as Reconciliacao[]
}

export async function criarReconciliacao(
  contaId: string,
  dados: { ficheiro_nome: string; linhas_total: number; divergencias: Divergencia[] },
  autor: { id: string | null; nome: string | null },
): Promise<{ id: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('cc_reconciliacoes')
    .insert({
      conta_id: contaId,
      ficheiro_nome: dados.ficheiro_nome,
      linhas_total: dados.linhas_total,
      divergencias: dados.divergencias,
      estado: dados.divergencias.length === 0 ? 'resolvida' : 'aberta',
      criado_por: autor.id,
      criado_por_nome: autor.nome,
    })
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error ? { message: error.message } : null }
}

// Atualiza as divergências (notas/estado) e fecha a reconciliação quando todas
// estão resolvidas.
export async function atualizarDivergencias(
  reconId: string, divergencias: Divergencia[],
): Promise<{ error: { message: string } | null }> {
  const todasResolvidas = divergencias.every((d) => d.estado === 'resolvida')
  const { error } = await supabase
    .from('cc_reconciliacoes')
    .update({ divergencias, estado: todasResolvidas ? 'resolvida' : 'aberta' })
    .eq('id', reconId)
  return { error: error ? { message: error.message } : null }
}

// Ação de divergência: aceitar o custo deles (atualiza o custo declarado nosso).
export async function aceitarCustoDeles(
  consignacaoId: string, novoCusto: number,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('cc_consignacoes').update({ custo_declarado: novoCusto }).eq('id', consignacaoId)
  return { error: error ? { message: error.message } : null }
}
