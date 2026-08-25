import { supabase } from './supabase'

// "A Minha Área" — tarefas e recados por colaborador.
// A RLS garante o isolamento (cada um só vê o seu; admin vê todas as tarefas e
// os recados que enviou). As tarefas podem ter VÁRIOS destinatários, cada um
// com o seu próprio estado (user_task_assignees), e um fio de comentários
// (user_task_comments) visível a criador + destinatários.

// ─── Prioridades e estados ───────────────────────────────────────────────────

export type Prioridade = 'baixa' | 'normal' | 'alta'
// O estado deixou de ser um conjunto fixo: vive na tabela task_estados (editável
// pelo admin). Aqui é apenas um slug (texto).
export type EstadoTarefa = string

export const PRIORIDADES: { valor: Prioridade; label: string; cor: string; bg: string; ordem: number }[] = [
  { valor: 'alta', label: 'Alta', cor: '#B91C1C', bg: '#FEF2F2', ordem: 0 },
  { valor: 'normal', label: 'Normal', cor: '#1E40AF', bg: '#DBEAFE', ordem: 1 },
  { valor: 'baixa', label: 'Baixa', cor: '#374151', bg: '#E5E7EB', ordem: 2 },
]
export function prioridadeInfo(v: string) {
  return PRIORIDADES.find((p) => p.valor === v) ?? PRIORIDADES[1]
}

// ─── Estados (editáveis pelo admin em task_estados) ───────────────────────────

export type EstadoInfo = {
  slug: string
  label: string
  cor: string
  bg: string
  ordem: number
  is_concluido: boolean
  ativo: boolean
}

// Slug do estado "Aguarda informação" — o único que usa o campo "aguarda_o_que".
export const SLUG_AGUARDA = 'aguarda_info'

// Fallback = seed da BD. Usado antes de carregar ou se a leitura falhar.
export const DEFAULT_ESTADOS: EstadoInfo[] = [
  { slug: 'pendente', label: 'Pendente', cor: '#374151', bg: '#E5E7EB', ordem: 0, is_concluido: false, ativo: true },
  { slug: 'em_curso', label: 'Em andamento', cor: '#92400E', bg: '#FEF3C7', ordem: 1, is_concluido: false, ativo: true },
  { slug: SLUG_AGUARDA, label: 'Aguarda informação', cor: '#3730A3', bg: '#E0E7FF', ordem: 2, is_concluido: false, ativo: true },
  { slug: 'concluida', label: 'Concluída', cor: '#065F46', bg: '#D1FAE5', ordem: 3, is_concluido: true, ativo: true },
]

export function estadoInfo(slug: string, estados: EstadoInfo[] = DEFAULT_ESTADOS): EstadoInfo {
  return estados.find((e) => e.slug === slug)
    ?? DEFAULT_ESTADOS.find((e) => e.slug === slug)
    ?? { slug, label: slug, cor: '#374151', bg: '#E5E7EB', ordem: 99, is_concluido: false, ativo: true }
}
// Compat: label a partir do slug (usa o fallback quando não há lista carregada).
export function estadoTarefaLabel(slug: string, estados: EstadoInfo[] = DEFAULT_ESTADOS) {
  return estadoInfo(slug, estados).label
}

// Primeiro estado de conclusão / de "em aberto" (para os botões rápidos).
export function slugConcluido(estados: EstadoInfo[]): string {
  return estados.find((e) => e.is_concluido)?.slug ?? 'concluida'
}
export function slugAberto(estados: EstadoInfo[]): string {
  return estados.find((e) => !e.is_concluido)?.slug ?? 'pendente'
}

export async function listarEstados(incluirInativos = false): Promise<EstadoInfo[]> {
  let q = supabase.from('task_estados')
    .select('slug, label, cor, bg, ordem, is_concluido, ativo')
    .order('ordem', { ascending: true })
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data } = await q
  const linhas = (data as EstadoInfo[] | null) ?? []
  return linhas.length ? linhas : DEFAULT_ESTADOS.filter((e) => incluirInativos || e.ativo)
}

