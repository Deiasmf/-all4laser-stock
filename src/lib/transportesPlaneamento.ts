import { supabase } from './supabase'
import type { TransportStop } from './transportes'

// Camada de dados do planeamento diário (Fase C). RLS: is_staff().

export type EstadoDriverDay = 'provisorio' | 'publicado'
export type DriverDay = {
  id: string
  data: string
  driver_id: string
  vehicle_id: string | null
  estado: EstadoDriverDay
}

// Paragens de um dia (não canceladas), com nome do calendário/equipamento.
export async function listarParagensDia(data: string): Promise<TransportStop[]> {
  const { data: rows } = await supabase
    .from('transport_stops')
    .select('*, calendario:transport_calendars(nome)')
    .eq('data', data)
    .neq('estado', 'cancelada')
    .order('zona')
    .order('cliente_nome')
  return (rows as TransportStop[]) ?? []
}

// Atribuir (ou tirar) o motorista de uma paragem.
export async function atribuirMotorista(stopId: string, motoristaId: string | null) {
  return supabase.from('transport_stops').update({ motorista_id: motoristaId }).eq('id', stopId)
}

// Estados dos motoristas nesse dia (carrinha + publicado).
export async function listarDriverDays(data: string): Promise<DriverDay[]> {
  const { data: rows } = await supabase.from('transport_driver_days').select('*').eq('data', data)
  return (rows as DriverDay[]) ?? []
}

// Carrinha já atribuída a OUTRO motorista no mesmo dia? (aviso, não bloqueio)
export async function carrinhaEmConflito(data: string, vehicleId: string, driverId: string): Promise<string | null> {
  const { data: rows } = await supabase
    .from('transport_driver_days')
    .select('driver_id, motorista:transport_drivers(nome)')
    .eq('data', data).eq('vehicle_id', vehicleId).neq('driver_id', driverId)
  const r = (rows as { driver_id: string; motorista?: { nome: string | null } }[] | null)?.[0]
  return r ? (r.motorista?.nome ?? 'outro motorista') : null
}

// Definir/limpar a carrinha de um motorista nesse dia (upsert por (data,driver)).
export async function definirCarrinha(data: string, driverId: string, vehicleId: string | null) {
  return supabase.from('transport_driver_days')
    .upsert({ data, driver_id: driverId, vehicle_id: vehicleId }, { onConflict: 'data,driver_id' })
}

// Publicar o dia: marca como "publicado" os motoristas indicados (com paragens).
export async function publicarDia(data: string, driverIds: string[]): Promise<{ ok: boolean; erro?: string }> {
  if (driverIds.length === 0) return { ok: true }
  const linhas = driverIds.map((driver_id) => ({ data, driver_id, estado: 'publicado' as const }))
  const { error } = await supabase.from('transport_driver_days').upsert(linhas, { onConflict: 'data,driver_id' })
  return { ok: !error, erro: error?.message }
}

// Repor o dia como provisório.
export async function despublicarDia(data: string) {
  return supabase.from('transport_driver_days').update({ estado: 'provisorio' }).eq('data', data)
}
