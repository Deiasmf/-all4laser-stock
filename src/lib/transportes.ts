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

// ─── Paragens (transport_stops) ──────────────────────────────────────────────
export type EstadoParagem = 'por_classificar' | 'planeada' | 'confirmada' | 'concluida' | 'cancelada'
export const ESTADOS_PARAGEM: { valor: EstadoParagem; label: string; cor: string; bg: string }[] = [
  { valor: 'por_classificar', label: 'Por classificar', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'planeada', label: 'Planeada', cor: '#1D4ED8', bg: '#DBEAFE' },
  { valor: 'confirmada', label: 'Confirmada', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'concluida', label: 'Concluída', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'cancelada', label: 'Cancelada', cor: '#B91C1C', bg: '#FEE2E2' },
]
export function estadoParagemInfo(v: string) {
  return ESTADOS_PARAGEM.find((e) => e.valor === v) ?? ESTADOS_PARAGEM[0]
}

// Nome do dia da semana em PT a partir de 'YYYY-MM-DD' (sem problemas de fuso).
const DIAS_SEMANA_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export function diaSemanaPt(ymd: string | null): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return DIAS_SEMANA_PT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
}
// Data curta 'DD/MM' a partir de 'YYYY-MM-DD'.
export function dataCurta(ymd: string | null): string {
  if (!ymd) return '—'
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
}

export type TransportStop = {
  id: string
  google_event_id: string | null
  calendar_id: string | null
  zona: string | null
  equipamento_id: string | null
  data: string | null
  janela_inicio: string | null
  janela_fim: string | null
  tipo: 'entrega' | 'recolha' | 'indefinido'
  cliente_nome: string | null
  cliente_id: string | null
  morada: string | null
  notas: string | null
  titulo_raw: string | null
  descricao_raw: string | null
  estado: EstadoParagem
  confianca: string | null
  aviso_morada: boolean
  alterado: boolean
  link_evento: string | null
  sincronizado_em: string | null
  calendario?: { nome: string | null } | null
}

export type FiltroParagens = { zona?: ZonaTransporte; estado?: EstadoParagem; de?: string; ate?: string }

export async function listarParagens(f: FiltroParagens = {}): Promise<TransportStop[]> {
  let q = supabase
    .from('transport_stops')
    .select('*, calendario:transport_calendars(nome)')
    .neq('estado', 'cancelada')
    .order('data', { ascending: true })
    .order('janela_inicio', { ascending: true, nullsFirst: true })
  if (f.zona) q = q.eq('zona', f.zona)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.de) q = q.gte('data', f.de)
  if (f.ate) q = q.lte('data', f.ate)
  const { data } = await q
  return (data as TransportStop[]) ?? []
}

// Dispara a sincronização manual (usa a sessão do utilizador; staff).
export async function sincronizarAgora(): Promise<{ ok: boolean; erro?: string; novos?: number; alterados?: number; cancelados?: number; calendarios?: number; erros?: string[] }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, erro: 'Sessão expirada — volta a entrar.' }
  const r = await fetch('/api/alugueres/agenda/sincronizar', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  const j = await r.json()
  if (!r.ok) return { ok: false, erro: j.erro ?? `HTTP ${r.status}` }
  return j
}
