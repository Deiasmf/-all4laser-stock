import { supabase } from './supabase'

// Dados de produto de um equipamento (tabela equipamento_produto, 1:1).
// A RLS deixa a equipa (staff) editar; o núcleo do inventário continua só-admin.

export const CONDICOES = [
  'Recondicionado', 'As it is', 'Usado', 'Usado em bom estado', 'Para Peças', 'Novo',
] as const
export type Condicao = (typeof CONDICOES)[number]

export const DISPONIBILIDADES = [
  { valor: 'disponivel', label: 'Disponível', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'reservado', label: 'Reservado', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'vendido', label: 'Vendido', cor: '#B91C1C', bg: '#FEE2E2' },
] as const
export function disponibilidadeInfo(v: string | null | undefined) {
  return DISPONIBILIDADES.find((d) => d.valor === v) ?? DISPONIBILIDADES[0]
}

export type EquipamentoProduto = {
  equipamento_id: string
  condicao: string | null
  condicao_descricao: string | null
  disponibilidade: string
  voltagem: string | null
  frequencia: string | null
  dimensoes: string | null
  peso_kg: number | null
  software_versao: string | null
  updated_at?: string
}

export async function obterProduto(equipamentoId: string): Promise<EquipamentoProduto | null> {
  const { data } = await supabase.from('equipamento_produto')
    .select('*').eq('equipamento_id', equipamentoId).maybeSingle()
  return (data as EquipamentoProduto) ?? null
}

export async function guardarProduto(equipamentoId: string, patch: Partial<EquipamentoProduto>) {
  return supabase.from('equipamento_produto').upsert(
    { equipamento_id: equipamentoId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'equipamento_id' },
  )
}
