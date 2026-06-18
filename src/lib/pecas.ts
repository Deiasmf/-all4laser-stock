import { supabase } from './supabase'
import type { Peca, FolhaMaterial, FolhaMaterialComPeca } from '@/types/peca'

// ── Peças (stock) ──

export async function listarPecas(): Promise<Peca[]> {
  const { data } = await supabase
    .from('pecas')
    .select('*')
    .order('marca')
    .order('grupo')
    .order('nome')
  return (data as Peca[]) ?? []
}

// Pesquisa para o seletor de material (nome/grupo/marca)
export async function pesquisarPecas(q: string): Promise<Peca[]> {
  const termo = q.trim()
  let query = supabase.from('pecas').select('*').order('nome').limit(20)
  if (termo) query = query.or(`nome.ilike.%${termo}%,grupo.ilike.%${termo}%,marca.ilike.%${termo}%`)
  const { data } = await query
  return (data as Peca[]) ?? []
}

export async function criarPeca(p: Partial<Peca>) {
  return supabase.from('pecas').insert({
    nome: p.nome,
    marca: p.marca ?? null,
    grupo: p.grupo ?? null,
    referencia: p.referencia ?? null,
    quantidade: p.quantidade ?? 0,
    notas: p.notas ?? null,
    localizacao: p.localizacao ?? null,
  }).select().single()
}

export async function atualizarPeca(id: string, p: Partial<Peca>) {
  return supabase.from('pecas').update({
    nome: p.nome,
    marca: p.marca ?? null,
    grupo: p.grupo ?? null,
    referencia: p.referencia ?? null,
    quantidade: p.quantidade ?? 0,
    notas: p.notas ?? null,
    localizacao: p.localizacao ?? null,
  }).eq('id', id).select().single()
}

export function eliminarPeca(id: string) {
  return supabase.from('pecas').delete().eq('id', id)
}

// ── Material das folhas de obra (desconta/repõe stock via trigger) ──

export async function listarMateriaisFolha(folhaId: string): Promise<FolhaMaterialComPeca[]> {
  const { data } = await supabase
    .from('folha_obra_materiais')
    .select('*, peca:pecas(nome, marca, grupo, quantidade)')
    .eq('folha_id', folhaId)
    .order('created_at', { ascending: true })
  return (data as FolhaMaterialComPeca[]) ?? []
}

export function adicionarMaterial(folhaId: string, peca: Peca, quantidade: number) {
  return supabase.from('folha_obra_materiais').insert({
    folha_id: folhaId,
    peca_id: peca.id,
    descricao: peca.nome,
    quantidade,
  }).select().single()
}

export function removerMaterial(id: string) {
  return supabase.from('folha_obra_materiais').delete().eq('id', id)
}

// Lista simples (para o PDF): descrição + quantidade
export type MaterialLinha = Pick<FolhaMaterial, 'descricao' | 'quantidade'>
