import { supabase } from './supabase'
import { semAcentos } from './categorizacaoFinanceira'

// ─────────────────────────────────────────────────────────────────────────────
// CONCILIAÇÃO BANCÁRIA — Fase A: importação do extrato (Excel/CSV do BPI).
//
// O extrato BPI tem, em cada folha ("2025-2026 BPI EUR" / "... USD"), um bloco de
// metadados nas primeiras linhas e depois um cabeçalho:
//   Data Mov | Data Valor | Descrição do Movimento | Valor [Eur]/[USD] | F/R | | Observações
// O SINAL do valor manda o sentido (negativo = débito/saída, positivo = crédito/entrada).
//
// Só os CRÉDITOS entram na fila de conciliação (recebimentos de clientes). Os
// débitos e os movimentos que batem uma regra de auto-ignorar entram já como
// "ignorado". Reimportar não duplica (hash único por conta+data+valor+sentido+
// descritivo+saldo).
// ─────────────────────────────────────────────────────────────────────────────

export type Sentido = 'credito' | 'debito'
export type EstadoMov = 'por_conciliar' | 'sugerido' | 'conciliado' | 'ignorado'
export type IgnorarCategoria =
  | 'comissoes_bancarias' | 'salarios' | 'fornecedores' | 'transferencias_internas' | 'outros'

export type ContaBancaria = {
  id: string
  nome: string
  banco: string | null
  moeda: string
  ativo: boolean
}

export type MovExtrato = {
  conta_id: string
  conta_nome: string
  data: string                 // ISO yyyy-mm-dd
  data_valor: string | null
  descritivo: string
  valor: number                // absoluto
  sentido: Sentido
  saldo: number | null
  observacoes: string | null
  referencia: string | null
  hash: string
  estado: EstadoMov
  ignorar_categoria: IgnorarCategoria | null
  jaExiste: boolean            // já está na BD (não será reinserido)
}

export type RegraIgnorar = {
  ativo: boolean
  campo: string
  operador: string
  valor: string
  categoria: IgnorarCategoria
}

// ── Contas bancárias ─────────────────────────────────────────────────────────
export async function listarContas(): Promise<ContaBancaria[]> {
  const { data } = await supabase
    .from('bank_accounts')
    .select('id, nome, banco, moeda, ativo')
    .eq('ativo', true)
    .order('nome')
  return (data as ContaBancaria[]) ?? []
}

// ── Helpers de parsing (datas PT + valores com sinal) ────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }

// Aceita Date (do read-excel-file), string ISO ou dd/mm/yyyy (com hora opcional).
export function parseDataCelula(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  const t = String(v).trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const pt = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (pt) return `${pt[3]}-${pad(Number(pt[2]))}-${pad(Number(pt[1]))}`
  return null
}

// Valor COM sinal. Aceita número (read-excel-file) ou texto PT ("2.000,00", "-2.275,50").
export function parseValorComSinal(v: unknown): number {
  if (typeof v === 'number') return v
  let t = String(v ?? '').trim().replace(/[€$\s]/g, '')
  if (!t) return NaN
  const neg = /^-/.test(t) || /^\(.*\)$/.test(t)
  t = t.replace(/[()-]/g, '')
  const temVirgula = t.includes(',')
  const temPonto = t.includes('.')
  if (temVirgula && temPonto) t = t.replace(/\./g, '').replace(',', '.')
  else if (temVirgula) t = t.replace(',', '.')
  const n = Number(t)
  if (isNaN(n)) return NaN
  return neg ? -n : n
}

export function normDescritivo(s: string): string {
  return semAcentos(s).toUpperCase().replace(/\s+/g, ' ').trim()
}

function hashMovimento(conta_id: string, data: string, valor: number, sentido: Sentido, descritivo: string, saldo: number | null): string {
  return [conta_id, data, valor.toFixed(2), sentido, normDescritivo(descritivo), saldo == null ? '' : saldo.toFixed(2)].join('§')
}

