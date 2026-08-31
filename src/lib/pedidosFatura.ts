import { supabase } from './supabase'
import type { PedidoFatura, PedidoFaturaInput, PedidoFaturaEstado } from '@/types/pedidoFatura'

export const BUCKET_PEDIDOS_FATURA = 'pedidos-fatura-docs'

export type UserRef = { id: string | null; nome: string | null }

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function listarPedidosFatura(): Promise<PedidoFatura[]> {
  const { data } = await supabase
    .from('pedidos_fatura')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as PedidoFatura[]) ?? []
}

export async function obterPedidoFatura(id: string) {
  return supabase.from('pedidos_fatura').select('*').eq('id', id).single()
}

// ─── Criação (feita por quem pede: cliente, descrição, valor) ─────────────────

export async function criarPedidoFatura(input: PedidoFaturaInput, criadoPor: UserRef) {
  return supabase
    .from('pedidos_fatura')
    .insert({
      ...input,
      estado: 'nao_realizado',
      criado_por: criadoPor.id,
      criado_por_nome: criadoPor.nome,
    })
    .select()
    .single()
}

// ─── Atualização genérica de campos ───────────────────────────────────────────

export async function atualizarPedidoFatura(id: string, patch: Partial<PedidoFatura>) {
  return supabase.from('pedidos_fatura').update(patch).eq('id', id).select().single()
}

export async function eliminarPedidoFatura(id: string) {
  return supabase.from('pedidos_fatura').delete().eq('id', id)
}

// ─── Fluxo (financeiro) ───────────────────────────────────────────────────────

// Muda o estado. Ao passar a "a realizar" regista quem está a tratar (financeiro).
export async function alterarEstadoPedido(id: string, estado: PedidoFaturaEstado, responsavel?: UserRef) {
  const patch: Partial<PedidoFatura> = { estado }
  if (estado === 'a_realizar' && responsavel) {
    patch.responsavel_id = responsavel.id
    patch.responsavel_nome = responsavel.nome
  }
  return supabase.from('pedidos_fatura').update(patch).eq('id', id).select().single()
}

// Confirma (ou anula) o pagamento.
export async function marcarPagoPedido(id: string, pago: boolean, dataPagamento: string | null) {
  return supabase
    .from('pedidos_fatura')
    .update({ pago, data_pagamento: pago ? dataPagamento : null })
    .eq('id', id)
    .select()
    .single()
}

// ─── Documento emitido (upload) ───────────────────────────────────────────────

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

// Carrega o documento emitido pelo financeiro e marca o pedido como "realizado".
export async function carregarDocumentoPedido(
  id: string,
  ficheiro: File
): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${id}/documento-${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_PEDIDOS_FATURA).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }

  const { data: pub } = supabase.storage.from(BUCKET_PEDIDOS_FATURA).getPublicUrl(caminho)
  const { error: erroBd } = await supabase
    .from('pedidos_fatura')
    .update({ documento_url: pub.publicUrl, documento_caminho: caminho, estado: 'realizado' })
    .eq('id', id)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

// Remove o documento emitido (ficheiro + referências) e volta o pedido a "a realizar".
export async function removerDocumentoPedido(id: string, caminho: string | null) {
  if (caminho) await supabase.storage.from(BUCKET_PEDIDOS_FATURA).remove([caminho])
  return supabase
    .from('pedidos_fatura')
    .update({ documento_url: null, documento_caminho: null, estado: 'a_realizar' })
    .eq('id', id)
}

// ─── Seletores ────────────────────────────────────────────────────────────────

export type FuncionarioOpc = { id: string; nome: string }

export async function listarFuncionarios(): Promise<FuncionarioOpc[]> {
  const { data } = await supabase.from('profiles').select('id, nome').order('nome')
  return ((data as { id: string; nome: string | null }[]) ?? [])
    .filter((p) => p.nome)
    .map((p) => ({ id: p.id, nome: p.nome as string }))
}

export type ClientePedidoOpc = { id: string; nome: string; email: string | null }

export async function listarClientesPedido(): Promise<ClientePedidoOpc[]> {
  const { data } = await supabase
    .from('clientes')
    .select('id, nome, email')
    .order('nome')
    .limit(2000)
  return ((data as { id: string; nome: string; email: string | null }[]) ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    email: c.email,
  }))
}
