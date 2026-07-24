import { supabase } from './supabase'
import { tipoDocInfo, type EntidadeTipo, type TipoDocumento } from './contasCorrentes'

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização Keyinvoice → Contas Correntes.
//
// A ligação à API do Keyinvoice (fechada, precisa de chave) fica isolada num
// adaptador (obterDocumentosViaApi, ainda por ligar). Hoje a fonte é a
// IMPORTAÇÃO POR FICHEIRO (CSV exportado do Keyinvoice), mas todo o pipeline a
// jusante — matching de entidades, idempotência e log — é partilhado: quando a
// API estiver disponível, só troca a origem dos DocKeyinvoice.
// ─────────────────────────────────────────────────────────────────────────────

// Documento externo normalizado (a forma que o pipeline consome).
export type DocKeyinvoice = {
  keyinvoice_doc_id: string // id único e estável do documento (idempotência)
  entidade_tipo: EntidadeTipo
  nome: string
  nif: string | null
  tipo_documento: TipoDocumento
  numero: string // nº do documento (documento_ref)
  data_documento: string // yyyy-mm-dd
  data_vencimento: string | null
  valor: number // valor bruto (positivo)
}

// Linha já processada: doc + resultado do matching de entidade.
export type LinhaImport = DocKeyinvoice & {
  cliente_id: string | null
  fornecedor_id: string | null
  associada: boolean // encontrou a entidade no CRM?
  jaImportada: boolean // já existe (keyinvoice_doc_id)?
  erro: string | null // erro de parsing/validação nesta linha
}

// ─── CSV: modelo e parsing ───────────────────────────────────────────────────

export const CABECALHO_CSV = 'tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor'

export const MODELO_CSV = [
  CABECALHO_CSV,
  'fatura;FT2026/101;cliente;Clínica Exemplo Lda;500100200;2026-05-10;2026-06-09;1230,00',
  'recibo;RC2026/57;cliente;Clínica Exemplo Lda;500100200;2026-06-05;;500,00',
  'nota_credito;NC2026/12;cliente;Clínica Exemplo Lda;500100200;2026-06-20;;130,00',
  'fatura;FT2026/88;fornecedor;Fornecedor Exemplo SA;501999888;2026-05-02;2026-06-01;800,00',
].join('\n')

// Aliases dos tipos (aceita os códigos comuns do Keyinvoice além dos nossos).
const ALIAS_TIPO: Record<string, TipoDocumento> = {
  fatura: 'fatura', ft: 'fatura', fs: 'fatura', fr: 'fatura', 'fatura-recibo': 'fatura',
  'fatura recibo': 'fatura', 'fatura simplificada': 'fatura', nd: 'fatura', 'nota de debito': 'fatura',
  nota_credito: 'nota_credito', 'nota de credito': 'nota_credito', nc: 'nota_credito',
  recibo: 'recibo', rc: 'recibo', rg: 'recibo',
  pagamento: 'pagamento', pg: 'pagamento', pagto: 'pagamento',
  adiantamento: 'adiantamento', ad: 'adiantamento', adiant: 'adiantamento',
}