// CRUD de estados (só admin, garantido pela RLS de task_estados).
export async function criarEstado(input: EstadoInfo) {
  return supabase.from('task_estados').insert(input)
}
export async function atualizarEstado(slug: string, patch: Partial<EstadoInfo>) {
  return supabase.from('task_estados').update(patch).eq('slug', slug)
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
  aguarda_o_que: string | null
}

// Uma tarefa como o próprio utilizador a vê (com o SEU estado).
export type MinhaTarefa = Tarefa & {
  assigneeId: string
  meuEstado: EstadoTarefa
  meuConcluidaEm: string | null
  meuAguardaOQue: string | null
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
    .select('id, estado, concluida_em, aguarda_o_que, user_tasks(*)')
    .eq('user_id', userId)
  const linhas = (data as unknown as { id: string; estado: EstadoTarefa; concluida_em: string | null; aguarda_o_que: string | null; user_tasks: Tarefa | null }[]) ?? []
  return linhas
    .filter((l) => l.user_tasks)
    .map((l) => ({ ...(l.user_tasks as Tarefa), assigneeId: l.id, meuEstado: l.estado, meuConcluidaEm: l.concluida_em, meuAguardaOQue: l.aguarda_o_que }))
}

// Acompanhamento (admin): todas as tarefas com todos os destinatários.
export async function listarTodasTarefas(): Promise<TarefaComAssignees[]> {
  const { data } = await supabase
    .from('user_tasks')
    .select('*, user_task_assignees(id, user_id, estado, concluida_em, aguarda_o_que)')
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
// concluida_em é preenchido quando o estado é de conclusão; aguarda_o_que só faz
// sentido no estado "Aguarda informação" (limpo nos restantes).
export async function mudarMeuEstado(
  assigneeId: string,
  estado: EstadoTarefa,
  isConcluido: boolean,
  aguardaOQue: string | null = null,
) {
  return supabase.from('user_task_assignees')
    .update({
      estado,
      concluida_em: isConcluido ? new Date().toISOString() : null,
      aguarda_o_que: estado === SLUG_AGUARDA ? aguardaOQue : null,
    })
    .eq('id', assigneeId).select().single()
}

// Ao concluir, avisa por recado quem criou a tarefa (exceto se for a própria
// pessoa a concluir). A função na BD (SECURITY DEFINER) decide e cria o recado.
export async function notificarConclusaoTarefa(taskId: string): Promise<void> {
  try {
    await supabase.rpc('notificar_conclusao_tarefa', { p_task: taskId })
  } catch {
    /* o aviso é best-effort; nunca bloqueia a conclusão da tarefa */
  }
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

// ─── Histórico (linha do tempo automática, gravada por triggers na BD) ────────

export type HistoricoItem = {
  id: string
  task_id: string
  ator_id: string | null
  ator_nome: string | null
  tipo: string            // 'criacao' | 'campo' | 'estado' | 'reatribuicao'
  descricao: string
  created_at: string
}

export async function listarHistorico(taskId: string): Promise<HistoricoItem[]> {
  const { data } = await supabase.from('user_task_history')
    .select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  return (data as HistoricoItem[]) ?? []
}

// ─── Respostas novas (badge de "comentário novo") ────────────────────────────
// Uma tarefa tem "resposta nova" para mim quando alguém (não eu) comentou depois
// da última vez que abri o fio dessa tarefa. A marca de leitura vive em
// user_task_comment_reads (uma linha por tarefa/pessoa).

// Marca o fio de uma tarefa como lido até agora (upsert da minha marca).
export async function marcarTarefaLida(taskId: string, userId: string) {
  return supabase.from('user_task_comment_reads')
    .upsert({ task_id: taskId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'task_id,user_id' })
}

// Conjunto de tarefas (entre as indicadas) com respostas novas para o utilizador.
export async function tarefasComNovidades(userId: string, taskIds: string[]): Promise<Set<string>> {
  const res = new Set<string>()
  if (taskIds.length === 0) return res
  const [comentariosR, leiturasR] = await Promise.all([
    supabase.from('user_task_comments').select('task_id, autor_id, created_at').in('task_id', taskIds),
    supabase.from('user_task_comment_reads').select('task_id, last_read_at').eq('user_id', userId),
  ])
  const lidoEm = new Map<string, number>()
  for (const l of (leiturasR.data as { task_id: string; last_read_at: string }[]) ?? []) {
    lidoEm.set(l.task_id, new Date(l.last_read_at).getTime())
  }
  for (const co of (comentariosR.data as { task_id: string; autor_id: string | null; created_at: string }[]) ?? []) {
    if (co.autor_id === userId) continue                       // as minhas respostas não contam
    if (new Date(co.created_at).getTime() > (lidoEm.get(co.task_id) ?? 0)) res.add(co.task_id)
  }
  return res
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

// Editar um recado (quem enviou pode corrigir a mensagem / urgência).
export async function atualizarRecado(id: string, patch: { mensagem?: string; urgente?: boolean }) {
  return supabase.from('user_notes').update(patch).eq('id', id).select().single()
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

// ─── Colaboradores ────────────────────────────────────────────────────────────
// Todos os colaboradores (para atribuir e para o painel de equipa). Usa o RPC
// staff_colaboradores() para que QUALQUER staff veja a lista — a política de
// profiles continua "só o próprio ou admin", por isso um SELECT direto devolvia
// apenas o próprio a um não-admin.
export async function listarColaboradores(): Promise<Colaborador[]> {
  const { data } = await supabase.rpc('staff_colaboradores')
  return (data as Colaborador[]) ?? []
}

// ─── Resumo de desempenho por pessoa (painel de equipa) ───────────────────────

export type ResumoPessoa = {
  userId: string
  nome: string
  emAberto: number
  concluidas: number
  atrasadas: number
}

// Agrega o estado de cada destinatário em todas as tarefas, por pessoa.
// Com estados editáveis, "concluída" = estado com is_concluido; tudo o resto
// conta como "em aberto". "atrasada" = data limite no passado e ainda não
// concluída por essa pessoa. Ordena por carga em aberto, do maior ao menor.
export function resumoPorPessoa(
  tarefas: TarefaComAssignees[],
  colaboradores: Colaborador[],
  estados: EstadoInfo[],
): ResumoPessoa[] {
  const hoje = new Date().toISOString().slice(0, 10)
  const concluido = (slug: string) => estadoInfo(slug, estados).is_concluido
  const nomeDe = (id: string) => {
    const c = colaboradores.find((x) => x.id === id)
    return c?.nome ?? c?.email ?? '—'
  }
  const mapa = new Map<string, ResumoPessoa>()
  for (const t of tarefas) {
    const atrasada = !!t.data_limite && t.data_limite < hoje
    for (const a of t.assignees) {
      let r = mapa.get(a.user_id)
      if (!r) {
        r = { userId: a.user_id, nome: nomeDe(a.user_id), emAberto: 0, concluidas: 0, atrasadas: 0 }
        mapa.set(a.user_id, r)
      }
      if (concluido(a.estado)) r.concluidas++
      else { r.emAberto++; if (atrasada) r.atrasadas++ }
    }
  }
  return [...mapa.values()].sort((a, b) => b.emAberto - a.emAberto)
}

// ─── Contadores para o badge do header ───────────────────────────────────────

export type ContadorMinhaArea = { pendentes: number; naoLidos: number; novidades: number }

export async function contarMinhaArea(userId: string): Promise<ContadorMinhaArea> {
  // "Pendentes" = tarefas minhas em qualquer estado que não seja de conclusão.
  const estados = await listarEstados(true)
  const concluidos = estados.filter((e) => e.is_concluido).map((e) => e.slug)
  let pendentesQ = supabase.from('user_task_assignees')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (concluidos.length) pendentesQ = pendentesQ.not('estado', 'in', `(${concluidos.join(',')})`)
  const naoLidosQ = supabase.from('user_notes')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', userId).eq('lida', false)
  const novidadesQ = supabase.rpc('contar_tarefas_novidades')   // respostas novas nas minhas tarefas
  const [pendentes, naoLidos, novidades] = await Promise.all([pendentesQ, naoLidosQ, novidadesQ])
  return {
    pendentes: pendentes.count ?? 0,
    naoLidos: naoLidos.count ?? 0,
    novidades: (novidades.data as number | null) ?? 0,
  }
}