// ── Deteção de colunas dentro de uma folha do extrato ────────────────────────
type Mapeamento = { dataMov: number; dataValor: number; descritivo: number; valor: number; obs: number }

function acha(cab: string[], termos: string[]): number {
  const n = cab.map((h) => semAcentos(String(h ?? '')).toLowerCase())
  return n.findIndex((h) => termos.every((t) => h.includes(t)))
}

// Procura a linha de cabeçalho (que tem "Data Mov" e "Descri..."/"Movimento").
function detetarCabecalho(linhas: unknown[][]): { headerRow: number; map: Mapeamento } | null {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const cab = (linhas[i] ?? []).map((c) => String(c ?? ''))
    const dataMov = acha(cab, ['data', 'mov'])
    const descritivo = acha(cab, ['descri'])
    const valor = acha(cab, ['valor'])
    if (dataMov >= 0 && descritivo >= 0 && valor >= 0) {
      return {
        headerRow: i,
        map: {
          dataMov,
          dataValor: acha(cab, ['data', 'valor']),
          descritivo,
          valor,
          obs: acha(cab, ['observ']),
        },
      }
    }
  }
  return null
}

// Só as folhas do extrato corrente (evita as folhas OBS gigantes e as auxiliares).
export function ehFolhaExtrato(nome: string): boolean {
  const n = nome.toLowerCase()
  return /bpi/.test(n) && /(eur|usd)/.test(n) && !/obs/.test(n)
}
function moedaDaFolha(nome: string): string {
  return /usd/i.test(nome) ? 'USD' : 'EUR'
}

// ── Leitura de um ficheiro (Excel/CSV) → movimentos por conta ────────────────
export type ResultadoLeitura = {
  movimentos: MovExtrato[]
  folhasLidas: string[]
  erros: string[]
  mapPorConta: Record<string, Mapeamento>
}

// Lê os arrays de linhas de cada folha do extrato. O parsing do ficheiro (Excel)
// é feito na página (read-excel-file, que precisa do browser); aqui recebemos já
// as linhas por folha e tratamos a lógica.
export async function processarFolhas(
  folhas: { nome: string; linhas: unknown[][] }[],
  contas: ContaBancaria[]
): Promise<ResultadoLeitura> {
  const erros: string[] = []
  const folhasLidas: string[] = []
  const mapPorConta: Record<string, Mapeamento> = {}
  const brutos: MovExtrato[] = []

  for (const { nome, linhas } of folhas) {
    const moeda = moedaDaFolha(nome)
    const conta = contas.find((c) => c.moeda === moeda)
    if (!conta) { erros.push(`Folha "${nome}": sem conta bancária de moeda ${moeda}.`); continue }
    const det = detetarCabecalho(linhas)
    if (!det) { erros.push(`Folha "${nome}": não encontrei o cabeçalho (Data Mov · Descrição · Valor).`); continue }
    mapPorConta[conta.id] = det.map
    folhasLidas.push(nome)

    for (let i = det.headerRow + 1; i < linhas.length; i++) {
      const row = linhas[i] ?? []
      const data = parseDataCelula(row[det.map.dataMov])
      const valorBruto = parseValorComSinal(row[det.map.valor])
      const descritivo = String(row[det.map.descritivo] ?? '').trim()
      if (!data || isNaN(valorBruto) || !descritivo) continue   // linha em branco/metadados
      const sentido: Sentido = valorBruto < 0 ? 'debito' : 'credito'
      const valor = Math.abs(valorBruto)
      const obs = det.map.obs >= 0 ? String(row[det.map.obs] ?? '').trim() || null : null
      const dataValor = det.map.dataValor >= 0 ? parseDataCelula(row[det.map.dataValor]) : null
      brutos.push({
        conta_id: conta.id, conta_nome: conta.nome,
        data, data_valor: dataValor, descritivo, valor, sentido,
        saldo: null, observacoes: obs, referencia: null,
        hash: hashMovimento(conta.id, data, valor, sentido, descritivo, null),
        estado: 'por_conciliar', ignorar_categoria: null, jaExiste: false,
      })
    }
  }

  // Regras de auto-ignorar + débitos → ignorado; créditos limpos → por_conciliar.
  const regras = await listarRegrasIgnorar()
  for (const m of brutos) {
    const d = normDescritivo(m.descritivo)
    const regra = regras.find((r) => r.ativo && d.includes(semAcentos(r.valor).toUpperCase().trim()))
    if (regra) { m.estado = 'ignorado'; m.ignorar_categoria = regra.categoria }
    else if (m.sentido === 'debito') { m.estado = 'ignorado'; m.ignorar_categoria = 'outros' }
    else m.estado = 'por_conciliar'
  }

  // Dedup dentro do lote + contra a BD (hash).
  const vistos = new Set<string>()
  const unicos = brutos.filter((m) => (vistos.has(m.hash) ? false : (vistos.add(m.hash), true)))
  const existentes = await hashesExistentes(unicos.map((m) => m.hash))
  for (const m of unicos) m.jaExiste = existentes.has(m.hash)

  return { movimentos: unicos, folhasLidas, erros, mapPorConta }
}