// Remove acentos e baixa a caixa (para comparações tolerantes).
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}
function normalizarNif(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

// Valida que um ISO yyyy-mm-dd é uma data real (mês 1-12, dia existente).
function isoValida(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Data: aceita yyyy-mm-dd, dd/mm/aaaa ou dd-mm-aaaa. Devolve ISO ou null.
function parseData(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  let iso: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t
  else {
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return iso && isoValida(iso) ? iso : null
}

// Valor: aceita "1.234,56" (PT), "1234,56" e "1234.56". Devolve número >= 0 ou NaN.
function parseValor(s: string): number {
  let t = s.trim().replace(/[€\s]/g, '')
  if (!t) return NaN
  const temVirgula = t.includes(',')
  const temPonto = t.includes('.')
  if (temVirgula && temPonto) t = t.replace(/\./g, '').replace(',', '.') // ponto=milhares, vírgula=decimal
  else if (temVirgula) t = t.replace(',', '.') // vírgula decimal
  const n = Number(t)
  return isNaN(n) ? NaN : Math.abs(n)
}

// Divide uma linha CSV por ';' (formato simples; sem aspas embutidas).
function celulas(linha: string): string[] {
  return linha.split(';').map((c) => c.trim())
}

// Faz o parse do CSV para DocKeyinvoice, reportando erros por linha.
export function parseCsv(texto: string): { docs: DocKeyinvoice[]; erros: string[] } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (linhas.length === 0) return { docs: [], erros: ['Ficheiro vazio.'] }

  // Ignora a linha de cabeçalho se presente.
  const inicio = normalizar(linhas[0]).startsWith('tipo;') || normalizar(linhas[0]).includes('numero') ? 1 : 0
  const docs: DocKeyinvoice[] = []
  const erros: string[] = []

  for (let i = inicio; i < linhas.length; i++) {
    const n = i + 1
    const [tipoRaw, numero, entRaw, nome, nif, dataRaw, vencRaw, valorRaw] = celulas(linhas[i])
    if (!tipoRaw && !numero && !nome) continue // linha vazia

    const tipo = ALIAS_TIPO[normalizar(tipoRaw ?? '')]
    if (!tipo) { erros.push(`Linha ${n}: tipo de documento inválido ("${tipoRaw ?? ''}").`); continue }
    const entidade_tipo = normalizar(entRaw ?? '').startsWith('forn') ? 'fornecedor' : normalizar(entRaw ?? '').startsWith('cli') ? 'cliente' : null
    if (!entidade_tipo) { erros.push(`Linha ${n}: entidade_tipo deve ser "cliente" ou "fornecedor".`); continue }
    if (!numero) { erros.push(`Linha ${n}: falta o número do documento.`); continue }
    if (!nome) { erros.push(`Linha ${n}: falta o nome da entidade.`); continue }
    const data = parseData(dataRaw ?? '')
    if (!data) { erros.push(`Linha ${n}: data inválida ("${dataRaw ?? ''}").`); continue }
    const valor = parseValor(valorRaw ?? '')
    if (isNaN(valor) || valor <= 0) { erros.push(`Linha ${n}: valor inválido ("${valorRaw ?? ''}").`); continue }

    docs.push({
      keyinvoice_doc_id: `${tipo}|${numero.trim()}`,
      entidade_tipo,
      nome: nome.trim(),
      nif: normalizarNif(nif) || null,
      tipo_documento: tipo,
      numero: numero.trim(),
      data_documento: data,
      data_vencimento: parseData(vencRaw ?? ''),
      valor,
    })
  }
  return { docs, erros }
}

// ─── Matching de entidades (por NIF, depois por nome) ────────────────────────

type EntRef = { id: string; nome: string; nif: string | null }

async function carregarEntidades(tabela: 'clientes' | 'fornecedores'): Promise<EntRef[]> {
  const { data } = await supabase.from(tabela).select('id, nome, nif').limit(5000)
  return ((data as EntRef[]) ?? []).filter((e) => e.nome)
}

// Associa cada doc a um cliente/fornecedor e marca duplicados já importados.
export async function processar(docs: DocKeyinvoice[]): Promise<LinhaImport[]> {
  const [clientes, fornecedores] = await Promise.all([
    carregarEntidades('clientes'),
    carregarEntidades('fornecedores'),
  ])

  function indexar(lista: EntRef[]) {
    const porNif = new Map<string, string>()
    const porNome = new Map<string, string>()
    for (const e of lista) {
      const nif = normalizarNif(e.nif)
      if (nif) porNif.set(nif, e.id)
      porNome.set(normalizar(e.nome), e.id)
    }
    return { porNif, porNome }
  }
  const idxCli = indexar(clientes)
  const idxForn = indexar(fornecedores)

  // Duplicados: que keyinvoice_doc_id já existem na BD.
  const ids = docs.map((d) => d.keyinvoice_doc_id)
  const jaLa = await jaImportados(ids)

  return docs.map((d) => {
    const idx = d.entidade_tipo === 'cliente' ? idxCli : idxForn
    const nif = normalizarNif(d.nif)
    const entId = (nif && idx.porNif.get(nif)) || idx.porNome.get(normalizar(d.nome)) || null
    return {
      ...d,
      cliente_id: d.entidade_tipo === 'cliente' ? entId : null,
      fornecedor_id: d.entidade_tipo === 'fornecedor' ? entId : null,
      associada: !!entId,
      jaImportada: jaLa.has(d.keyinvoice_doc_id),
      erro: null,
    }
  })
}

// Consulta que keyinvoice_doc_id já existem (idempotência).
export async function jaImportados(ids: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (ids.length === 0) return set
  // Em lotes para não exceder limites do PostgREST.
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500)
    const { data } = await supabase
      .from('financeiro_movimentos')
      .select('keyinvoice_doc_id')
      .in('keyinvoice_doc_id', lote)
    for (const r of (data as { keyinvoice_doc_id: string }[]) ?? []) set.add(r.keyinvoice_doc_id)
  }
  return set
}

