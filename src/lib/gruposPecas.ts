import { supabase } from './supabase'

// Grupos de peças (modelo/grupo compatível) — lista gerível para o dropdown.
export type GrupoPeca = { id: string; nome: string; ativo: boolean }

// Normalização que mantém o "+" (Elite ≠ Elite +) e colapsa maiúsculas/acentos.
// Espelha public.norm_grupo() na BD.
export function normGrupo(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

export async function listarGruposPecas(incluirInativos = false): Promise<GrupoPeca[]> {
  let q = supabase.from('grupos_pecas').select('id, nome, ativo').order('nome')
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as GrupoPeca[]) ?? []
}

export async function criarGrupoPeca(nome: string): Promise<{ error: string | null; nome: string | null }> {
  const n = nome.trim()
  if (!n) return { error: 'Nome vazio.', nome: null }
  const { data, error } = await supabase.from('grupos_pecas').insert({ nome: n }).select('nome').single()
  if (error) return { error: error.message, nome: null }
  return { error: null, nome: (data as { nome: string }).nome }
}
