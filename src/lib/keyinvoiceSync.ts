import { supabase } from './supabase'
import { tipoDocInfo, type EntidadeTipo, type TipoDocumento } from './contasCorrentes'
import { categorizar, CATEGORIAS, semAcentos, type CategoriaDoc } from './categorizacaoFinanceira'
import { listarRegras, aplicarRegras } from './categoriasFin'

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização Keyinvoice → Contas Correntes (por importação de ficheiro).
//
// Aceita DOIS formatos:
//  1) Export nativo do Keyinvoice (mapa de pendentes):
//     Data ; RefªDocº ; Cliente ; Contribuinte ; Valor S/IVA ; Valor IVA ;
//     Valor C/IVA ; Valor Pendente   (separador ; , tab ou espaços)
//     → tipo vem do prefixo da RefªDocº; valor = Valor Pendente.
//  2) Modelo próprio (tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor
//     [;categoria;descricao] — as duas últimas colunas são opcionais).
//
// A categoria (serviço técnico / aluguer / venda / outro) vem do ficheiro se lá
// estiver; senão é proposta a partir da descrição e da referência. Uma categoria
// corrigida à mão na app (categoria_manual) nunca é sobreposta por reimportação.
//
// A ligação à API do Keyinvoice (fechada) fica isolada no adaptador
// obterDocumentosViaApi(); o pipeline a jusante (matching, idempotência, log)
// é partilhado.
// ─────────────────────────────────────────────────────────────────────────────

export type DocKeyinvoice = {
  keyinvoice_doc_id: string
  descricao: string | null
  categoria: string | null            // chave de topo (heurística ou regra)
  subcategoria_id: string | null      // preenchido por regra, se houver
  entidade_tipo: EntidadeTipo
  nome: string
  nif: string | null
  tipo_documento: TipoDocumento
  numero: string
  data_documento: string
  data_vencimento: string | null
  valor: number
  // Valor já liquidado (via API checkIfSettle). undefined = não determinado
  // (não mexe no que já lá está); usado só nas faturas para o estado de pagamento.
  valor_liquidado?: number | null
  // Total sem IVA (getDocument.NetTotal). Base das comissões. undefined = não obtido.
  valor_liquido?: number | null
}

export type LinhaImport = DocKeyinvoice & {
  cliente_id: string | null
  fornecedor_id: string | null
  associada: boolean
  jaImportada: boolean
  // Já existe na app com categoria fixada à mão → a importação não lhe toca.
  categoriaBloqueada: boolean
  // Categoria herdada da categoria-defeito do cliente (marca "automática", por rever).
  categoriaAuto: boolean
  erro: string | null
}

// ─── Modelo próprio (download) ───────────────────────────────────────────────

export const CABECALHO_CSV =
  'tipo;numero;entidade_tipo;nome;nif;data;vencimento;valor;categoria;descricao'

export const MODELO_CSV = [
  CABECALHO_CSV,
  'fatura;FT2026/101;cliente;Clínica Exemplo Lda;500100200;2026-05-10;2026-06-09;1230,00;servico_tecnico;Assistência técnica | Deslocação 120,00 | Estadia 85,00',
  'pro_forma;PF2026/9;cliente;Clínica Exemplo Lda;500100200;2026-06-01;;2460,00;venda;Pró-forma de consumíveis',
  'recibo;RC2026/57;cliente;Clínica Exemplo Lda;500100200;2026-06-05;;500,00;;',
  'nota_credito;NC2026/12;cliente;Clínica Exemplo Lda;500100200;2026-06-20;;130,00;;',
].join('\n')

// Aliases dos tipos (nossos + códigos do Keyinvoice).
const ALIAS_TIPO: Record<string, TipoDocumento> = {
  fatura: 'fatura', ft: 'fatura', fs: 'fatura', fr: 'fatura', ftr: 'fatura',
  fatr: 'fatura', nd: 'fatura', ndc: 'fatura',
  pro_forma: 'pro_forma', proforma: 'pro_forma', pf: 'pro_forma', fp: 'pro_forma',
  prof: 'pro_forma', pp: 'pro_forma',
  nota_credito: 'nota_credito', nc: 'nota_credito', ncr: 'nota_credito',
  recibo: 'recibo', rc: 'recibo', rg: 'recibo', re: 'recibo',
  pagamento: 'pagamento', pg: 'pagamento',
  adiantamento: 'adiantamento', ad: 'adiantamento',
}

