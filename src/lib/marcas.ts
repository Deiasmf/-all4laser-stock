import { supabase } from './supabase'

// Marcas (tabela partilhada com equipamentos). Usada no dropdown de marca das peças.
export type Marca = { id: string; nome: string; ativo: boolean }
export type MarcaSemelhante = { id: string; nome: string; ativo: boolean; exato: boolean; sim: number }

export async function listarMarcas(incluirInativas = false): Promise<Marca[]> {
  let q = supabase.from('marcas').select('id, nome, ativo').order('nome')
  if (!incluirInativas) q = q.eq('ativo', true)
  const { data } = await q
  return (data as Marca[]) ?? []
}

// Marcas iguais (normalizado) ou parecidas (typo) — para o aviso ao criar nova.
export async function marcasSemelhantes(nome: string): Promise<MarcaSemelhante[]> {
  const n = nome.trim()
  if (n.length < 2) return []
  const { data } = await supabase.rpc('marcas_semelhantes', { p_nome: n })
  return (data as MarcaSemelhante[]) ?? []
}

export async function criarMarca(nome: string): Promise<{ error: string | null; nome: string | null }> {
  const n = nome.trim()
  if (!n) return { error: 'Nome vazio.', nome: null }
  const { data, error } = await supabase.from('marcas').insert({ nome: n }).select('nome').single()
  if (error) return { error: error.message, nome: null }
  return { error: null, nome: (data as { nome: string }).nome }
}
