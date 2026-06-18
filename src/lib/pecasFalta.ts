import { supabase } from './supabase'
import type { PecaFalta, EstadoPecaFalta } from '@/types/compras'

export async function listarPecasFalta(): Promise<PecaFalta[]> {
  const { data } = await supabase
    .from('equipamento_pecas_em_falta')
    .select('*')
    .order('equipamento_sn', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as PecaFalta[]) ?? []
}

export async function listarFaltasDoEquipamento(equipamentoId: string): Promise<PecaFalta[]> {
  const { data } = await supabase
    .from('equipamento_pecas_em_falta')
    .select('*')
    .eq('equipamento_id', equipamentoId)
    .order('created_at', { ascending: true })
  return (data as PecaFalta[]) ?? []
}

export type FaltaInput = {
  equipamento_id: string | null
  equipamento_sn: string | null
  equipamento_modelo: string | null
  peca_id: string | null
  peca_nome: string
  quantidade_necessaria: number
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
}

export async function adicionarPecaFalta(input: FaltaInput) {
  return supabase.from('equipamento_pecas_em_falta').insert({ ...input, estado: 'em_falta' }).select().single()
}

export async function atualizarEstadoFalta(id: string, estado: EstadoPecaFalta) {
  return supabase.from('equipamento_pecas_em_falta').update({ estado }).eq('id', id)
}

// Marca várias peças em falta como 'pedida' (ao gerar um pedido de compra).
export async function marcarFaltasPedidas(ids: string[]) {
  if (ids.length === 0) return
  return supabase.from('equipamento_pecas_em_falta').update({ estado: 'pedida' }).in('id', ids)
}

export async function eliminarPecaFalta(id: string) {
  return supabase.from('equipamento_pecas_em_falta').delete().eq('id', id)
}

// Agrupa as peças em falta por equipamento (SN), para apresentação.
export type GrupoFalta = {
  chave: string
  equipamento_id: string | null
  equipamento_sn: string | null
  equipamento_modelo: string | null
  pecas: PecaFalta[]
}

export function agruparPorEquipamento(lista: PecaFalta[]): GrupoFalta[] {
  const grupos: GrupoFalta[] = []
  for (const p of lista) {
    const chave = p.equipamento_sn ?? p.equipamento_id ?? p.id
    let g = grupos.find((x) => x.chave === chave)
    if (!g) {
      g = {
        chave,
        equipamento_id: p.equipamento_id,
        equipamento_sn: p.equipamento_sn,
        equipamento_modelo: p.equipamento_modelo,
        pecas: [],
      }
      grupos.push(g)
    }
    g.pecas.push(p)
  }
  return grupos
}
