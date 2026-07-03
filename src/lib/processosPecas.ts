import { supabase } from './supabase'
import { criarReparacao } from './reparacaoPecas'
import type {
  ProcessoPeca, ProcessoMovimento, ProcessoItem, ProcessoInput, ProcessoItemInput,
  EstadoProcesso, MovimentoTipo,
} from '@/types/processoPeca'

// ─── Processos ────────────────────────────────────────────────────────────────

export async function listarProcessos(): Promise<ProcessoPeca[]> {
  const PAGINA = 1000
  const todos: ProcessoPeca[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await supabase
      .from('processos_pecas')
      .select('*')
      .order('created_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1)
    const lote = (data as ProcessoPeca[]) ?? []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

export async function obterProcesso(id: string): Promise<ProcessoPeca | null> {
  const { data } = await supabase.from('processos_pecas').select('*').eq('id', id).single()
  return (data as ProcessoPeca) ?? null
}

export async function criarProcesso(
  input: ProcessoInput,
  itens: ProcessoItemInput[],
  criadoPor: string | null,
  criadoPorNome: string | null
) {
  const { data, error } = await supabase
    .from('processos_pecas')
    .insert({ ...input, estado: 'aberto', criado_por: criadoPor, criado_por_nome: criadoPorNome })
    .select()
    .single()
  if (error || !data) return { data: null, error }

  const processo = data as ProcessoPeca
  if (itens.length > 0) {
    const linhas = itens.map((i) => ({
      processo_id: processo.id,
      descricao: i.descricao,
      quantidade_total: i.quantidade,
    }))
    await supabase.from('processos_pecas_itens').insert(linhas)
  }
  return { data: processo, error: null }
}

export async function atualizarProcesso(id: string, patch: Partial<ProcessoPeca>) {
  return supabase.from('processos_pecas').update(patch).eq('id', id).select().single()
}

export async function alterarEstadoProcesso(id: string, estado: EstadoProcesso) {
  return supabase.from('processos_pecas').update({ estado }).eq('id', id).select().single()
}

export async function eliminarProcesso(id: string) {
  // Remove também as linhas que este processo criou no livro de Encomendas.
  await supabase.from('recepcao_movimentos').delete()
    .eq('referencia_tipo', 'processo').eq('referencia_id', id)
  return supabase.from('processos_pecas').delete().eq('id', id)
}

// ─── Movimentos ────────────────────────────────────────────────────────────────

export async function listarMovimentosProcesso(processoId: string): Promise<ProcessoMovimento[]> {
  const { data } = await supabase
    .from('processos_pecas_movimentos')
    .select('*')
    .eq('processo_id', processoId)
    .order('data_movimento', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as ProcessoMovimento[]) ?? []
}

export type MovimentoInput = {
  tipo: MovimentoTipo
  data_movimento?: string
  quantidade?: number
  itens?: ProcessoItemInput[] | null
  sn?: string | null
  origem?: string | null
  destino?: string | null
  notas?: string | null
}

export function criarMovimentoProcesso(
  processoId: string,
  m: MovimentoInput,
  criadoPor: string | null,
  criadoPorNome: string | null
) {
  return supabase.from('processos_pecas_movimentos').insert({
    processo_id: processoId,
    tipo: m.tipo,
    data_movimento: m.data_movimento ?? new Date().toISOString().slice(0, 10),
    quantidade: m.quantidade ?? 1,
    itens: m.itens ?? null,
    sn: m.sn ?? null,
    origem: m.origem ?? null,
    destino: m.destino ?? null,
    notas: m.notas ?? null,
    criado_por: criadoPor,
    criado_por_nome: criadoPorNome,
  }).select().single()
}

export function atualizarMovimentoProcesso(id: string, patch: Partial<ProcessoMovimento>) {
  return supabase.from('processos_pecas_movimentos').update(patch).eq('id', id).select().single()
}

// Todos os movimentos (para o cálculo de saldos por cliente).
export async function listarTodosMovimentos(): Promise<ProcessoMovimento[]> {
  const PAGINA = 1000
  const todos: ProcessoMovimento[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await supabase
      .from('processos_pecas_movimentos')
      .select('*')
      .range(inicio, inicio + PAGINA - 1)
    const lote = (data as ProcessoMovimento[]) ?? []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

// ─── Itens (peças sem SN) ──────────────────────────────────────────────────────

export async function listarItensProcesso(processoId: string): Promise<ProcessoItem[]> {
  const { data } = await supabase
    .from('processos_pecas_itens')
    .select('*')
    .eq('processo_id', processoId)
    .order('created_at', { ascending: true })
  return (data as ProcessoItem[]) ?? []
}

// Regista uma receção parcial/total de um item sem SN e atualiza o estado.
export async function registarRececaoItem(item: ProcessoItem, quantidade: number) {
  const recebida = Math.min(item.quantidade_total, item.quantidade_recebida + quantidade)
  const estado = recebida <= 0 ? 'pendente' : recebida >= item.quantidade_total ? 'completo' : 'parcial'
  return supabase
    .from('processos_pecas_itens')
    .update({ quantidade_recebida: recebida, estado })
    .eq('id', item.id)
    .select()
    .single()
}

// ─── Entrada no stock (Casos 2 e 3) ─────────────────────────────────────────────

type UpsertPeca = {
  nome: string
  serial_number: string | null
  quantidadeDelta: number
  statusReparacao: string | null
}

// Cria a peça no stock se não existir, ou incrementa a quantidade se já existir.
// Devolve o id da peça no stock.
async function upsertPecaStock({ nome, serial_number, quantidadeDelta, statusReparacao }: UpsertPeca): Promise<string | null> {
  // Procura por SN (se houver) senão por nome exato
  let existente: { id: string; quantidade: number | null } | null = null
  if (serial_number) {
    const { data } = await supabase.from('pecas').select('id, quantidade').eq('serial_number', serial_number).limit(1).maybeSingle()
    existente = (data as { id: string; quantidade: number | null }) ?? null
  }
  if (!existente) {
    const { data } = await supabase.from('pecas').select('id, quantidade').ilike('nome', nome).limit(1).maybeSingle()
    existente = (data as { id: string; quantidade: number | null }) ?? null
  }

  if (existente) {
    const nova = (existente.quantidade ?? 0) + quantidadeDelta
    const patch: Record<string, unknown> = { quantidade: nova }
    if (statusReparacao !== undefined) patch.status_reparacao = statusReparacao
    await supabase.from('pecas').update(patch).eq('id', existente.id)
    return existente.id
  }

  const { data } = await supabase.from('pecas').insert({
    nome,
    serial_number: serial_number ?? null,
    quantidade: Math.max(0, quantidadeDelta),
    status_reparacao: statusReparacao,
  }).select('id').single()
  return (data as { id: string } | null)?.id ?? null
}

// Peça avariada do cliente entra no stock a aguardar reparação (Casos 2 e 3),
// e cria automaticamente um processo de reparação por atribuir.
export async function entrarAvariadaNoStock(
  processo: ProcessoPeca,
  opts: { descricao: string; sn: string | null; quantidade: number },
  criadoPorNome: string | null
) {
  const pecaId = await upsertPecaStock({
    nome: opts.descricao,
    serial_number: opts.sn,
    quantidadeDelta: opts.quantidade,
    statusReparacao: 'aguarda_reparacao',
  })

  await criarReparacao({
    tipo_dono: 'cliente',
    cliente_id: processo.cliente_id,
    cliente_nome: processo.cliente_nome,
    peca: opts.descricao,
    peca_id: pecaId,
    serial_number: opts.sn,
    equipamento_sn: processo.equipamento_sn,
    tem_sn: processo.tem_sn,
    sn_avariado: opts.sn,
    tipo_garantia: processo.tipo_garantia,
    responsavel_pagamento: processo.responsavel_pagamento,
    status: 'aguarda_atribuicao',
    notas: `Criado automaticamente do processo ${processo.numero ?? ''}.`,
    criado_por_nome: criadoPorNome,
  })

  return pecaId
}

// Peça de cortesia devolvida pelo cliente volta ao nosso stock (Caso 1).
export async function devolverCortesiaAoStock(
  processo: ProcessoPeca,
  opts: { quantidade: number }
) {
  return upsertPecaStock({
    nome: processo.substituta_descricao ?? processo.peca_descricao,
    serial_number: processo.sn_substituto,
    quantidadeDelta: opts.quantidade,
    statusReparacao: null,
  })
}

// ─── Saldos por cliente ─────────────────────────────────────────────────────────

export type SaldoCliente = {
  cliente_nome: string
  enviadas: number
  recebidas: number
  pendentes: number   // peças que o cliente ainda deve devolver (cortesias por devolver)
}

// Calcula, a partir dos movimentos, quantas peças foram enviadas vs. recebidas por cliente.
export function calcularSaldos(processos: ProcessoPeca[], movimentos: ProcessoMovimento[]): SaldoCliente[] {
  const porProcesso = new Map<string, ProcessoPeca>()
  processos.forEach((p) => porProcesso.set(p.id, p))
  const map = new Map<string, SaldoCliente>()

  for (const m of movimentos) {
    const proc = porProcesso.get(m.processo_id)
    if (!proc) continue
    const nome = proc.cliente_nome || '—'
    const s = map.get(nome) ?? { cliente_nome: nome, enviadas: 0, recebidas: 0, pendentes: 0 }
    const q = m.quantidade ?? 1
    if (m.tipo === 'enviamos_substituta') s.enviadas += q
    if (m.tipo === 'cliente_devolveu_cortesia' || m.tipo === 'cliente_enviou_avariada') s.recebidas += q
    map.set(nome, s)
  }

  // Pendentes = cortesias enviadas ainda por devolver (só Caso 1 por fechar)
  for (const p of processos) {
    if (p.tipo_fluxo === 'cortesia_reparacao_externa' && p.estado !== 'fechado' && p.estado !== 'cancelado') {
      const s = map.get(p.cliente_nome || '—')
      if (s) s.pendentes += 1
    }
  }

  return Array.from(map.values()).sort((a, b) => b.pendentes - a.pendentes || a.cliente_nome.localeCompare(b.cliente_nome, 'pt'))
}
