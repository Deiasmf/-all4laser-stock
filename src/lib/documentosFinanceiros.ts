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
  origem: '' | 'manual' | 'keyinvoice'
  ficheiro: '' | 'com' | 'sem'
  de: string
  ate: string
}

export const FILTROS_VAZIOS: FiltrosDoc = {
  texto: '', entidade_tipo: '', tipo_documento: '', origem: '', ficheiro: '', de: '', ate: '',
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
