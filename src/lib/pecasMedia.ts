import { supabase } from './supabase'
import { comprimirImagem } from './mediaUpload'

// Fotografias por artigo/peça (bucket público 'pecas-media', escrita só staff).
export const BUCKET_PECAS = 'pecas-media'
export const LIMITE_FICHEIRO_MB = 25 // limite razoável por ficheiro (fotos)

export type PecaMedia = {
  id: string; peca_id: string; url: string; caminho: string; nome: string | null
  tipo: string; ordem: number; capa: boolean; criado_por_nome: string | null; created_at: string
}
export type Autor = { id: string | null; nome: string | null }
export type ResultadoUpload = { carregados: number; total: number; grandes: string[]; falhas: { nome: string; motivo: string }[] }

function nomeSeguro(nome: string) { return nome.normalize('NFD').replace(/[^\w.\-]/g, '_') }

export async function listarMediaPeca(pecaId: string): Promise<PecaMedia[]> {
  const { data } = await supabase.from('pecas_media').select('*').eq('peca_id', pecaId)
    .order('capa', { ascending: false }).order('ordem', { ascending: true }).order('created_at', { ascending: true })
  return (data as PecaMedia[]) ?? []
}

export async function carregarMediaPeca(
  pecaId: string, ficheiros: File[], autor: Autor,
  onProgresso?: (feitos: number, total: number) => void, ordemInicial = 0,
): Promise<ResultadoUpload> {
  const limiteBytes = LIMITE_FICHEIRO_MB * 1024 * 1024
  const res: ResultadoUpload = { carregados: 0, total: ficheiros.length, grandes: [], falhas: [] }
  // Se a peça ainda não tem fotos, a primeira carregada fica como capa.
  const { count } = await supabase.from('pecas_media').select('id', { count: 'exact', head: true }).eq('peca_id', pecaId)
  let semCapa = (count ?? 0) === 0
  let feitos = 0
  for (const original of ficheiros) {
    feitos++; onProgresso?.(feitos, ficheiros.length)
    const ficheiro = await comprimirImagem(original)
    if (ficheiro.size > limiteBytes) { res.grandes.push(original.name); continue }
    const caminho = `${pecaId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_PECAS).upload(caminho, ficheiro)
    if (error) {
      if (/exceed|maximum|too large|payload|size/i.test(error.message)) res.grandes.push(original.name)
      else res.falhas.push({ nome: original.name, motivo: error.message })
      continue
    }
    const { data: pub } = supabase.storage.from(BUCKET_PECAS).getPublicUrl(caminho)
    const { error: erroBd } = await supabase.from('pecas_media').insert({
      peca_id: pecaId, url: pub.publicUrl, caminho, tipo: 'foto', nome: original.name,
      ordem: ordemInicial + feitos, capa: semCapa, criado_por: autor.id, criado_por_nome: autor.nome,
    })
    if (erroBd) { res.falhas.push({ nome: original.name, motivo: erroBd.message }); continue }
    semCapa = false
    res.carregados++
  }
  return res
}

export async function definirCapaPeca(pecaId: string, mediaId: string) {
  await supabase.from('pecas_media').update({ capa: false }).eq('peca_id', pecaId)
  return supabase.from('pecas_media').update({ capa: true }).eq('id', mediaId)
}

export async function guardarOrdemMediaPeca(idsOrdenados: string[]) {
  await Promise.all(idsOrdenados.map((id, i) => supabase.from('pecas_media').update({ ordem: i }).eq('id', id)))
}

export async function apagarMediaPeca(m: { id: string; caminho: string }) {
  if (m.caminho) await supabase.storage.from(BUCKET_PECAS).remove([m.caminho])
  return supabase.from('pecas_media').delete().eq('id', m.id)
}

// Capa (miniatura) de várias peças de uma vez — para listagens e ecrãs de seleção.
export async function capasDePecas(pecaIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(pecaIds.filter(Boolean)))
  if (!ids.length) return new Map()
  const { data } = await supabase.from('pecas_media').select('peca_id, url, capa, ordem, created_at').in('peca_id', ids)
  const rows = (data as { peca_id: string; url: string; capa: boolean; ordem: number; created_at: string }[]) ?? []
  const byPeca = new Map<string, typeof rows>()
  for (const r of rows) { const a = byPeca.get(r.peca_id) ?? []; a.push(r); byPeca.set(r.peca_id, a) }
  const capas = new Map<string, string>()
  for (const [pid, arr] of byPeca) {
    arr.sort((a, b) => (Number(b.capa) - Number(a.capa)) || (a.ordem - b.ordem) || a.created_at.localeCompare(b.created_at))
    if (arr[0]) capas.set(pid, arr[0].url)
  }
  return capas
}