// ─── Importação (idempotente) + log ──────────────────────────────────────────

export type ResultadoImport = { importados: number; ignorados: number; semEntidade: number; erro?: string }

// Insere as linhas novas e associadas; ignora duplicados e sem entidade. Regista o run.
export async function importar(
  linhas: LinhaImport[],
  utilizador: { id: string | null; nome: string | null }
): Promise<ResultadoImport> {
  const novas = linhas.filter((l) => l.associada && !l.jaImportada && !l.erro)
  const semEntidade = linhas.filter((l) => !l.associada && !l.erro).length
  const ignorados = linhas.filter((l) => l.jaImportada).length

  // Dedup dentro do próprio lote (mesmo keyinvoice_doc_id).
  const vistos = new Set<string>()
  const insercoes = novas.filter((l) => (vistos.has(l.keyinvoice_doc_id) ? false : (vistos.add(l.keyinvoice_doc_id), true)))

  const rows = insercoes.map((l) => {
    const sentido = tipoDocInfo(l.tipo_documento).sentido
    return {
      entidade_tipo: l.entidade_tipo,
      cliente_id: l.cliente_id,
      fornecedor_id: l.fornecedor_id,
      entidade_nome: l.nome,
      tipo_documento: l.tipo_documento,
      documento_ref: l.numero,
      data_documento: l.data_documento,
      data_vencimento: l.data_vencimento,
      valor_debito: sentido === 'debito' ? l.valor : 0,
      valor_credito: sentido === 'credito' ? l.valor : 0,
      origem: 'keyinvoice' as const,
      keyinvoice_doc_id: l.keyinvoice_doc_id,
      criado_por: utilizador.id,
      criado_por_nome: utilizador.nome,
    }
  })

  let erro: string | undefined
  if (rows.length > 0) {
    const { error } = await supabase.from('financeiro_movimentos').insert(rows)
    if (error) erro = error.message
  }

  const importados = erro ? 0 : rows.length
  await registarSync({
    total: linhas.length,
    importados,
    ignorados,
    semEntidade,
    ok: !erro,
    erro,
  })
  return { importados, ignorados, semEntidade, erro }
}

// ─── Log de sincronizações ───────────────────────────────────────────────────

export type SyncRun = {
  id: string
  recurso: string | null
  estado: string | null
  payload: Record<string, unknown> | null
  sincronizado_em: string | null
  created_at: string
}

async function registarSync(resumo: {
  total: number; importados: number; ignorados: number; semEntidade: number; ok: boolean; erro?: string
}) {
  await supabase.from('financeiro_keyinvoice_sync').insert({
    recurso: 'import_csv',
    estado: resumo.ok ? 'ok' : 'erro',
    payload: resumo,
    sincronizado_em: new Date().toISOString(),
  })
}

export async function listarSyncs(limite = 10): Promise<SyncRun[]> {
  const { data } = await supabase
    .from('financeiro_keyinvoice_sync')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite)
  return (data as SyncRun[]) ?? []
}

// ─── Adaptador da API (por ligar) ────────────────────────────────────────────

// Quando houver chave/contrato da API do Keyinvoice, esta função passa a
// devolver os DocKeyinvoice diretamente da API (mesmo pipeline a jusante).
export async function obterDocumentosViaApi(): Promise<DocKeyinvoice[]> {
  throw new Error('Sincronização automática por ligar: falta a chave/API do Keyinvoice. Usa a importação por ficheiro.')
}

// ─── Utilitário: descarregar o modelo CSV ────────────────────────────────────

export function descarregarModeloCsv() {
  // BOM para o Excel abrir com acentos corretos.
  const blob = new Blob(['﻿' + MODELO_CSV], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modelo-keyinvoice.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
