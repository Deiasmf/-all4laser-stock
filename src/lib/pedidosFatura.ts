import { supabase } from './supabase'
import type { PedidoFatura, PedidoFaturaInput, PedidoFaturaEstado, PedidoFaturaConfig } from '@/types/pedidoFatura'

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

// Recusar o pedido (devolve ao colega com motivo). Regista respondido_em.
export async function recusarPedidoFatura(id: string, motivo: string) {
  return supabase
    .from('pedidos_fatura')
    .update({ estado: 'recusado', motivo_recusa: motivo, respondido_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

// ─── Comprovativo de pagamento (anexo opcional de quem pede) ──────────────────

export async function anexarComprovativo(
  pedidoId: string,
  ficheiro: File
): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${pedidoId}/comprovativo-${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_PEDIDOS_FATURA).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { data: pub } = supabase.storage.from(BUCKET_PEDIDOS_FATURA).getPublicUrl(caminho)
  const { error: erroBd } = await supabase
    .from('pedidos_fatura')
    .update({ comprovativo_url: pub.publicUrl, comprovativo_caminho: caminho })
    .eq('id', pedidoId)
  return erroBd ? { ok: false, motivo: erroBd.message } : { ok: true }
}

// ─── Criar cliente na hora (quando não existe) ────────────────────────────────
// País é NOT NULL na BD (default 'Portugal'); só pedimos nome + email.
export async function criarClienteRapido(nome: string, email: string | null): Promise<ClientePedidoOpc | null> {
  const { data } = await supabase
    .from('clientes')
    .insert({ nome: nome.trim(), email: email?.trim() || null, pais: 'Portugal' })
    .select('id, nome, email')
    .single()
  return (data as ClientePedidoOpc | null) ?? null
}

// ─── Config (template + lembretes + substituto) ───────────────────────────────

const CONFIG_PADRAO: PedidoFaturaConfig = {
  assunto_template: 'All4laser – Fatura {n_fatura} – {nome_cliente}',
  corpo_template: '',
  lembrete_horas: 48,
  lembrete_horas_uteis: true,
  escalona_cc_andreia: true,
  substituto_id: null,
  substituto_nome: null,
}

// Guardar os dados da fatura emitida (nº, data, valor total).
export async function guardarDadosFatura(
  id: string,
  campos: { num_fatura: string | null; data_fatura: string | null; valor_total: number | null }
) {
  return supabase.from('pedidos_fatura').update(campos).eq('id', id).select().single()
}

// Pré-extração dos dados da fatura anexada (via rota autenticada).
export async function extrairDadosFatura(id: string): Promise<{ ok: boolean; extraido?: import('@/types/pedidoFatura').FaturaExtraida; erro?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, erro: 'Sessão expirada.' }
  const r = await fetch('/api/pedidos-fatura/extrair', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  return r.json()
}

// Enviar ao cliente (email da Vanessa + CC Andreia), com assunto/corpo editados.
export async function enviarPedidoAoCliente(id: string, assunto: string, corpo: string): Promise<{ ok: boolean; erro?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, erro: 'Sessão expirada.' }
  const r = await fetch('/api/pedidos-fatura/enviar-documento', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, assunto, corpo }),
  })
  return r.json()
}

// Avisar a faturação de um pedido acabado de criar (best-effort).
export async function notificarNovoPedidoCliente(id: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return
  try {
    await fetch('/api/pedidos-fatura/notificar-novo', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  } catch { /* ignora */ }
}

// Registar que o envio foi feito por WhatsApp (canal usado).
export async function registarEnvioWhatsapp(id: string, canaisAtuais: string[]) {
  const canais = Array.from(new Set([...(canaisAtuais ?? []), 'whatsapp']))
  return supabase.from('pedidos_fatura')
    .update({ canais_usados: canais, enviado_whatsapp_em: new Date().toISOString() })
    .eq('id', id)
}

// Telefone + contacto do cliente (para o WhatsApp e a saudação).
export async function contactoCliente(clienteId: string): Promise<{ telefone: string | null; contacto_nome: string | null }> {
  const { data } = await supabase.from('clientes').select('telefone, contacto_nome').eq('id', clienteId).maybeSingle()
  const c = data as { telefone: string | null; contacto_nome: string | null } | null
  return { telefone: c?.telefone ?? null, contacto_nome: c?.contacto_nome ?? null }
}

export async function carregarConfigPedidos(): Promise<PedidoFaturaConfig> {
  const { data } = await supabase.from('pedidos_fatura_config').select('*').maybeSingle()
  return { ...CONFIG_PADRAO, ...((data as Partial<PedidoFaturaConfig>) ?? {}) }
}

export async function guardarConfigPedidos(cfg: PedidoFaturaConfig, porNome: string | null) {
  return supabase.from('pedidos_fatura_config').upsert({
    id: true,
    ...cfg,
    atualizado_em: new Date().toISOString(),
    atualizado_por_nome: porNome,
  })
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