function normalizar(s: string): string {
  return semAcentos(s).trim()
}

// Lê a coluna "categoria" do modelo próprio (aceita o valor ou o rótulo).
function parseCategoria(s: string | undefined): CategoriaDoc | null {
  const t = normalizar(s ?? '').replace(/[\s-]+/g, '_')
  if (!t) return null
  const direta = CATEGORIAS.find((c) => c.valor === t)
  if (direta) return direta.valor
  const porLabel = CATEGORIAS.find((c) => normalizar(c.label).replace(/[\s-]+/g, '_') === t)
  return porLabel?.valor ?? null
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
  const iDesc = idx('descricao', 'observacoes', 'obs', 'designacao', 'assunto')
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
    const descricao = (iDesc >= 0 ? cols[iDesc] ?? '' : '').trim() || null
    docs.push({
      keyinvoice_doc_id: `${tipo}|${ref}`,
      descricao,
      categoria: categorizar(descricao, ref),
      subcategoria_id: null,
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
    const [tipoRaw, numero, entRaw, nome, nif, dataRaw, vencRaw, valorRaw, catRaw, descRaw] =
      celulas(linhas[i], delim)
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
    const descricao = (descRaw ?? '').trim() || null
    docs.push({
      keyinvoice_doc_id: `${tipo}|${numero.trim()}`,
      descricao,
      categoria: parseCategoria(catRaw) ?? categorizar(descricao, numero),
      subcategoria_id: null,
      entidade_tipo, nome: nome.trim(), nif: normalizarNif(nif) || null,
      tipo_documento: tipo, numero: numero.trim(),
      data_documento: data, data_vencimento: parseData(vencRaw ?? ''), valor,
    })
  }
  return { docs, erros }
}

// ─── Matching de entidades (por NIF, depois por nome) ────────────────────────

type EntRef = {
  id: string; nome: string; nif: string | null
  categoria_defeito?: string | null
  subcategoria_defeito_id?: string | null
}

async function carregarEntidades(tabela: 'clientes' | 'fornecedores'): Promise<EntRef[]> {
  // Só os clientes têm categoria-defeito (Item 3).
  const cols = tabela === 'clientes'
    ? 'id, nome, nif, categoria_defeito, subcategoria_defeito_id'
    : 'id, nome, nif'
  const { data } = await supabase.from(tabela).select(cols).limit(5000)
  return ((data as unknown as EntRef[]) ?? []).filter((e) => e.nome)
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
  // Categoria-defeito por cliente (id → categoria/subcategoria).
  const defeitos = new Map<string, { categoria_chave: string; subcategoria_id: string | null }>()
  for (const c of clientes) {
    if (c.categoria_defeito) defeitos.set(c.id, { categoria_chave: c.categoria_defeito, subcategoria_id: c.subcategoria_defeito_id ?? null })
  }
  const jaLa = await jaImportados(docs.map((d) => d.keyinvoice_doc_id))
  const regras = await listarRegras()

  return docs.map((d) => {
    const idx = d.entidade_tipo === 'cliente' ? idxCli : idxForn
    const nif = normalizarNif(d.nif).toLowerCase()
    const entId = (nif && idx.porNif.get(nif)) || idx.porNome.get(normalizar(d.nome)) || null
    const existente = jaLa.get(d.keyinvoice_doc_id)
    // Precedência: regra por descrição > categoria-defeito do cliente > heurística/ficheiro.
    const porRegra = aplicarRegras(regras, { descricao: d.descricao, documento_ref: d.numero, entidade_nome: d.nome })
    const def = d.entidade_tipo === 'cliente' && entId ? defeitos.get(entId) : undefined
    const auto = !porRegra && !!def
    return {
      ...d,
      categoria: porRegra?.categoria_chave ?? def?.categoria_chave ?? d.categoria,
      subcategoria_id: porRegra?.subcategoria_id ?? def?.subcategoria_id ?? null,
      cliente_id: d.entidade_tipo === 'cliente' ? entId : null,
      fornecedor_id: d.entidade_tipo === 'fornecedor' ? entId : null,
      associada: !!entId,
      jaImportada: !!existente,
      categoriaBloqueada: !!existente?.categoria_manual,
      categoriaAuto: auto,
      erro: null,
    }
  })
}

export type MovExistente = { categoria_manual: boolean }

// Documentos já na app, por keyinvoice_doc_id (com o que a reimportação deve respeitar).
export async function jaImportados(ids: string[]): Promise<Map<string, MovExistente>> {
  const mapa = new Map<string, MovExistente>()
  if (ids.length === 0) return mapa
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500)
    const { data } = await supabase
      .from('financeiro_movimentos')
      .select('keyinvoice_doc_id, categoria_manual')
      .in('keyinvoice_doc_id', lote)
    for (const r of (data as { keyinvoice_doc_id: string; categoria_manual: boolean | null }[]) ?? []) {
      mapa.set(r.keyinvoice_doc_id, { categoria_manual: !!r.categoria_manual })
    }
  }
  return mapa
}

