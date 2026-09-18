import { supabase } from './supabase'
import type { ZonaTransporte } from './transportes'

// Camada de dados dos recursos da Agenda de Transportes (Fase B):
// motoristas, parceiros externos e carrinhas. RLS: is_staff().

// ─── Motoristas ──────────────────────────────────────────────────────────────
export type TipoMotorista = 'principal' | 'reforco'
export type Motorista = {
  id: string
  nome: string
  user_id: string | null
  zona_principal: ZonaTransporte | null
  tipo: TipoMotorista
  ativo: boolean
  utilizador?: { nome: string | null } | null
}

export async function listarMotoristas(): Promise<Motorista[]> {
  const { data } = await supabase
    .from('transport_drivers')
    .select('*, utilizador:profiles(nome)')
    .order('tipo').order('nome')
  return (data as Motorista[]) ?? []
}
export async function criarMotorista(input: { nome: string; tipo: TipoMotorista; zona_principal: ZonaTransporte | null; user_id: string | null }) {
  return supabase.from('transport_drivers').insert({ ...input, nome: input.nome.trim() }).select().single()
}
export async function atualizarMotorista(id: string, patch: Partial<Pick<Motorista, 'nome' | 'tipo' | 'zona_principal' | 'user_id' | 'ativo'>>) {
  return supabase.from('transport_drivers').update(patch).eq('id', id)
}

// Perfis staff (para ligar um motorista à conta da app).
export type PerfilStaff = { id: string; nome: string | null }
export async function listarPerfisStaff(): Promise<PerfilStaff[]> {
  const { data } = await supabase.from('profiles').select('id, nome').order('nome').limit(500)
  return (data as PerfilStaff[]) ?? []
}

// ─── Parceiros externos ──────────────────────────────────────────────────────
export type ParceiroExterno = { id: string; nome: string; email: string | null; zona: ZonaTransporte | null; ativo: boolean }
export async function listarParceiros(): Promise<ParceiroExterno[]> {
  const { data } = await supabase.from('external_partners').select('*').order('nome')
  return (data as ParceiroExterno[]) ?? []
}
export async function criarParceiro(input: { nome: string; email: string | null; zona: ZonaTransporte | null }) {
  return supabase.from('external_partners').insert({ ...input, nome: input.nome.trim(), email: input.email?.trim() || null }).select().single()
}
export async function atualizarParceiro(id: string, patch: Partial<Pick<ParceiroExterno, 'nome' | 'email' | 'zona' | 'ativo'>>) {
  return supabase.from('external_partners').update(patch).eq('id', id)
}

// ─── Carrinhas ───────────────────────────────────────────────────────────────
export type Carrinha = { id: string; nome: string; matricula: string | null; capacidade_notas: string | null; ativo: boolean }
export async function listarCarrinhas(): Promise<Carrinha[]> {
  const { data } = await supabase.from('vehicles').select('*').order('nome')
  return (data as Carrinha[]) ?? []
}
export async function criarCarrinha(input: { nome: string; matricula: string | null; capacidade_notas: string | null }) {
  return supabase.from('vehicles').insert({
    nome: input.nome.trim(),
    matricula: input.matricula?.trim() || null,
    capacidade_notas: input.capacidade_notas?.trim() || null,
  }).select().single()
}
export async function atualizarCarrinha(id: string, patch: Partial<Pick<Carrinha, 'nome' | 'matricula' | 'capacidade_notas' | 'ativo'>>) {
  return supabase.from('vehicles').update(patch).eq('id', id)
}

// ─── Indisponibilidades das carrinhas ────────────────────────────────────────
export type Indisponibilidade = { id: string; vehicle_id: string; de: string; ate: string; motivo: string | null }
export async function listarIndisponibilidades(vehicleId: string): Promise<Indisponibilidade[]> {
  const { data } = await supabase.from('vehicle_unavailability').select('*').eq('vehicle_id', vehicleId).order('de', { ascending: false })
  return (data as Indisponibilidade[]) ?? []
}
export async function criarIndisponibilidade(input: { vehicle_id: string; de: string; ate: string; motivo: string | null }) {
  return supabase.from('vehicle_unavailability').insert({ ...input, motivo: input.motivo?.trim() || null }).select().single()
}
export async function eliminarIndisponibilidade(id: string) {
  return supabase.from('vehicle_unavailability').delete().eq('id', id)
}
