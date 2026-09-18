import { supabase } from './supabase'

// Camada de dados da Agenda de Transportes. RLS: is_staff() (qualquer staff).

export type ZonaTransporte = 'lisboa' | 'norte' | 'algarve'
export const ZONAS_TRANSPORTE: { valor: ZonaTransporte; label: string }[] = [
  { valor: 'lisboa', label: 'Lisboa' },
  { valor: 'norte', label: 'Norte' },
  { valor: 'algarve', label: 'Algarve' },
]
export function zonaLabel(z: string): string {
  return ZONAS_TRANSPORTE.find((x) => x.valor === z)?.label ?? z
}

export type TransportCalendar = {
  id: string
  google_calendar_id: string
  nome: string
  zona: ZonaTransporte
  modelo: string | null
  equipamento_id: string | null
  ativo: boolean
  // ligação (join) ao equipamento escolhido
  equipamento?: { serial_number: string | null; status: string | null } | null
}

export async function listarCalendariosMapa(): Promise<TransportCalendar[]> {
  const { data } = await supabase
    .from('transport_calendars')
    .select('*, equipamento:equipamentos(serial_number, status)')
    .order('zona')
    .order('nome')
  return (data as TransportCalendar[]) ?? []
}

export type EquipamentoOpcao = { id: string; serial_number: string | null; status: string | null; destino: string | null }

// Estados de aluguer — as unidades candidatas a estar num calendário da frota.
const STATUS_ALUGUER = ['Aluguer nacional', 'Aluguer internacional', 'Reservado']

// Unidades de um modelo (em aluguer) para o dropdown de matching. Inclui sempre
// a unidade já ligada (mesmo que não esteja em estado de aluguer).
export async function equipamentosPorModelo(modelo: string, incluirId?: string | null): Promise<EquipamentoOpcao[]> {
  // Grafias inconsistentes no inventário: "Gmax Pro" tem de apanhar também
  // "Gmaxpro Plus" → troca espaços por curinga (%).
  const padrao = `%${modelo.trim().replace(/\s+/g, '%')}%`
  const { data } = await supabase
    .from('equipamentos')
    .select('id, serial_number, status, destino')
    .ilike('modelo', padrao)
    .in('status', STATUS_ALUGUER)
    .order('serial_number')
    .limit(300)
  let lista = (data as EquipamentoOpcao[]) ?? []
  if (incluirId && !lista.some((e) => e.id === incluirId)) {
    const { data: cur } = await supabase
      .from('equipamentos').select('id, serial_number, status, destino').eq('id', incluirId).maybeSingle()
    if (cur) lista = [cur as EquipamentoOpcao, ...lista]
  }
  return lista
}

export async function atualizarCalendarioMapa(
  id: string,
  patch: Partial<Pick<TransportCalendar, 'equipamento_id' | 'zona' | 'modelo' | 'nome' | 'ativo'>>,
) {
  return supabase.from('transport_calendars').update(patch).eq('id', id)
}

export async function criarCalendarioMapa(input: {
  google_calendar_id: string; nome: string; zona: ZonaTransporte; modelo: string | null
}) {
  return supabase.from('transport_calendars').insert({
    google_calendar_id: input.google_calendar_id.trim(),
    nome: input.nome.trim(),
    zona: input.zona,
    modelo: input.modelo?.trim() || null,
  }).select().single()
}

export async function eliminarCalendarioMapa(id: string) {
  return supabase.from('transport_calendars').delete().eq('id', id)
}