export async function listarRegrasIgnorar(): Promise<RegraIgnorar[]> {
  const { data } = await supabase
    .from('bank_ignore_rules')
    .select('ativo, campo, operador, valor, categoria')
    .eq('ativo', true)
    .order('ordem')
  return (data as RegraIgnorar[]) ?? []
}

async function hashesExistentes(hashes: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  for (let i = 0; i < hashes.length; i += 400) {
    const lote = hashes.slice(i, i + 400)
    const { data } = await supabase.from('bank_movements').select('hash').in('hash', lote)
    for (const r of (data as { hash: string }[]) ?? []) set.add(r.hash)
  }
  return set
}

// ── Importação (idempotente) + lote/relatório por conta ──────────────────────
export type ResultadoImportConta = {
  conta_id: string
  conta_nome: string
  novos: number
  repetidos: number
  ignorados: number
  porConciliar: number
}
export type ResultadoImport = { porConta: ResultadoImportConta[]; erro?: string }

export async function importarMovimentos(
  movimentos: MovExtrato[],
  mapPorConta: Record<string, Mapeamento>,
  ficheiroNome: string,
  autor: { id: string | null; nome: string | null }
): Promise<ResultadoImport> {
  const porContaIds = Array.from(new Set(movimentos.map((m) => m.conta_id)))
  const porConta: ResultadoImportConta[] = []
  let erro: string | undefined

  for (const contaId of porContaIds) {
    const doConta = movimentos.filter((m) => m.conta_id === contaId)
    const novos = doConta.filter((m) => !m.jaExiste)
    const nomeConta = doConta[0]?.conta_nome ?? ''
    const datas = doConta.map((m) => m.data).sort()

    // Guarda o mapeamento de colunas na conta (reutilização/referência).
    if (mapPorConta[contaId]) {
      await supabase.from('bank_accounts')
        .update({ mapeamento_colunas: mapPorConta[contaId] }).eq('id', contaId)
    }

    // Lote (relatório).
    const { data: lote, error: eLote } = await supabase.from('bank_import_lotes').insert({
      conta_id: contaId, ficheiro_nome: ficheiroNome,
      periodo_inicio: datas[0] ?? null, periodo_fim: datas[datas.length - 1] ?? null,
      total_linhas: doConta.length, novos: novos.length, repetidos: doConta.length - novos.length,
      criado_por: autor.id, criado_por_nome: autor.nome,
    }).select('id').single()
    if (eLote) { erro = eLote.message; break }

    if (novos.length > 0) {
      const rows = novos.map((m) => ({
        conta_id: m.conta_id, import_lote_id: (lote as { id: string }).id,
        data: m.data, data_valor: m.data_valor, descritivo: m.descritivo,
        valor: m.valor, sentido: m.sentido, saldo: m.saldo,
        referencia: m.referencia, observacoes: m.observacoes,
        estado: m.estado, ignorar_categoria: m.ignorar_categoria, hash: m.hash,
        criado_por: autor.id, criado_por_nome: autor.nome,
      }))
      const { error } = await supabase.from('bank_movements').insert(rows)
      if (error) { erro = error.message; break }
    }

    porConta.push({
      conta_id: contaId, conta_nome: nomeConta,
      novos: novos.length, repetidos: doConta.length - novos.length,
      ignorados: novos.filter((m) => m.estado === 'ignorado').length,
      porConciliar: novos.filter((m) => m.estado === 'por_conciliar').length,
    })
  }

  return { porConta, erro }
}

