import { supabase } from './supabase'
import type { MovimentoCC, EntidadeTipo, TipoDocumento } from './contasCorrentes'

// Documentos financeiros = os movimentos (faturas/recibos/notas de crédito/…),
// numa vista centrada no documento, com o PDF anexo. Bucket privado; o acesso é
// pela RLS (só admin+financeiro) e os ficheiros abrem via URL assinado temporário.

export const BUCKET_FIN_DOCS = 'financeiro-docs'

export type FiltrosDoc = {
  texto: string // nº do documento ou nome da entidade
  entidade_tipo: '' | EntidadeTipo
  tipo_documento: '' | TipoDocumento
  categoria: '' | 'sem' | string // '' = todas; 'sem' = sem categoria; senão id da categoria/subcategoria
  origem: '' | 'manual' | 'keyinvoice'
  ficheiro: '' | 'com' | 'sem'
  de: string
  ate: string
}

export const FILTROS_VAZIOS: FiltrosDoc = {
  texto: '', entidade_tipo: '', tipo_documento: '', categoria: '', origem: '', ficheiro: '', de: '', ate: '',
}

// Lista os documentos (movimentos) já filtrados na BD sempre que possível.
export async function listarDocumentos(f: FiltrosDoc): Promise<MovimentoCC[]> {
  let q = supabase
    .from('financeiro_movimentos')
    .select('*')
    .order('data_documento', { ascending: false })
    .order('created_at', { ascending: false })

  if (f.entidade_tipo) q = q.eq('entidade_tipo', f.entidade_tipo)
  if (f.tipo_documento) q = q.eq('tipo_documento', f.tipo_documento)
  if (f.categoria === 'sem') q = q.is('categoria_id', null)
  else if (f.categoria) q = q.or(`categoria_id.eq.${f.categoria},subcategoria_id.eq.${f.categoria}`)
  if (f.origem) q = q.eq('origem', f.origem)
  if (f.de) q = q.gte('data_documento', f.de)
  if (f.ate) q = q.lte('data_documento', f.ate)
  if (f.ficheiro === 'com') q = q.not('ficheiro_caminho', 'is', null)
  if (f.ficheiro === 'sem') q = q.is('ficheiro_caminho', null)

  const { data } = await q.limit(1000)
  let linhas = (data as MovimentoCC[]) ?? []

  // Pesquisa livre (nº do documento ou entidade) — filtrada no cliente.
  const termo = f.texto.trim().toLowerCase()
  if (termo) {
    linhas = linhas.filter((m) =>
      `${m.documento_ref ?? ''} ${m.entidade_nome ?? ''}`.toLowerCase().includes(termo)
    )
  }
  return linhas
}

// ─── Totais do filtro ativo ───────────────────────────────────────────────────

export type TotaisDoc = { n: number; faturado: number; creditado: number }

// Soma os débitos (faturas) e os créditos (recibos/NC/pagamentos) da lista.
export function totaisDocumentos(docs: MovimentoCC[]): TotaisDoc {
  return docs.reduce(
    (t, m) => ({
      n: t.n + 1,
      faturado: t.faturado + (m.valor_debito || 0),
      creditado: t.creditado + (m.valor_credito || 0),
    }),
    { n: 0, faturado: 0, creditado: 0 }
  )
}

// ─── Export CSV (do filtro ativo) ─────────────────────────────────────────────

const LABEL_TIPO_CSV: Record<string, string> = {
  fatura: 'Fatura', nota_credito: 'Nota de crédito', recibo: 'Recibo',
  pagamento: 'Pagamento', adiantamento: 'Adiantamento',
}

function csvCampo(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Gera o CSV dos documentos (usa o mapa id→nome de categorias para a coluna).
export function exportarDocumentosCsv(docs: MovimentoCC[], nomesCategoria: Map<string, string>): string {
  const cab = ['Data', 'Tipo', 'Nº documento', 'Entidade', 'Tipo entidade', 'NIF', 'Categoria', 'Descrição', 'Vencimento', 'Débito', 'Crédito', 'Estado', 'Origem']
  const linhas = docs.map((m) => [
    m.data_documento ?? '',
    LABEL_TIPO_CSV[m.tipo_documento] ?? m.tipo_documento,
    m.documento_ref ?? '',
    m.entidade_nome ?? '',
    m.entidade_tipo,
    '',
    m.categoria_id ? nomesCategoria.get(m.subcategoria_id ?? m.categoria_id) ?? nomesCategoria.get(m.categoria_id) ?? '' : '',
    m.descricao ?? '',
    m.data_vencimento ?? '',
    String(m.valor_debito ?? 0).replace('.', ','),
    String(m.valor_credito ?? 0).replace('.', ','),
    m.estado,
    m.origem,
  ])
  return [cab, ...linhas].map((r) => r.map(csvCampo).join(';')).join('\r\n')
}

// Descarrega uma string CSV como ficheiro (com BOM para o Excel abrir bem os acentos).
export function descarregarCsv(conteudo: string, nomeFicheiro: string) {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeFicheiro
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

// Anexa (ou substitui) o PDF/imagem de um documento.
export async function anexarFicheiro(
  movimentoId: string,
  ficheiro: File
): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${movimentoId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_FIN_DOCS).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { error: erroBd } = await supabase
    .from('financeiro_movimentos')
    .update({ ficheiro_caminho: caminho, ficheiro_nome: ficheiro.name })
    .eq('id', movimentoId)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

// Remove o ficheiro de um documento (storage + referência na BD).
export async function removerFicheiro(movimentoId: string, caminho: string) {
  await supabase.storage.from(BUCKET_FIN_DOCS).remove([caminho])
  return supabase
    .from('financeiro_movimentos')
    .update({ ficheiro_caminho: null, ficheiro_nome: null })
    .eq('id', movimentoId)
}

// Gera um URL assinado temporário para abrir/descarregar o ficheiro.
export async function urlAssinado(caminho: string, segundos = 60): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_FIN_DOCS).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}
