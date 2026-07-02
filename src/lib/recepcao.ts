import { supabase } from './supabase'
import type { RecepcaoMovimento, RecepcaoMatch } from '@/types/recepcao'

// ── Movimentos ──

export async function listarMovimentos(): Promise<RecepcaoMovimento[]> {
  // O Supabase devolve no máximo 1000 linhas por pedido — paginar.
  const PAGINA = 1000
  const todos: RecepcaoMovimento[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await supabase
      .from('recepcao_movimentos')
      .select('*')
      .order('data_movimento', { ascending: false })
      .order('created_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1)
    const lote = (data as RecepcaoMovimento[]) ?? []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

export async function obterMovimento(id: string): Promise<RecepcaoMovimento | null> {
  const { data } = await supabase.from('recepcao_movimentos').select('*').eq('id', id).single()
  return (data as RecepcaoMovimento) ?? null
}

// Campos graváveis (o resto é gerado/derivado)
const CAMPOS_MOV: (keyof RecepcaoMovimento)[] = [
  'tipo', 'data_movimento', 'origem_destino', 'descricao', 'quantidade',
  'serial_numbers', 'equipamento_sn', 'equipamento_id', 'referencia_tipo',
  'referencia_id', 'referencia_numero', 'match_status', 'match_referencia_id',
  'match_id', 'qr_lido', 'notas', 'criado_por', 'criado_por_nome',
]

function limparMov(m: Partial<RecepcaoMovimento>) {
  const out: Record<string, unknown> = {}
  for (const c of CAMPOS_MOV) {
    if (c in m) out[c] = (m as Record<string, unknown>)[c] ?? null
  }
  return out
}

export function criarMovimento(m: Partial<RecepcaoMovimento>) {
  return supabase.from('recepcao_movimentos').insert(limparMov(m)).select().single()
}

export function atualizarMovimento(id: string, patch: Partial<RecepcaoMovimento>) {
  return supabase.from('recepcao_movimentos').update(limparMov(patch)).eq('id', id).select().single()
}

// Apaga uma linha do livro (receção/movimento manual ou linha de reparação).
export function eliminarMovimento(id: string) {
  return supabase.from('recepcao_movimentos').delete().eq('id', id)
}

// ── Matches ──

export async function listarMatches(): Promise<RecepcaoMatch[]> {
  const { data } = await supabase
    .from('recepcao_match')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as RecepcaoMatch[]) ?? []
}

export async function obterMatch(id: string): Promise<RecepcaoMatch | null> {
  const { data } = await supabase.from('recepcao_match').select('*').eq('id', id).single()
  return (data as RecepcaoMatch) ?? null
}

export async function listarMovimentosDoMatch(matchId: string): Promise<RecepcaoMovimento[]> {
  const { data } = await supabase
    .from('recepcao_movimentos')
    .select('*')
    .eq('match_id', matchId)
    .order('data_movimento', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as RecepcaoMovimento[]) ?? []
}

export function criarMatch(m: Partial<RecepcaoMatch>) {
  return supabase
    .from('recepcao_match')
    .insert({
      descricao: m.descricao ?? null,
      contraparte: m.contraparte ?? null,
      contraparte_tipo: m.contraparte_tipo ?? null,
      estado: m.estado ?? 'pendente',
      notas: m.notas ?? null,
    })
    .select()
    .single()
}

export function atualizarMatch(id: string, patch: Partial<RecepcaoMatch>) {
  return supabase.from('recepcao_match').update(patch).eq('id', id).select().single()
}

// Fecha manualmente um match e todos os seus movimentos.
export async function fecharMatch(id: string) {
  await supabase
    .from('recepcao_movimentos')
    .update({ match_status: 'fechado' })
    .eq('match_id', id)
  return atualizarMatch(id, { estado: 'fechado', itens_pendentes: 0 })
}
