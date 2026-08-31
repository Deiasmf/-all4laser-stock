import { supabase } from './supabase'
import type { EstadoReserva, Modalidade, Reserva } from '@/types/reserva'

export async function listarReservas(): Promise<Reserva[]> {
  const { data } = await supabase
    .from('reservas')
    .select('*')
    .order('data_inicio', { ascending: false })
  return (data as Reserva[]) ?? []
}

export type NovaReserva = {
  modelo_id: string
  modelo_nome: string
  cliente_id?: string | null
  cliente_nome: string | null
  modalidade: Modalidade | null
  data_inicio: string
  data_fim: string
  com_zimmer: boolean
  estado: EstadoReserva
  nota?: string | null
}

export async function criarReserva(r: NovaReserva) {
  return supabase.from('reservas').insert(r).select('id').single()
}

export async function atualizarEstadoReserva(id: string, estado: EstadoReserva) {
  return supabase
    .from('reservas')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function eliminarReserva(id: string) {
  return supabase.from('reservas').delete().eq('id', id)
}

export async function listarClientesNomes(): Promise<{ id: string; nome: string }[]> {
  // .limit explícito: sem ele o Supabase devolve só 1000 linhas (há >1000 clientes).
  const { data } = await supabase.from('clientes').select('id, nome').order('nome').limit(5000)
  return (data as { id: string; nome: string }[]) ?? []
}
