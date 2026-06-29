// Portal de Reservas — tipos, regras de negócio e acesso a dados.
// Usado pelas páginas do cliente (/reservas) e pela gestão interna (/comercial/reservas-portal).
import { supabase } from './supabase'

// ── Contactos mostrados às clientes (rodapé, mensagens, SMS). ──
// Ambos fazem gestão de clientes, por isso aparecem os dois.
export const CONTACTOS_ALL4LASER = [
  { nome: 'Dinis Águeda', numero: '+351965155500', display: '+351 965 155 500' },
  { nome: 'Eduardo Esteves', numero: '+351963260883', display: '+351 963 260 883' },
]

// Versão em texto para SMS / mensagens curtas.
export const CONTACTO_ALL4LASER = CONTACTOS_ALL4LASER.map((c) => c.display).join(' / ')

// ── Quem pode validar reservas (confirmar/rejeitar). Admins também podem sempre. ──
export const VALIDADORES_EMAILS = [
  'andreia.fernandes@all4laser.com',
  'dinis.agueda@all4laser.com',
  'eduardo.esteves@all4laser.com',
]

export function podeValidar(email: string | null | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return true
  return !!email && VALIDADORES_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase())
}

// ── Calendários Google por equipamento/região ──
// O staff escolhe o calendário ao confirmar a reserva. O evento é criado nesse calendário.
// A Service Account personifica andreia.fernandes@all4laser.com (Domain-Wide Delegation),
// por isso escreve em qualquer calendário que ela consiga editar — sem partilhar cada um.
export type CalendarioReserva = { nome: string; id: string }
export const CALENDARIOS_RESERVAS: CalendarioReserva[] = [
  { nome: 'Lisboa · Gentle ProU (Alex A)', id: 'all4laser.com_t5fharmhm7rqfllte42te6v9is@group.calendar.google.com' },
  { nome: 'Lisboa · Gmax Pro/Pro Plus (Alex B)', id: 'all4laser.com_k7cjifhrancibi3mek6ddm3v30@group.calendar.google.com' },
  { nome: 'Norte · Gentle ProU (Alex K - Gpro Norte 1)', id: 'c_d6bua321f1qn1hk6kdj5dgb6cc@group.calendar.google.com' },
  { nome: 'Norte · Gmax Pro/Pro Plus (Gmax Pro Norte)', id: 'smvj02908gh5ria1qkau3dnkjo@group.calendar.google.com' },
  { nome: 'Algarve · Gentle ProU/Gmax Pro/Pro Plus (Alex J)', id: 'c_604fac79664df0563c312a18b25e83c0c050f858b3e21da94a1788b57aa62ff5@group.calendar.google.com' },
  { nome: 'Soprano ICE (Laser Diodo Alma)', id: '4lkg67nkaelf90sljtpdu4941g@group.calendar.google.com' },
  { nome: 'Soprano Platinum', id: 'c_fbefdaac7e695feec5d4a4c3f49d7c6de31af4b04588a65a1ed558fd9db263d3@group.calendar.google.com' },
]

// Devolve true se o id é um calendário conhecido (ou vazio = usar o geral).
export function calendarioValido(id: string): boolean {
  return id === '' || CALENDARIOS_RESERVAS.some((c) => c.id !== '' && c.id === id)
}

// ── Modelos disponíveis para reserva ──
export const MODELOS_RESERVA = [
  'GentleMax Pro Plus',
  'GentleMax Pro',
  'GentlePro U',
  'GentlePro',
  'Mini GentleLase',
  'Mini GentleYag',
  'Soprano ICE',
  'Soprano Platinum',
] as const

// ── Modalidades de aluguer ──
export type Modalidade = '1_dia' | '3_dias' | 'semanal' | 'quinzenal'

export const MODALIDADES: { valor: Modalidade; label: string }[] = [
  { valor: '1_dia', label: '1 dia' },
  { valor: '3_dias', label: '3 dias' },
  { valor: 'semanal', label: 'Semanal (5 dias úteis)' },
  { valor: 'quinzenal', label: 'Quinzenal (10 dias úteis)' },
]

export function modalidadeLabel(m: string): string {
  return MODALIDADES.find((x) => x.valor === m)?.label ?? m
}

