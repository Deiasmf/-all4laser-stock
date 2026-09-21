import { supabase } from './supabase'
import type { TransportStop } from './transportes'
import type { DriverDay } from './transportesPlaneamento'

// Camada de dados da vista mobile do motorista. RLS: is_staff() (o motorista é
// um utilizador interno; vê e mexe só nas SUAS paragens porque a query filtra
// pelo motorista ligado ao seu login).

export type MotoristaLogado = {
  id: string
  nome: string
  partida_morada: string | null
}

// O motorista associado ao utilizador autenticado (transport_drivers.user_id).
export async function motoristaDoUtilizador(userId: string): Promise<MotoristaLogado | null> {
  const { data } = await supabase
    .from('transport_drivers')
    .select('id, nome, partida_morada')
    .eq('user_id', userId)
    .eq('ativo', true)
    .maybeSingle()
  return (data as MotoristaLogado | null) ?? null
}

// O plano do motorista nesse dia (carrinha + estado). Só existe se já foi
// planeado; a vista só mostra paragens quando o dia está publicado/confirmado.
export async function diaDoMotorista(driverId: string, data: string): Promise<(DriverDay & { carrinha?: { nome: string | null; matricula: string | null } | null }) | null> {
  const { data: row } = await supabase
    .from('transport_driver_days')
    .select('*, carrinha:vehicles(nome, matricula)')
    .eq('driver_id', driverId)
    .eq('data', data)
    .maybeSingle()
  return (row as (DriverDay & { carrinha?: { nome: string | null; matricula: string | null } | null }) | null) ?? null
}

// Paragens do motorista no dia (não canceladas), por ordem de rota.
export async function paragensDoMotorista(driverId: string, data: string): Promise<TransportStop[]> {
  const { data: rows } = await supabase
    .from('transport_stops')
    .select('*, calendario:transport_calendars(nome, equipamento:equipamentos(serial_number))')
    .eq('motorista_id', driverId)
    .eq('data', data)
    .neq('estado', 'cancelada')
    .order('ordem', { nullsFirst: false })
    .order('janela_inicio', { nullsFirst: true })
  return (rows as TransportStop[]) ?? []
}

// Marcar/desmarcar uma paragem como feita (via RPC, valida staff).
export async function marcarParagem(stopId: string, feita: boolean) {
  return supabase.rpc('transport_stop_marcar', { p_stop: stopId, p_feita: feita })
}

// Guardar a nota do motorista numa paragem.
export async function guardarNotaMotorista(stopId: string, nota: string) {
  return supabase.rpc('transport_stop_nota', { p_stop: stopId, p_nota: nota })
}

// Link de direções do Google Maps para a paragem (usa coordenadas se existirem).
export function linkMapa(s: Pick<TransportStop, 'lat' | 'lng' | 'morada'>): string | null {
  if (s.lat != null && s.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  }
  if (s.morada && s.morada.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.morada.trim())}`
  }
  return null
}
