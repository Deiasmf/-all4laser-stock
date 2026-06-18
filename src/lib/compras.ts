import { supabase } from './supabase'
import { iniciais } from './ui'
import { ESTADOS_PEDIDO_ABERTO, type PedidoCompra, type PedidoItem, type Cotacao, type Fornecedor, type EstadoPedido } from '@/types/compras'

// ─── Pesquisa de peças (autocomplete) ───────────────────────────────────────

export type PecaOpc = { id: string; nome: string; marca: string | null; quantidade: number }

export async function pesquisarPecas(q: string): Promise<PecaOpc[]> {
  const t = q.trim()
  if (t.length < 1) return []
  const { data } = await supabase
    .from('pecas')
    .select('id, nome, marca, quantidade')
    .ilike('nome', `%${t}%`)
    .order('nome')
    .limit(20)
  return (data as PecaOpc[]) ?? []
}

// ─── Pedidos de compra ──────────────────────────────────────────────────────

export type PedidoComContagem = PedidoCompra & { n_itens: number }

export async function listarPedidos(): Promise<PedidoComContagem[]> {
  const { data } = await supabase
    .from('pedidos_compra')
    .select('*, pedidos_compra_itens(count)')
    .order('created_at', { ascending: false })
  return ((data ?? []) as unknown as (PedidoCompra & { pedidos_compra_itens: { count: number }[] })[]).map((p) => ({
    ...p,
    n_itens: p.pedidos_compra_itens?.[0]?.count ?? 0,
  }))
}

export async function obterPedido(id: string) {
  return supabase.from('pedidos_compra').select('*').eq('id', id).single()
}

export async function listarItens(pedidoId: string): Promise<PedidoItem[]> {
  const { data } = await supabase
    .from('pedidos_compra_itens')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true })
  return (data as PedidoItem[]) ?? []
}

export type ItemInput = { peca_id: string | null; peca_nome: string; quantidade: number; notas: string | null }

// Cria um pedido com os seus itens. Devolve o pedido criado.
export async function criarPedido(
  dados: { urgente: boolean; notas: string | null; estado: EstadoPedido },
  itens: ItemInput[],
  criadoPor: string | null,
  criadoPorNome: string | null
): Promise<{ data: PedidoCompra | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('pedidos_compra')
    .insert({ ...dados, criado_por: criadoPor, criado_por_nome: criadoPorNome })
    .select()
    .single()
  if (error || !data) return { data: null, error }
  const pedido = data as PedidoCompra
  const linhas = itens
    .filter((i) => i.peca_nome.trim())
    .map((i) => ({ pedido_id: pedido.id, peca_id: i.peca_id, peca_nome: i.peca_nome.trim(), quantidade: i.quantidade, notas: i.notas }))
  if (linhas.length) await supabase.from('pedidos_compra_itens').insert(linhas)
  return { data: pedido, error: null }
}

export async function atualizarEstadoPedido(id: string, estado: EstadoPedido) {
  return supabase.from('pedidos_compra').update({ estado }).eq('id', id)
}

export async function marcarUrgente(id: string) {
  return supabase.from('pedidos_compra').update({ urgente: true }).eq('id', id)
}

// Envia o pedido para o departamento de Compras: muda estado e cria comunicado
// para a Sara (área 'compras'), urgente conforme a flag.
export async function enviarParaCompras(pedido: PedidoCompra, nItens: number, autor: { id: string | null; nome: string | null }) {
  await atualizarEstadoPedido(pedido.id, 'enviado')
  const autorNome = autor.nome ?? 'Equipa'
  await supabase.from('comunicados').insert({
    titulo: `Novo pedido de compra: ${pedido.numero ?? ''}`.trim(),
    corpo: `${nItens} item(ns) para comprar.${pedido.urgente ? ' PEDIDO URGENTE.' : ''}${pedido.notas ? ' ' + pedido.notas : ''}`,
    prioridade: pedido.urgente ? 'urgente' : 'importante',
    autor_id: autor.id,
    autor_nome: autorNome,
    autor_iniciais: iniciais(autorNome, null),
    area: 'compras',
  })
}

export async function eliminarPedido(id: string) {
  return supabase.from('pedidos_compra').delete().eq('id', id)
}

// ─── Cotações ────────────────────────────────────────────────────────────────

export async function listarCotacoes(pedidoId: string): Promise<Cotacao[]> {
  const { data } = await supabase
    .from('pedidos_compra_cotacoes')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true })
  return (data as Cotacao[]) ?? []
}