// ── Histórico de importações ─────────────────────────────────────────────────
export type LoteImport = {
  id: string
  conta_id: string
  ficheiro_nome: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  total_linhas: number
  novos: number
  repetidos: number
  criado_por_nome: string | null
  created_at: string
}
export async function listarLotes(): Promise<LoteImport[]> {
  const { data } = await supabase
    .from('bank_import_lotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  return (data as LoteImport[]) ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE C — fila de conciliação: carregar movimentos, confirmar/ignorar/desfazer.
// ─────────────────────────────────────────────────────────────────────────────

export type BankMovimento = {
  id: string
  conta_id: string
  conta_nome: string
  conta_moeda: string
  data: string
  descritivo: string
  valor: number
  sentido: Sentido
  saldo: number | null
  observacoes: string | null
  estado: EstadoMov
  ignorar_categoria: IgnorarCategoria | null
}

export type FiltroMovimentos = {
  conta_id?: string
  estado?: EstadoMov
  sentido?: Sentido
  de?: string
  ate?: string
}

type LinhaBM = {
  id: string; conta_id: string; data: string; descritivo: string; valor: number
  sentido: Sentido; saldo: number | null; observacoes: string | null
  estado: EstadoMov; ignorar_categoria: IgnorarCategoria | null
  bank_accounts: { nome: string; moeda: string } | null
}

export async function carregarMovimentos(f: FiltroMovimentos = {}): Promise<BankMovimento[]> {
  let q = supabase
    .from('bank_movements')
    .select('id, conta_id, data, descritivo, valor, sentido, saldo, observacoes, estado, ignorar_categoria, bank_accounts(nome, moeda)')
    .order('data', { ascending: false })
    .limit(2000)
  if (f.conta_id) q = q.eq('conta_id', f.conta_id)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.sentido) q = q.eq('sentido', f.sentido)
  if (f.de) q = q.gte('data', f.de)
  if (f.ate) q = q.lte('data', f.ate)
  const { data } = await q
  return ((data as unknown as LinhaBM[]) ?? []).map((r) => ({
    id: r.id, conta_id: r.conta_id, conta_nome: r.bank_accounts?.nome ?? '—',
    conta_moeda: r.bank_accounts?.moeda ?? 'EUR',
    data: r.data, descritivo: r.descritivo, valor: r.valor, sentido: r.sentido,
    saldo: r.saldo, observacoes: r.observacoes, estado: r.estado, ignorar_categoria: r.ignorar_categoria,
  }))
}

export type ResumoConciliacao = {
  porConciliar: { n: number; soma: number }
  conciliados: { n: number; soma: number }
  ignorados: { n: number }
}
// Indicadores (só créditos): por conciliar, conciliados e ignorados no filtro dado.
export async function resumoConciliacao(f: FiltroMovimentos = {}): Promise<ResumoConciliacao> {
  const movs = await carregarMovimentos({ ...f, sentido: 'credito', estado: undefined })
  const r: ResumoConciliacao = { porConciliar: { n: 0, soma: 0 }, conciliados: { n: 0, soma: 0 }, ignorados: { n: 0 } }
  for (const m of movs) {
    if (m.estado === 'por_conciliar' || m.estado === 'sugerido') { r.porConciliar.n++; r.porConciliar.soma += m.valor }
    else if (m.estado === 'conciliado') { r.conciliados.n++; r.conciliados.soma += m.valor }
    else if (m.estado === 'ignorado') { r.ignorados.n++ }
  }
  return r
}

// Confirmar: liquida a(s) fatura(s) escolhidas pelos valores dados (RPC atómica).
export async function confirmarMatch(
  bankMovementId: string,
  alocacoes: { movimento_id: string; valor: number }[],
  data: string,
  autorNome: string | null
) {
  return supabase.rpc('bank_confirmar_match', {
    p_bank_movement: bankMovementId,
    p_alocacoes: alocacoes,
    p_data: data,
    p_autor_nome: autorNome,
  })
}
export async function desfazerMatch(bankMovementId: string) {
  return supabase.rpc('bank_desfazer_match', { p_bank_movement: bankMovementId })
}
export async function ignorarMovimento(bankMovementId: string, categoria: IgnorarCategoria) {
  return supabase.rpc('bank_ignorar', { p_bank_movement: bankMovementId, p_categoria: categoria })
}
export async function reabrirMovimento(bankMovementId: string) {
  return supabase.from('bank_movements')
    .update({ estado: 'por_conciliar', ignorar_categoria: null, updated_at: new Date().toISOString() })
    .eq('id', bankMovementId)
}

// O que um movimento já conciliado pagou (para mostrar/desfazer).
export type AlocacaoFeita = {
  fatura_ref: string | null
  cliente_nome: string | null
  valor_aplicado: number
  data_documento: string | null
}
export async function alocacoesDoMovimento(bankMovementId: string): Promise<AlocacaoFeita[]> {
  const { data } = await supabase
    .from('bank_reconciliation_allocations')
    .select('valor_aplicado, financeiro_movimentos(documento_ref, entidade_nome, data_documento)')
    .eq('bank_movement_id', bankMovementId)
  type L = { valor_aplicado: number; financeiro_movimentos: { documento_ref: string | null; entidade_nome: string | null; data_documento: string | null } | null }
  return ((data as unknown as L[]) ?? []).map((r) => ({
    fatura_ref: r.financeiro_movimentos?.documento_ref ?? null,
    cliente_nome: r.financeiro_movimentos?.entidade_nome ?? null,
    valor_aplicado: r.valor_aplicado,
    data_documento: r.financeiro_movimentos?.data_documento ?? null,
  }))
}

// Camada e) — interpreta um descritivo difícil por IA (devolve nome sugerido).
export async function interpretarDescritivoIA(descritivo: string, observacoes: string | null): Promise<{ ok: boolean; nome: string | null; confianca: string | null; erro?: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const r = await fetch('/api/financeiro/conciliacao/interpretar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ descritivo, observacoes }),
  })
  const j = await r.json()
  return { ok: !!j.ok, nome: j.nome ?? null, confianca: j.confianca ?? null, erro: j.erro }
}