// ── Estados da reserva (badges) ──
export type EstadoReserva = 'pendente' | 'confirmada' | 'rejeitada' | 'cancelada'

export function estadoInfo(estado: string): { label: string; cor: string; bg: string } {
  switch (estado) {
    case 'confirmada': return { label: 'Confirmada', cor: '#1a7f37', bg: '#e7f6ec' }
    case 'rejeitada':  return { label: 'Rejeitada', cor: '#b42318', bg: '#fde8e6' }
    case 'cancelada':  return { label: 'Cancelada', cor: '#555', bg: '#ececec' }
    default:           return { label: 'Pendente', cor: '#9a6700', bg: '#fff3cd' }
  }
}

// ── Datas (trabalhamos com strings 'YYYY-MM-DD' para evitar fusos horários) ──
function parse(d: string): Date {
  const [y, m, dia] = d.split('-').map(Number)
  return new Date(y, m - 1, dia)
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function hojeISO(): string {
  return fmt(new Date())
}

// Data mínima de início: hoje + 7 dias (1 semana de antecedência).
export function dataMinimaInicio(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return fmt(d)
}

// Devolve a data do n-ésimo dia útil a partir de `inicio` (o início conta como dia 1, se útil).
function diaUtilN(inicio: Date, n: number): Date {
  const d = new Date(inicio)
  let contados = 0
  while (true) {
    const dow = d.getDay() // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) contados++
    if (contados >= n) break
    d.setDate(d.getDate() + 1)
  }
  return d
}

// Calcula a data de fim conforme a modalidade.
export function calcularDataFim(dataInicio: string, modalidade: Modalidade): string {
  if (!dataInicio) return ''
  const inicio = parse(dataInicio)
  switch (modalidade) {
    case '1_dia': return fmt(inicio)
    case '3_dias': { const d = new Date(inicio); d.setDate(d.getDate() + 2); return fmt(d) }
    case 'semanal': return fmt(diaUtilN(inicio, 5))
    case 'quinzenal': return fmt(diaUtilN(inicio, 10))
  }
}

export function formatarData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${y}`
}

// ── Tipo da reserva ──
export type ReservaPortal = {
  id: string
  numero: string | null
  cliente_portal_id: string | null
  cliente_nome: string | null
  cliente_email: string | null
  cliente_telefone: string | null
  modelo_equipamento: string | null
  modalidade: string | null
  data_inicio_pretendida: string
  data_fim_pretendida: string
  notas_cliente: string | null
  estado: string
  motivo_rejeicao: string | null
  validado_por_nome: string | null
  validado_at: string | null
  sms_confirmacao_enviado: boolean
  created_at: string
  updated_at: string
}

// ── Acesso a dados ──

// Reservas da cliente autenticada (RLS limita às próprias).
export async function listarMinhasReservas(): Promise<ReservaPortal[]> {
  const { data } = await supabase
    .from('reservas_portal')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as ReservaPortal[]) ?? []
}

// Todas as reservas (uso interno — RLS exige staff).
export async function listarTodasReservas(): Promise<ReservaPortal[]> {
  const { data } = await supabase
    .from('reservas_portal')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as ReservaPortal[]) ?? []
}

export async function obterReserva(id: string): Promise<ReservaPortal | null> {
  const { data } = await supabase.from('reservas_portal').select('*').eq('id', id).single()
  return (data as ReservaPortal) ?? null
}

export type NovaReserva = {
  cliente_portal_id: string
  cliente_nome: string | null
  cliente_email: string | null
  cliente_telefone: string | null
  modelo_equipamento: string
  modalidade: Modalidade
  data_inicio_pretendida: string
  data_fim_pretendida: string
  notas_cliente: string | null
}

export async function criarReserva(r: NovaReserva): Promise<{ ok: boolean; erro?: string; id?: string }> {
  const { data, error } = await supabase.from('reservas_portal').insert(r).select('id').single()
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

// A própria cliente cancela um pedido ainda pendente.
export async function cancelarReserva(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from('reservas_portal')
    .update({ estado: 'cancelada' })
    .eq('id', id)
    .eq('estado', 'pendente')
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}
