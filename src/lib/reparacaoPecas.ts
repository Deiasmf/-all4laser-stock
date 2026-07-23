import { supabase } from './supabase'
import type {
  ReparacaoPeca,
  ReparacaoItem,
  ReparacaoMovimento,
  FornecedorReparacao,
} from '@/types/reparacaoPeca'

// ── Reparações ──

export async function listarReparacoes(): Promise<ReparacaoPeca[]> {
  // O Supabase devolve no máximo 1000 linhas por pedido; o histórico tem mais.
  const PAGINA = 1000
  const todos: ReparacaoPeca[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await supabase
      .from('reparacao_pecas')
      .select('*')
      .order('data_saida', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1)
    const lote = (data as ReparacaoPeca[]) ?? []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

export async function obterReparacao(id: string): Promise<ReparacaoPeca | null> {
  const { data } = await supabase.from('reparacao_pecas').select('*').eq('id', id).single()
  return (data as ReparacaoPeca) ?? null
}

// Campos que se podem gravar (o número é gerado por trigger)
const CAMPOS: (keyof ReparacaoPeca)[] = [
  'tipo_dono', 'cliente_id', 'cliente_nome', 'fornecedor', 'peca', 'peca_id',
  'serial_number', 'equipamento_sn', 'tem_sn', 'sn_avariado', 'sn_substituto', 'qr_code',
  'avaria', 'garantia', 'tipo_garantia', 'responsavel_pagamento', 'valor_reparacao',
  'faturado_cliente', 'pago', 'substituta_enviada', 'substituta_peca_id', 'substituta_sn',
  'cliente_enviou_avariada', 'data_cliente_enviou', 'data_saida', 'data_entrada',
  'status', 'observacoes', 'notas', 'criado_por_nome',
]

function limpar(r: Partial<ReparacaoPeca>) {
  const out: Record<string, unknown> = {}
  for (const c of CAMPOS) {
    if (c in r) out[c] = (r as Record<string, unknown>)[c] ?? null
  }
  return out
}

export function criarReparacao(r: Partial<ReparacaoPeca>) {
  return supabase.from('reparacao_pecas').insert(limpar(r)).select().single()
}

export function atualizarReparacao(id: string, r: Partial<ReparacaoPeca>) {
  return supabase
    .from('reparacao_pecas')
    .update({ ...limpar(r), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

export function eliminarReparacao(id: string) {
  return supabase.from('reparacao_pecas').delete().eq('id', id)
}

// ── Itens (peças sem SN) ──

export async function listarItens(reparacaoId: string): Promise<ReparacaoItem[]> {
  const { data } = await supabase
    .from('reparacao_pecas_itens')
    .select('*')
    .eq('reparacao_id', reparacaoId)
    .order('created_at', { ascending: true })
  return (data as ReparacaoItem[]) ?? []
}

export function criarItens(reparacaoId: string, itens: Partial<ReparacaoItem>[]) {
  const linhas = itens.map((i) => ({
    reparacao_id: reparacaoId,
    descricao: i.descricao,
    peca_id: i.peca_id ?? null,
    quantidade_saida: i.quantidade_saida ?? 1,
    quantidade_entrada: i.quantidade_entrada ?? 0,
    estado: i.estado ?? 'em_reparacao',
  }))
  return supabase.from('reparacao_pecas_itens').insert(linhas)
}

export function atualizarItem(id: string, patch: Partial<ReparacaoItem>) {
  return supabase.from('reparacao_pecas_itens').update(patch).eq('id', id)
}

// ── Movimentos ──

export async function listarMovimentos(reparacaoId: string): Promise<ReparacaoMovimento[]> {
  const { data } = await supabase
    .from('reparacao_pecas_movimentos')
    .select('*')
    .eq('reparacao_id', reparacaoId)
    .order('data', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as ReparacaoMovimento[]) ?? []
}

export function criarMovimento(m: Partial<ReparacaoMovimento>) {
  return supabase.from('reparacao_pecas_movimentos').insert({
    reparacao_id: m.reparacao_id,
    tipo: m.tipo,
    data: m.data ?? new Date().toISOString().slice(0, 10),
    quantidade: m.quantidade ?? 1,
    sn: m.sn ?? null,
    notas: m.notas ?? null,
    criado_por: m.criado_por ?? null,
    criado_por_nome: m.criado_por_nome ?? null,
  })
}

// ── Fornecedores de reparação ──
// Consolidado na tabela única `fornecedores` (deixou de existir tabela própria).

export async function listarFornecedoresReparacao(): Promise<FornecedorReparacao[]> {
  const { data } = await supabase
    .from('fornecedores')
    .select('id, nome, email, telefone, notas, ativo, created_at')
    .eq('ativo', true)
    .order('nome')
  return (data as FornecedorReparacao[]) ?? []
}

export async function criarFornecedorReparacao(nome: string): Promise<FornecedorReparacao | null> {
  const { data } = await supabase
    .from('fornecedores')
    .insert({ nome: nome.trim() })
    .select('id, nome, email, telefone, notas, ativo, created_at')
    .single()
  return (data as FornecedorReparacao) ?? null
}

// Desconta o stock de uma peça (usado quando se envia uma peça substituta)
export function descontarStockPeca(pecaId: string, qtd = 1) {
  return supabase.rpc('descontar_stock_peca', { p_peca_id: pecaId, p_qtd: qtd })
}