export const IGNORAR_CATEGORIAS: { valor: IgnorarCategoria; label: string }[] = [
  { valor: 'comissoes_bancarias', label: 'Comissões bancárias' },
  { valor: 'salarios', label: 'Salários' },
  { valor: 'fornecedores', label: 'Pagamento a fornecedores' },
  { valor: 'transferencias_internas', label: 'Transferências internas' },
  { valor: 'outros', label: 'Outros' },
]

// ─────────────────────────────────────────────────────────────────────────────
// FASE D — visão de controlo (resumo por período/conta) + rastreio na fatura.
// ─────────────────────────────────────────────────────────────────────────────

export type NSoma = { n: number; soma: number }
export type ControloConta = {
  conta_id: string
  conta_nome: string
  moeda: string
  creditos: { total: NSoma; porConciliar: NSoma; conciliado: NSoma; ignorado: NSoma }
  debitos: NSoma
  meses: { mes: string; total: number; conciliado: number; ignorado: number; porConciliar: number }[]
}

function add(a: NSoma, v: number) { a.n++; a.soma += v }

// Resumo de controlo: por conta, os créditos por estado + saídas, e uma
// decomposição por mês (a diferença "por conciliar" é a lista de trabalho).
export async function carregarControlo(f: FiltroMovimentos = {}): Promise<ControloConta[]> {
  const movs = await carregarMovimentos({ conta_id: f.conta_id, de: f.de, ate: f.ate })
  const porConta = new Map<string, ControloConta>()
  for (const m of movs) {
    let cc = porConta.get(m.conta_id)
    if (!cc) {
      cc = {
        conta_id: m.conta_id, conta_nome: m.conta_nome, moeda: m.conta_moeda,
        creditos: { total: { n: 0, soma: 0 }, porConciliar: { n: 0, soma: 0 }, conciliado: { n: 0, soma: 0 }, ignorado: { n: 0, soma: 0 } },
        debitos: { n: 0, soma: 0 }, meses: [],
      }
      porConta.set(m.conta_id, cc)
    }
    if (m.sentido === 'debito') { add(cc.debitos, m.valor); continue }
    add(cc.creditos.total, m.valor)
    const mes = m.data.slice(0, 7)
    let linha = cc.meses.find((x) => x.mes === mes)
    if (!linha) { linha = { mes, total: 0, conciliado: 0, ignorado: 0, porConciliar: 0 }; cc.meses.push(linha) }
    linha.total += m.valor
    if (m.estado === 'conciliado') { add(cc.creditos.conciliado, m.valor); linha.conciliado += m.valor }
    else if (m.estado === 'ignorado') { add(cc.creditos.ignorado, m.valor); linha.ignorado += m.valor }
    else { add(cc.creditos.porConciliar, m.valor); linha.porConciliar += m.valor }
  }
  for (const cc of porConta.values()) cc.meses.sort((a, b) => (a.mes < b.mes ? 1 : -1))
  return [...porConta.values()]
}

