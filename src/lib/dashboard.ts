import { supabase } from './supabase'
import type { Comunicado, Tarefa, ChatMensagem, EstadoTarefa } from '@/types/dashboard'
import { ESTADOS_OCUPAM } from '@/types/reserva'

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Resolve uma query de contagem, devolvendo 0 em caso de erro
// (ex.: tabela ainda não existe ou sem permissões).
async function contarQuery(
  qb: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await qb
    return error ? 0 : count ?? 0
  } catch {
    return 0
  }
}

export type Metricas = {
  alugueresFora: number
  leadsNovas: number
  emPrep: number
  entregasHoje: number
}

export async function carregarMetricas(): Promise<Metricas> {
  const hoje = hojeISO()
  const sel = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true })
  const [alugueresFora, leadsNovas, emPrep, entregasHoje] = await Promise.all([
    contarQuery(sel('alugueres').is('data_recolha', null).eq('recolha_aplicavel', true)),
    contarQuery(sel('leads').eq('estado', 'nova')),
    contarQuery(sel('equipamentos').in('status', ['Prep-Logística', 'Prep-Técnico'])),
    contarQuery(sel('alugueres').eq('data_entrega', hoje)),
  ])
  return { alugueresFora, leadsNovas, emPrep, entregasHoje }
}

// ----- Comunicados -----
export async function listarComunicados(limite = 5): Promise<Comunicado[]> {
  try {
    const { data } = await supabase
      .from('comunicados')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite)
    return (data as Comunicado[]) ?? []
  } catch {
    return []
  }
}

export async function criarComunicado(c: {
  titulo: string
  corpo: string
  area: string | null
  prioridade: string
  autor_id: string | null
  autor_nome: string
  autor_iniciais: string
}) {
  return supabase.from('comunicados').insert(c)
}

// ----- Tarefas -----
// Tarefas com data_limite = hoje OU sem data, que não estejam concluídas.
export async function listarTarefasHoje(): Promise<Tarefa[]> {
  try {
    const hoje = hojeISO()
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .neq('estado', 'concluida')
      .or(`data_limite.is.null,data_limite.eq.${hoje}`)
      .order('prioridade', { ascending: false })
      .order('created_at', { ascending: true })
    return (data as Tarefa[]) ?? []
  } catch {
    return []
  }
}

export async function alternarTarefa(id: string, novo: EstadoTarefa) {
  return supabase.from('tarefas').update({ estado: novo }).eq('id', id)
}

export async function criarTarefa(t: {
  titulo: string
  descricao: string | null
  area: string
  data_limite: string | null
  prioridade: string
  assignee_id: string | null
  assignee_nome: string | null
}) {
  return supabase.from('tarefas').insert(t)
}

// ----- Chat -----
export async function listarChat(limite = 30): Promise<ChatMensagem[]> {
  try {
    const { data } = await supabase
      .from('chat_mensagens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite)
    return ((data as ChatMensagem[]) ?? []).reverse()
  } catch {
    return []
  }
}

export async function enviarMensagem(m: {
  mensagem: string
  autor_id: string | null
  autor_nome: string
  autor_iniciais: string
}) {
  return supabase.from('chat_mensagens').insert(m)
}

// ----- Alugueres a decorrer (fora) -----
export type AluguerFora = {
  id: string
  cliente_nome: string | null
  modelo: string | null
  serial_number: string | null
  data_entrega: string | null
}

export async function listarAlugueresFora(limite = 8): Promise<AluguerFora[]> {
  try {
    const { data } = await supabase
      .from('alugueres')
      .select('id, cliente_nome, modelo, serial_number, data_entrega')
      .is('data_recolha', null)
      .eq('recolha_aplicavel', true)
      .order('data_entrega', { ascending: true })
      .limit(limite)
    return (data as AluguerFora[]) ?? []
  } catch {
    return []
  }
}

// ----- Reservas para hoje -----
export type ReservaHoje = {
  id: string
  cliente_nome: string | null
  modelo_nome: string
  data_fim: string
  diasRestantes: number
}

export async function listarReservasHoje(limite = 8): Promise<ReservaHoje[]> {
  try {
    const hoje = hojeISO()
    const { data } = await supabase
      .from('reservas')
      .select('id, cliente_nome, modelo_nome, data_inicio, data_fim, estado')
      .in('estado', ESTADOS_OCUPAM)
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje)
      .order('data_fim', { ascending: true })
      .limit(limite)
    const base = new Date(hoje).getTime()
    return ((data as { id: string; cliente_nome: string | null; modelo_nome: string; data_fim: string }[]) ?? []).map(
      (r) => ({
        id: r.id,
        cliente_nome: r.cliente_nome,
        modelo_nome: r.modelo_nome,
        data_fim: r.data_fim,
        diasRestantes: Math.round((new Date(r.data_fim).getTime() - base) / 86400000),
      })
    )
  } catch {
    return []
  }
}
