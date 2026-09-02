import { supabase } from './supabase'
import { tipoDocInfo, type EntidadeTipo, type TipoDocumento } from './contasCorrentes'
import { listarRegras, aplicarRegras } from './categoriasFinanceiras'

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização Keyinvoice → Contas Correntes (por importação de ficheiro).
//
// Aceita DOIS formatos:
//  1) Export nativo do Keyinvoice (mapa de pendentes):
//     Data ; RefªDocº ; Cliente ; Contribuinte ; Valor S/IVA ; Valor IVA ;
//     Valor C/IVA ; Valor Pendente   (separador ; , tab ou espaços)
//     → tipo vem do prefixo da RefªDocº; valor = Valor Pendente.
//  2) Modelo próprio (tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor).
//
// A ligação à API do Keyinvoice (fechada) fica isolada no adaptador
// obterDocumentosViaApi(); o pipeline a jusante (matching, idempotência, log)
// é partilhado.
// ─────────────────────────────────────────────────────────────────────────────

export type DocKeyinvoice = {
  keyinvoice_doc_id: string
  entidade_tipo: EntidadeTipo
  nome: string
  nif: string | null
  tipo_documento: TipoDocumento
  numero: string
  data_documento: string
  data_vencimento: string | null
  valor: number
  descricao?: string | null
}

export type LinhaImport = DocKeyinvoice & {
  cliente_id: string | null
  fornecedor_id: string | null
  associada: boolean
  jaImportada: boolean
  categoria_id: string | null
  subcategoria_id: string | null
  erro: string | null
}

// ─── Modelo próprio (download) ───────────────────────────────────────────────

export const CABECALHO_CSV = 'tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor'

export const MODELO_CSV = [
  CABECALHO_CSV,
  'fatura;FT2026/101;cliente;Clínica Exemplo Lda;500100200;2026-05-10;2026-06-09;1230,00',
  'recibo;RC2026/57;cliente;Clínica Exemplo Lda;500100200;2026-06-05;;500,00',
  'nota_credito;NC2026/12;cliente;Clínica Exemplo Lda;500100200;2026-06-20;;130,00',
].join('\n')

// Aliases dos tipos (nossos + códigos do Keyinvoice).
const ALIAS_TIPO: Record<string, TipoDocumento> = {
  fatura: 'fatura', ft: 'fatura', fs: 'fatura', fr: 'fatura', ftr: 'fatura',
  fatr: 'fatura', nd: 'fatura', ndc: 'fatura',
  nota_credito: 'nota_credito', nc: 'nota_credito', ncr: 'nota_credito',
  recibo: 'recibo', rc: 'recibo', rg: 'recibo', re: 'recibo',
  pagamento: 'pagamento', pg: 'pagamento',
  adiantamento: 'adiantamento', ad: 'adiantamento',
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}
function normHeader(h: string): string {
  return normalizar(h).replace(/[^a-z0-9]/g, '')
}
function normalizarNif(s: string | null | undefined): string {
  return (s ?? '').replace(/[^0-9A-Za-z]/g, '')
}