export async function criarCotacao(
  pedidoId: string,
  dados: { fornecedor: string | null; valor_total: number | null; prazo_entrega_dias: number | null; notas: string | null },
  autor: { id: string | null; nome: string | null }
) {
  // Primeira cotação muda o pedido para 'em_cotacao' (se ainda enviado/rascunho).
  await supabase.from('pedidos_compra').update({ estado: 'em_cotacao' }).eq('id', pedidoId).in('estado', ['rascunho', 'enviado'])
  return supabase.from('pedidos_compra_cotacoes').insert({
    pedido_id: pedidoId,
    ...dados,
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  })
}

// Seleciona uma cotação e desmarca as restantes do mesmo pedido.
export async function selecionarCotacao(pedidoId: string, cotacaoId: string) {
  await supabase.from('pedidos_compra_cotacoes').update({ selecionado: false }).eq('pedido_id', pedidoId)
  await supabase.from('pedidos_compra_cotacoes').update({ selecionado: true }).eq('id', cotacaoId)
  await supabase.from('pedidos_compra').update({ estado: 'aprovado' }).eq('id', pedidoId)
}

export async function aprovarEncomendar(id: string) {
  return atualizarEstadoPedido(id, 'encomendado')
}

// ─── Receção ─────────────────────────────────────────────────────────────────

// Regista a receção: atualiza quantidade_recebida, incrementa o stock da peça
// (via função SECURITY DEFINER) e ajusta o estado do pedido. Quando tudo for
// recebido, marca as peças em falta ligadas como 'recebida'.
export async function registarRececao(
  pedidoId: string,
  itens: PedidoItem[],
  recebido: Record<string, number> // itemId -> quantidade recebida agora (total acumulado)
) {
  for (const it of itens) {
    const nova = recebido[it.id] ?? it.quantidade_recebida
    const delta = nova - it.quantidade_recebida
    if (delta > 0 && it.peca_id) {
      await supabase.rpc('incrementar_stock_peca', { p_peca_id: it.peca_id, p_qtd: delta })
    }
    if (nova !== it.quantidade_recebida) {
      await supabase.from('pedidos_compra_itens').update({ quantidade_recebida: nova }).eq('id', it.id)
    }
  }

  const tudo = itens.every((it) => (recebido[it.id] ?? it.quantidade_recebida) >= it.quantidade)
  const algum = itens.some((it) => (recebido[it.id] ?? it.quantidade_recebida) > 0)
  const estado: EstadoPedido = tudo ? 'recebido_total' : algum ? 'recebido_parcial' : 'encomendado'
  await atualizarEstadoPedido(pedidoId, estado)

  if (tudo) {
    const pecaIds = itens.map((i) => i.peca_id).filter((x): x is string => !!x)
    if (pecaIds.length) {
      await supabase
        .from('equipamento_pecas_em_falta')
        .update({ estado: 'recebida' })
        .in('peca_id', pecaIds)
        .eq('estado', 'pedida')
    }
  }
  return estado
}

// ─── Fornecedores ────────────────────────────────────────────────────────────

export async function listarFornecedores(soAtivos = false): Promise<Fornecedor[]> {
  let q = supabase.from('fornecedores').select('*').order('nome')
  if (soAtivos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as Fornecedor[]) ?? []
}

export async function criarFornecedor(dados: { nome: string; contacto: string | null; email: string | null; notas: string | null }) {
  return supabase.from('fornecedores').insert(dados).select().single()
}

export async function atualizarFornecedor(id: string, dados: Partial<Fornecedor>) {
  return supabase.from('fornecedores').update(dados).eq('id', id)
}

// ─── Indicador de encomenda pendente por peça ────────────────────────────────

// Conjunto de peca_id que têm pelo menos um pedido em aberto.
export async function pecasComPedidoPendente(): Promise<Set<string>> {
  const { data: pedidos } = await supabase
    .from('pedidos_compra')
    .select('id')
    .in('estado', ESTADOS_PEDIDO_ABERTO)
  const ids = (pedidos ?? []).map((p) => (p as { id: string }).id)
  if (ids.length === 0) return new Set()
  const { data: itens } = await supabase
    .from('pedidos_compra_itens')
    .select('peca_id')
    .in('pedido_id', ids)
    .not('peca_id', 'is', null)
  return new Set((itens ?? []).map((i) => (i as { peca_id: string }).peca_id))
}
