import { supabase } from './supabase'

// "A Minha Área" — tarefas e recados por colaborador.
// A RLS garante o isolamento (cada um só vê o seu; admin vê todas as tarefas e
// os recados que enviou). Mesmo assim filtramos por utilizador nas queries "as
// minhas", porque um admin lê tudo e não queremos misturar áreas.

// ─── Prioridades e estados ───────────────────────────────────────────────────

export type Prioridade = 'baixa' | 'normal' | 'alta'
export type EstadoTarefa = 'pendente' | 'em_curso' | 'concluida'

export const PRIORIDADES: { valor: Prioridade; label: string; cor: string; bg: string; ordem: number }[] = [
  { valor: 'alta', label: 'Alta', cor: '#B91C1C', bg: '#FEF2F2', ordem: 0 },
  { valor: 'normal', label: 'Normal', cor: '#1E40AF', bg: '#DBEAFE', ordem: 1 },
  { valor: 'baixa', label: 'Baixa', cor: '#374151', bg: '#E5E7EB', ordem: 2 },
]
export function prioridadeInfo(v: string) {
  return PRIORIDADES.find((p) => p.valor === v) ?? PRIORIDADES[1]
}

export const ESTADOS_TAREFA: { valor: EstadoTarefa; label: string }[] = [
  { valor: 'pendente', label: 'Pendente' },
  { valor: 'em_curso', label: 'Em curso' },
  { valor: 'concluida', label: 'Concluída' },
]
export function estadoTarefaLabel(v: string) {
  return ESTADOS_TAREFA.find((e) => e.valor === v)?.label ?? v
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Tarefa = {
  id: string
  assigned_to: string
  created_by: string | null
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  data_limite: string | null
  estado: EstadoTarefa
  concluida_em: string | null
  created_at: string
  updated_at: string
}

export type TarefaInput = {
  assigned_to: string
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  data_limite: string | null
}

export type Recado = {
  id: string
  to_user: string
  from_user: string | null
  mensagem: string
  urgente: boolean
  lida: boolean
  lida_em: string | null
  created_at: string
  updated_at: string
}

export type RecadoInput = {
  to_user: string
  mensagem: string
  urgente: boolean
}

export type Colaborador = { id: string; nome: string | null; email: string | null; role: string }

// ─── Ordenação (prioridade → data limite → mais recente) ─────────────────────

export function ordenarTarefas(ts: Tarefa[]): Tarefa[] {
  return [...ts].sort((a, b) => {
    const pa = prioridadeInfo(a.prioridade).ordem
    const pb = prioridadeInfo(b.prioridade).ordem
    if (pa !== pb) return pa - pb
    // Com data limite primeiro (mais próxima), depois as sem data.
    if (a.data_limite && b.data_limite) return a.data_limite.localeCompare(b.data_limite)
    if (a.data_limite) return -1
    if (b.data_limite) return 1
    return b.created_at.localeCompare(a.created_at)
  })
}

// ─── Tarefas ─────────────────────────────────────────────────────────────────

export async function listarMinhasTarefas(userId: string): Promise<Tarefa[]> {
  const { data } = await supabase.from('user_tasks').select('*').eq('assigned_to', userId)
  return (data as Tarefa[]) ?? []
}

// Acompanhamento (admin): todas as tarefas de todos.
export async function listarTodasTarefas(): Promise<Tarefa[]> {
  const { data } = await supabase.from('user_tasks').select('*').order('created_at', { ascending: false })
  return (data as Tarefa[]) ?? []
}

export async function criarTarefa(input: TarefaInput, createdBy: string) {
  return supabase.from('user_tasks').insert({ ...input, created_by: createdBy }).select().single()
}

export async function atualizarTarefa(id: string, patch: Partial<Tarefa>) {
  return supabase.from('user_tasks').update(patch).eq('id', id).select().single()
}

export async function mudarEstadoTarefa(id: string, estado: EstadoTarefa) {
  return supabase.from('user_tasks')
    .update({ estado, concluida_em: estado === 'concluida' ? new Date().toISOString() : null })
    .eq('id', id).select().single()
}

export async function apagarTarefa(id: string) {
  return supabase.from('user_tasks').delete().eq('id', id)
}

// ─── Recados ─────────────────────────────────────────────────────────────────

export async function listarMeusRecados(userId: string): Promise<Recado[]> {
  const { data } = await supabase.from('user_notes').select('*')
    .eq('to_user', userId).order('created_at', { ascending: false })
  return (data as Recado[]) ?? []
}

// Recados que o próprio enviou (admin acompanha o que atribuiu).
export async function listarRecadosEnviados(fromUser: string): Promise<Recado[]> {
  const { data } = await supabase.from('user_notes').select('*')
    .eq('from_user', fromUser).order('created_at', { ascending: false })
  return (data as Recado[]) ?? []
}

export async function marcarRecadoLido(id: string) {
  return supabase.from('user_notes')
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq('id', id).select().single()
}

export async function criarRecado(input: RecadoInput, fromUser: string) {
  return supabase.from('user_notes').insert({ ...input, from_user: fromUser }).select().single()
}

export async function apagarRecado(id: string) {
  return supabase.from('user_notes').delete().eq('id', id)
}

// Pede ao servidor para enviar o email de aviso de um recado urgente. Só envia
// se o destinatário tiver feito opt-in — a decisão é do servidor. Best-effort.
export async function notificarRecadoUrgente(recadoId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/user-notes/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recadoId }),
    })
  } catch {
    /* aviso é opcional — nunca bloqueia o envio do recado */
  }
}

// ─── Preferências de notificação ─────────────────────────────────────────────

export async function obterPrefNotificacao(userId: string): Promise<boolean> {
  const { data } = await supabase.from('user_notification_prefs')
    .select('notif_recado_urgente').eq('user_id', userId).maybeSingle()
  return (data as { notif_recado_urgente: boolean } | null)?.notif_recado_urgente ?? false
}

export async function guardarPrefNotificacao(userId: string, ativo: boolean) {
  return supabase.from('user_notification_prefs')
    .upsert({ user_id: userId, notif_recado_urgente: ativo }, { onConflict: 'user_id' })
}

// ─── Colaboradores (para o admin atribuir) ───────────────────────────────────

export async function listarColaboradores(): Promise<Colaborador[]> {
  const { data } = await supabase.from('profiles')
    .select('id, nome, email, role').order('nome', { nullsFirst: false })
  return (data as Colaborador[]) ?? []
}

// ─── Contadores para o badge do header ───────────────────────────────────────

export type ContadorMinhaArea = { pendentes: number; naoLidos: number }

export async function contarMinhaArea(userId: string): Promise<ContadorMinhaArea> {
  const pendentesQ = supabase.from('user_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', userId).in('estado', ['pendente', 'em_curso'])
  const naoLidosQ = supabase.from('user_notes')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', userId).eq('lida', false)
  const [pendentes, naoLidos] = await Promise.all([pendentesQ, naoLidosQ])
  return { pendentes: pendentes.count ?? 0, naoLidos: naoLidos.count ?? 0 }
}