function isoValida(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
function parseData(s: string): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  let iso: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t
  else {
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return iso && isoValida(iso) ? iso : null
}
function parseValor(s: string): number {
  let t = (s ?? '').trim().replace(/[€\s]/g, '')
  if (!t) return NaN
  const temVirgula = t.includes(',')
  const temPonto = t.includes('.')
  if (temVirgula && temPonto) t = t.replace(/\./g, '').replace(',', '.')
  else if (temVirgula) t = t.replace(',', '.')
  const n = Number(t)
  return isNaN(n) ? NaN : Math.abs(n)
}

// Deteta o separador da linha (;, tab, ou 2+ espaços).
function detetarDelim(linha: string): string | RegExp {
  if (linha.includes('\t')) return '\t'
  if (linha.includes(';')) return ';'
  if (/\s{2,}/.test(linha)) return /\s{2,}/
  return ';'
}
function celulas(linha: string, delim: string | RegExp): string[] {
  return linha.split(delim).map((c) => c.trim())
}

// Tipo de documento a partir do prefixo alfabético da referência (ex.: "FT 2026/1").
function tipoDeRef(ref: string): TipoDocumento {
  const m = ref.trim().match(/^[A-Za-zÀ-ÿ]+/)
  return ALIAS_TIPO[normalizar(m?.[0] ?? '')] ?? 'fatura'
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export function parseCsv(texto: string): { docs: DocKeyinvoice[]; erros: string[] } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (linhas.length === 0) return { docs: [], erros: ['Ficheiro vazio.'] }
  const delim = detetarDelim(linhas[0])
  const header = celulas(linhas[0], delim).map(normHeader)
  const ehKeyinvoice = ['refdoc', 'contribuinte', 'valorpendente'].some((k) => header.includes(k))
  return ehKeyinvoice ? parseKeyinvoice(linhas, delim, header) : parseModelo(linhas, delim)
}

// Formato nativo do Keyinvoice (mapa de pendentes). Mapeia por nome de coluna.
function parseKeyinvoice(linhas: string[], delim: string | RegExp, header: string[]): { docs: DocKeyinvoice[]; erros: string[] } {
  const idx = (...keys: string[]) => { for (const k of keys) { const i = header.indexOf(k); if (i >= 0) return i } return -1 }
  const iData = idx('data', 'datadoc', 'datadocumento')
  const iRef = idx('refdoc', 'refadoc', 'referencia', 'documento', 'ndoc', 'numero')
  const iNome = idx('cliente', 'fornecedor', 'entidade', 'nome')
  const iNif = idx('contribuinte', 'nif', 'niffiscal')
  const iPend = idx('valorpendente', 'pendente')
  const iCiva = idx('valorciva', 'totalciva', 'total', 'valorcimposto')
  const iVenc = idx('vencimento', 'datavencimento', 'datadevencimento')
  const entidade_tipo: EntidadeTipo = header.includes('fornecedor') ? 'fornecedor' : 'cliente'

  const docs: DocKeyinvoice[] = []
  const erros: string[] = []
  for (let i = 1; i < linhas.length; i++) {
    const cols = celulas(linhas[i], delim)
    const ref = (cols[iRef] ?? '').trim()
    if (!ref) continue
    const tipo = tipoDeRef(ref)
    const data = parseData(cols[iData] ?? '')
    if (!data) { erros.push(`Linha ${i + 1}: data inválida ("${cols[iData] ?? ''}").`); continue }
    const bruto = iPend >= 0 ? cols[iPend] : cols[iCiva]
    const valor = parseValor(bruto ?? '')
    if (isNaN(valor)) { erros.push(`Linha ${i + 1}: valor inválido ("${bruto ?? ''}").`); continue }
    if (valor <= 0) continue // nada pendente (documento liquidado) → fora da conta corrente
    docs.push({
      keyinvoice_doc_id: `${tipo}|${ref}`,
      entidade_tipo,
      nome: (cols[iNome] ?? '').trim() || '—',
      nif: normalizarNif(cols[iNif]) || null,
      tipo_documento: tipo,
      numero: ref,
      data_documento: data,
      data_vencimento: iVenc >= 0 ? parseData(cols[iVenc] ?? '') : null,
      valor,
    })
  }
  return { docs, erros }
}

// Formato do modelo próprio.
function parseModelo(linhas: string[], delim: string | RegExp): { docs: DocKeyinvoice[]; erros: string[] } {
  const inicio = normalizar(linhas[0]).startsWith('tipo') ? 1 : 0
  const docs: DocKeyinvoice[] = []
  const erros: string[] = []
  for (let i = inicio; i < linhas.length; i++) {
    const n = i + 1
    const [tipoRaw, numero, entRaw, nome, nif, dataRaw, vencRaw, valorRaw] = celulas(linhas[i], delim)
    if (!tipoRaw && !numero && !nome) continue
    const tipo = ALIAS_TIPO[normalizar(tipoRaw ?? '')]
    if (!tipo) { erros.push(`Linha ${n}: tipo inválido ("${tipoRaw ?? ''}").`); continue }
    const entidade_tipo = normalizar(entRaw ?? '').startsWith('forn') ? 'fornecedor' : normalizar(entRaw ?? '').startsWith('cli') ? 'cliente' : null
    if (!entidade_tipo) { erros.push(`Linha ${n}: entidade_tipo deve ser "cliente" ou "fornecedor".`); continue }
    if (!numero) { erros.push(`Linha ${n}: falta o número.`); continue }
    if (!nome) { erros.push(`Linha ${n}: falta o nome.`); continue }
    const data = parseData(dataRaw ?? '')
    if (!data) { erros.push(`Linha ${n}: data inválida ("${dataRaw ?? ''}").`); continue }
    const valor = parseValor(valorRaw ?? '')
    if (isNaN(valor) || valor <= 0) { erros.push(`Linha ${n}: valor inválido ("${valorRaw ?? ''}").`); continue }
    docs.push({
      keyinvoice_doc_id: `${tipo}|${numero.trim()}`,
      entidade_tipo, nome: nome.trim(), nif: normalizarNif(nif) || null,
      tipo_documento: tipo, numero: numero.trim(),
      data_documento: data, data_vencimento: parseData(vencRaw ?? ''), valor,
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

export async function processar(docs: DocKeyinvoice[]): Promise<LinhaImport[]> {
  const [clientes, fornecedores] = await Promise.all([carregarEntidades('clientes'), carregarEntidades('fornecedores')])
  function indexar(lista: EntRef[]) {
    const porNif = new Map<string, string>()
    const porNome = new Map<string, string>()
    for (const e of lista) {
      const nif = normalizarNif(e.nif)
      if (nif) porNif.set(nif.toLowerCase(), e.id)
      porNome.set(normalizar(e.nome), e.id)
    }
    return { porNif, porNome }
  }
  const idxCli = indexar(clientes)
  const idxForn = indexar(fornecedores)
  const jaLa = await jaImportados(docs.map((d) => d.keyinvoice_doc_id))
  const regras = await listarRegras()

  return docs.map((d) => {
    const idx = d.entidade_tipo === 'cliente' ? idxCli : idxForn
    const nif = normalizarNif(d.nif).toLowerCase()
    const entId = (nif && idx.porNif.get(nif)) || idx.porNome.get(normalizar(d.nome)) || null
    const cat = aplicarRegras(regras, { descricao: d.descricao, documento_ref: d.numero, entidade_nome: d.nome })
    return {
      ...d,
      cliente_id: d.entidade_tipo === 'cliente' ? entId : null,
      fornecedor_id: d.entidade_tipo === 'fornecedor' ? entId : null,
      associada: !!entId,
      jaImportada: jaLa.has(d.keyinvoice_doc_id),
      categoria_id: cat?.categoria_id ?? null,
      subcategoria_id: cat?.subcategoria_id ?? null,
      erro: null,
    }
  })
}

export async function jaImportados(ids: string[]): Promise<Set<string>> {
  const set = new Set<string>()
  if (ids.length === 0) return set
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500)
    const { data } = await supabase.from('financeiro_movimentos').select('keyinvoice_doc_id').in('keyinvoice_doc_id', lote)
    for (const r of (data as { keyinvoice_doc_id: string }[]) ?? []) set.add(r.keyinvoice_doc_id)
  }
  return set
}

// ─── Importação (idempotente: insere novos, atualiza existentes) + log ───────

export type ResultadoImport = { importados: number; atualizados: number; semEntidade: number; erro?: string }

export async function importar(
  linhas: LinhaImport[],
  utilizador: { id: string | null; nome: string | null }
): Promise<ResultadoImport> {
  const associadas = linhas.filter((l) => l.associada && !l.erro)
  const semEntidade = linhas.filter((l) => !l.associada && !l.erro).length

  // Campos partilhados (valores/datas/descrição). A categoria NÃO entra aqui para
  // não sobrepor a categorização manual ao atualizar documentos já existentes.
  const campos = (l: LinhaImport) => {
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
      descricao: l.descricao ?? null,
      valor_debito: sentido === 'debito' ? l.valor : 0,
      valor_credito: sentido === 'credito' ? l.valor : 0,
    }
  }

  // Novos (dedup no lote) → insert (com a categoria das regras automáticas).
  const vistos = new Set<string>()
  const novos = associadas.filter((l) => !l.jaImportada && (vistos.has(l.keyinvoice_doc_id) ? false : (vistos.add(l.keyinvoice_doc_id), true)))
  const rows = novos.map((l) => ({
    ...campos(l),
    categoria_id: l.categoria_id,
    subcategoria_id: l.subcategoria_id,
    origem: 'keyinvoice' as const,
    keyinvoice_doc_id: l.keyinvoice_doc_id,
    criado_por: utilizador.id,
    criado_por_nome: utilizador.nome,
  }))

  // Existentes → update (refresca o pendente/valor e datas).
  const existentes = associadas.filter((l) => l.jaImportada)

  let erro: string | undefined
  let importados = 0
  let atualizados = 0

  if (rows.length > 0) {
    const { error } = await supabase.from('financeiro_movimentos').insert(rows)
    if (error) erro = error.message
    else importados = rows.length
  }
  if (!erro) {
    for (const l of existentes) {
      const { error } = await supabase.from('financeiro_movimentos').update(campos(l)).eq('keyinvoice_doc_id', l.keyinvoice_doc_id)
      if (error) { erro = error.message; break }
      atualizados++
    }
  }

  await registarSync({ total: linhas.length, importados, atualizados, semEntidade, ok: !erro, erro })
  return { importados, atualizados, semEntidade, erro }
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

async function registarSync(resumo: { total: number; importados: number; atualizados: number; semEntidade: number; ok: boolean; erro?: string }) {
  await supabase.from('financeiro_keyinvoice_sync').insert({
    recurso: 'import_csv',
    estado: resumo.ok ? 'ok' : 'erro',
    payload: resumo,
    sincronizado_em: new Date().toISOString(),
  })
}

export async function listarSyncs(limite = 10): Promise<SyncRun[]> {
  const { data } = await supabase.from('financeiro_keyinvoice_sync').select('*').order('created_at', { ascending: false }).limit(limite)
  return (data as SyncRun[]) ?? []
}

// ─── Adaptador da API (por ligar) ────────────────────────────────────────────

export async function obterDocumentosViaApi(): Promise<DocKeyinvoice[]> {
  throw new Error('Sincronização automática por ligar: falta a chave/API do Keyinvoice. Usa a importação por ficheiro.')
}

// ─── Utilitário: descarregar o modelo CSV ────────────────────────────────────

export function descarregarModeloCsv() {
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