// ─── Importação (idempotente: insere novos, atualiza existentes) + log ───────

export type ResultadoImport = {
  importados: number
  atualizados: number
  semEntidade: number
  porClassificar: number
  servicoTecnico: number
  erro?: string
}

export async function importar(
  linhas: LinhaImport[],
  utilizador: { id: string | null; nome: string | null }
): Promise<ResultadoImport> {
  const associadas = linhas.filter((l) => l.associada && !l.erro)
  const semEntidade = linhas.filter((l) => !l.associada && !l.erro).length

  const campos = (l: LinhaImport) => {
    const sentido = tipoDocInfo(l.tipo_documento).sentido
    const base: Record<string, unknown> = {
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
    }
    if (l.descricao) base.descricao = l.descricao
    // Estado de liquidação vindo da API (só faz sentido nas faturas; o trigger
    // da BD deriva o estado de valor_liquidado vs valor_debito).
    if (l.tipo_documento === 'fatura' && typeof l.valor_liquidado === 'number') {
      base.valor_liquidado = l.valor_liquidado
    }
    // Líquido sem IVA (getDocument.NetTotal) — base das comissões. Só quando veio
    // da API; a importação por ficheiro não o traz e não deve apagá-lo.
    if (typeof l.valor_liquido === 'number') base.valor_liquido = l.valor_liquido
    // A classificação corrigida à mão manda sobre a proposta do ficheiro/regras.
    if (!l.categoriaBloqueada) {
      base.categoria = l.categoria
      base.subcategoria_id = l.subcategoria_id
      base.categoria_auto = l.categoriaAuto
    }
    return base
  }

  // Novos (dedup no lote) → insert. IMPORTANTE: todas as linhas do insert em lote
  // têm de trazer as MESMAS colunas — senão o Supabase preenche as em falta com
  // NULL (e valor_liquidado é NOT NULL). Por isso forçamos valor_liquidado (0 por
  // defeito; o trigger deriva o estado) e descricao em TODAS as linhas.
  const vistos = new Set<string>()
  const novos = associadas.filter((l) => !l.jaImportada && (vistos.has(l.keyinvoice_doc_id) ? false : (vistos.add(l.keyinvoice_doc_id), true)))
  const rows = novos.map((l) => ({
    ...campos(l),
    descricao: l.descricao ?? null,
    categoria_auto: l.categoriaBloqueada ? false : l.categoriaAuto,
    valor_liquidado: typeof l.valor_liquidado === 'number' ? l.valor_liquidado : 0,
    valor_liquido: typeof l.valor_liquido === 'number' ? l.valor_liquido : null,
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

  const porClassificar = associadas.filter((l) => !l.categoria && !l.categoriaBloqueada).length
  const servicoTecnico = associadas.filter((l) => l.categoria === 'servico_tecnico').length
  await registarSync({
    total: linhas.length, importados, atualizados, semEntidade,
    porClassificar, servicoTecnico, ok: !erro, erro,
  })
  return { importados, atualizados, semEntidade, porClassificar, servicoTecnico, erro }
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
  total: number; importados: number; atualizados: number; semEntidade: number
  porClassificar: number; servicoTecnico: number; ok: boolean; erro?: string
}) {
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