// Rastreio (req 14): pagamentos com origem "banco" por fatura (data + descritivo).
export type OrigemBanco = { data: string; descritivo: string; conta_nome: string; valor_aplicado: number }
export async function alocacoesBancariasPorFatura(faturaIds: string[]): Promise<Map<string, OrigemBanco[]>> {
  const mapa = new Map<string, OrigemBanco[]>()
  if (faturaIds.length === 0) return mapa
  for (let i = 0; i < faturaIds.length; i += 300) {
    const lote = faturaIds.slice(i, i + 300)
    const { data } = await supabase
      .from('bank_reconciliation_allocations')
      .select('movimento_id, valor_aplicado, bank_movements(data, descritivo, bank_accounts(nome))')
      .in('movimento_id', lote)
    type L = { movimento_id: string; valor_aplicado: number; bank_movements: { data: string; descritivo: string; bank_accounts: { nome: string } | null } | null }
    for (const r of (data as unknown as L[]) ?? []) {
      const arr = mapa.get(r.movimento_id) ?? []
      arr.push({
        data: r.bank_movements?.data ?? '', descritivo: r.bank_movements?.descritivo ?? '',
        conta_nome: r.bank_movements?.bank_accounts?.nome ?? '', valor_aplicado: r.valor_aplicado,
      })
      mapa.set(r.movimento_id, arr)
    }
  }
  return mapa
}

export function formatarValor(n: number, moeda: string): string {
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: moeda }).format(n)
  } catch {
    return `${n.toFixed(2)} ${moeda}`
  }
}
