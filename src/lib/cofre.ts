import { supabase } from './supabase'

// Cofre de documentos importantes da empresa. Bucket privado financial-docs;
// visualização/download por URL assinada gerada no servidor (que também regista
// o acesso no log de auditoria).

export const BUCKET_COFRE = 'financial-docs'

export type Categoria = { id: string; nome: string; ordem: number }

export type FicheiroCofre = {
  id: string
  document_id: string
  caminho: string
  nome: string | null
  tamanho: number | null
  content_type: string | null
  created_at: string
}

export type DocumentoCofre = {
  id: string
  titulo: string
  categoria_id: string | null
  descricao: string | null
  data_validade: string | null
  entidade_nome: string | null
  arquivado: boolean
  created_by: string | null
  created_by_nome: string | null
  created_at: string
  updated_at: string
  categoria?: { nome: string } | null
  ficheiros?: FicheiroCofre[]
}

export type AcessoLog = {
  id: string
  document_id: string | null
  document_titulo: string | null
  acao: 'view' | 'download'
  user_id: string | null
  user_nome: string | null
  created_at: string
}

export type DocumentoInput = {
  titulo: string
  categoria_id: string | null
  descricao: string | null
  data_validade: string | null
  entidade_nome: string | null
}

// ─── Categorias ──────────────────────────────────────────────────────────────

export async function listarCategorias(): Promise<Categoria[]> {
  const { data } = await supabase.from('financial_document_categories').select('*').order('ordem')
  return (data as Categoria[]) ?? []
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export async function listarDocumentos(opts?: { arquivados?: boolean }): Promise<DocumentoCofre[]> {
  const { data } = await supabase
    .from('financial_documents')
    .select('*, categoria:financial_document_categories(nome), ficheiros:financial_document_files(*)')
    .eq('arquivado', opts?.arquivados ?? false)
    .order('created_at', { ascending: false })
  return (data as DocumentoCofre[]) ?? []
}

export async function criarDocumento(input: DocumentoInput, criadoPor: { id: string | null; nome: string | null }) {
  return supabase.from('financial_documents').insert({
    ...input,
    created_by: criadoPor.id,
    created_by_nome: criadoPor.nome,
  }).select().single()
}

export async function atualizarDocumento(id: string, patch: Partial<DocumentoInput>) {
  return supabase.from('financial_documents').update(patch).eq('id', id).select().single()
}

export async function arquivarDocumento(id: string, arquivado = true) {
  return supabase.from('financial_documents').update({ arquivado }).eq('id', id)
}

// ─── Ficheiros ───────────────────────────────────────────────────────────────

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

export async function anexarFicheiro(documentId: string, ficheiro: File): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${documentId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_COFRE).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { error: erroBd } = await supabase.from('financial_document_files').insert({
    document_id: documentId,
    caminho,
    nome: ficheiro.name,
    tamanho: ficheiro.size,
    content_type: ficheiro.type || null,
  })
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

export async function removerFicheiro(fileId: string, caminho: string) {
  await supabase.storage.from(BUCKET_COFRE).remove([caminho])
  return supabase.from('financial_document_files').delete().eq('id', fileId)
}

// Pede ao servidor uma URL assinada (curta) e regista o acesso. Devolve o URL.
export async function abrirFicheiro(
  f: FicheiroCofre,
  acao: 'view' | 'download',
  doc: DocumentoCofre
): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  const r = await fetch('/api/financeiro/documento-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ caminho: f.caminho, acao, documentId: doc.id, fileId: f.id, documentTitulo: doc.titulo }),
  })
  const j = await r.json().catch(() => null)
  return j?.ok ? (j.url as string) : null
}

// ─── Validade ────────────────────────────────────────────────────────────────

const DIA = 86400000
export function diasAteValidade(data: string | null, hoje = new Date().toISOString().slice(0, 10)): number | null {
  if (!data) return null
  return Math.floor((Date.parse(data) - Date.parse(hoje)) / DIA)
}

// Documentos (não arquivados) a expirar dentro de `dias` (inclui já expirados).
export async function documentosAExpirar(dias = 30): Promise<DocumentoCofre[]> {
  const docs = await listarDocumentos()
  return docs
    .filter((d) => {
      const n = diasAteValidade(d.data_validade)
      return n !== null && n <= dias
    })
    .sort((a, b) => (diasAteValidade(a.data_validade) ?? 0) - (diasAteValidade(b.data_validade) ?? 0))
}

// ─── Log de acessos (só admin, por RLS) ──────────────────────────────────────

export async function listarAcessos(documentId: string): Promise<AcessoLog[]> {
  const { data } = await supabase
    .from('financial_document_access_log')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as AcessoLog[]) ?? []
}
