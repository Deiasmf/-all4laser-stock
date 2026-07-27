import { supabase } from './supabase'

// "A Minha Área" — tarefas e recados por colaborador.
// A RLS garante o isolamento (cada um só vê o seu; admin vê todas as tarefas e
// os recados que enviou). As tarefas podem ter VÁRIOS destinatários, cada um
// com o seu próprio estado (user_task_assignees), e um fio de comentários
// (user_task_comments) visível a criador + destinatários.

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

// Campos partilhados da tarefa (o estado vive por destinatário).
export type Tarefa = {
  id: string
  created_by: string | null
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  data_limite: string | null
  created_at: string
  updated_at: string
}

export type Assignee = {
  id: string
  user_id: string
  estado: EstadoTarefa
  concluida_em: string | null
}

// Uma tarefa como o próprio utilizador a vê (com o SEU estado).
export type MinhaTarefa = Tarefa & {
  assigneeId: string
  meuEstado: EstadoTarefa
  meuConcluidaEm: string | null
}

// Uma tarefa com todos os destinatários (para o acompanhamento do admin).
export type TarefaComAssignees = Tarefa & { assignees: Assignee[] }

export type TarefaInput = {
  titulo: string
  descricao: string | null
  prioridade: Prioridade
  data_limite: string | null
  assignees: string[]   // user_ids dos destinatários
}

export type Comentario = {
  id: string
  task_id: string
  autor_id: string | null
  autor_nome: string | null
  mensagem: string
  created_at: string
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

export type RecadoInput = { to_user: string; mensagem: string; urgente: boolean }

export type Colaborador = { id: string; nome: string | null; email: string | null; role: string }

type Autor = { id: string | null; nome: string | null }

// ─── Ordenação (prioridade → data limite → mais recente) ─────────────────────

export function ordenarTarefas<T extends { prioridade: string; data_limite: string | null; created_at: string }>(ts: T[]): T[] {
  return [...ts].sort((a, b) => {
    const pa = prioridadeInfo(a.prioridade).ordem
    const pb = prioridadeInfo(b.prioridade).ordem
    if (pa !== pb) return pa - pb
    if (a.data_limite && b.data_limite) return a.data_limite.localeCompare(b.data_limite)
    if (a.data_limite) return -1
    if (b.data_limite) return 1
    return b.created_at.localeCompare(a.created_at)
  })
}

// ─── Tarefas ─────────────────────────────────────────────────────────────────

// As minhas tarefas (onde sou destinatário), já com o meu estado.
export async function listarMinhasTarefas(userId: string): Promise<MinhaTarefa[]> {
  const { data } = await supabase
    .from('user_task_assignees')
    .select('id, estado, concluida_em, user_tasks(*)')
    .eq('user_id', userId)
  const linhas = (data as unknown as { id: string; estado: EstadoTarefa; concluida_em: string | null; user_tasks: Tarefa | null }[]) ?? []
  return linhas
    .filter((l) => l.user_tasks)
    .map((l) => ({ ...(l.user_tasks as Tarefa), assigneeId: l.id, meuEstado: l.estado, meuConcluidaEm: l.concluida_em }))
}

// Acompanhamento (admin): todas as tarefas com todos os destinatários.
export async function listarTodasTarefas(): Promise<TarefaComAssignees[]> {
  const { data } = await supabase
    .from('user_tasks')
    .select('*, user_task_assignees(id, user_id, estado, concluida_em)')
    .order('created_at', { ascending: false })
  const linhas = (data as unknown as (Tarefa & { user_task_assignees: Assignee[] | null })[]) ?? []
  return linhas.map((t) => ({ ...t, assignees: t.user_task_assignees ?? [] }))
}

export async function criarTarefa(input: TarefaInput, createdBy: string) {
  const { assignees, ...campos } = input
  const { data: tarefa, error } = await supabase
    .from('user_tasks').insert({ ...campos, created_by: createdBy }).select().single()
  if (error || !tarefa) return { data: null, error }
  const rows = assignees.map((uid) => ({ task_id: (tarefa as Tarefa).id, user_id: uid }))
  const { error: erroAss } = await supabase.from('user_task_assignees').insert(rows)
  return { data: tarefa as Tarefa, error: erroAss }
}

export async function atualizarTarefa(id: string, patch: Partial<Tarefa>) {
  return supabase.from('user_tasks').update(patch).eq('id', id).select().single()
}

// Muda o estado do MEU registo de destinatário (não afeta os outros).
export async function mudarMeuEstado(assigneeId: string, estado: EstadoTarefa) {
  return supabase.from('user_task_assignees')
    .update({ estado, concluida_em: estado === 'concluida' ? new Date().toISOString() : null })
    .eq('id', assigneeId).select().single()
}

export async function apagarTarefa(id: string) {
  return supabase.from('user_tasks').delete().eq('id', id)   // cascata: destinatários + comentários
}

// ─── Comentários (respostas) ─────────────────────────────────────────────────

export async function listarComentarios(taskId: string): Promise<Comentario[]> {
  const { data } = await supabase.from('user_task_comments')
    .select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  return (data as Comentario[]) ?? []
}

export async function adicionarComentario(taskId: string, autor: Autor, mensagem: string) {
  return supabase.from('user_task_comments').insert({
    task_id: taskId, autor_id: autor.id, autor_nome: autor.nome, mensagem: mensagem.trim(),
  }).select().single()
}

// ─── Recados ─────────────────────────────────────────────────────────────────

export async function listarMeusRecados(userId: string): Promise<Recado[]> {
  const { data } = await supabase.from('user_notes').select('*')
    .eq('to_user', userId).order('created_at', { ascending: false })
  return (data as Recado[]) ?? []
}

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
  const pendentesQ = supabase.from('user_task_assignees')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).in('estado', ['pendente', 'em_curso'])
  const naoLidosQ = supabase.from('user_notes')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', userId).eq('lida', false)
  const [pendentes, naoLidos] = await Promise.all([pendentesQ, naoLidosQ])
  return { pendentes: pendentes.count ?? 0, naoLidos: naoLidos.count ?? 0 }
}
