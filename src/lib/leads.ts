import { supabase } from './supabase'
import type { EstadoLead, Lead } from '@/types/lead'

export async function listarLeads(): Promise<Lead[]> {
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as Lead[]) ?? []
}

// Criação manual de uma lead pela equipa (canais sem entrada automática:
// email, bimedis, telefone, referência...). Devolve { data, error }.
export async function criarLead(
  campos: Pick<Lead, 'nome' | 'canal'> &
    Partial<Pick<Lead, 'email' | 'telefone' | 'cidade' | 'modelo_interesse' | 'data_inicio' | 'data_fim' | 'mensagem'>>
) {
  return supabase
    .from('leads')
    .insert({ ...campos, estado: 'nova' })
    .select('*')
    .single()
}

export async function atualizarLead(
  id: string,
  campos: Partial<Pick<Lead, 'estado' | 'nota_interna'>>
) {
  return supabase
    .from('leads')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function eliminarLead(id: string) {
  return supabase.from('leads').delete().eq('id', id)
}

export const ESTADOS_SEGUINTES: Record<EstadoLead, EstadoLead[]> = {
  nova: ['contactada', 'proposta_enviada', 'convertida', 'perdida'],
  contactada: ['proposta_enviada', 'convertida', 'perdida'],
  proposta_enviada: ['convertida', 'perdida'],
  convertida: [],
  perdida: ['nova'],
}
