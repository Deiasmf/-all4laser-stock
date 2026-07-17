import { supabase } from './supabase'
import { iniciais } from './ui'
import type { EnvioPeca, EnvioItem, EnvioInput, EnvioItemInput, EnvioEstado } from '@/types/envioPecas'

export const BUCKET_ENVIOS = 'envios-pecas-docs'

// ─── Envios ──────────────────────────────────────────────────────────────────

export async function listarEnvios(estado?: EnvioEstado): Promise<EnvioPeca[]> {
  let q = supabase.from('envios_pecas').select('*').order('created_at', { ascending: false })
  if (estado) q = q.eq('estado', estado)
  const { data } = await q
  return (data as EnvioPeca[]) ?? []
}

export async function obterEnvio(id: string) {
  return supabase.from('envios_pecas').select('*').eq('id', id).single()
}

export async function criarEnvio(
  input: EnvioInput,
  itens: EnvioItemInput[],
  criadoPor: string | null,
  criadoPorNome: string | null
) {
  const { data, error } = await supabase
    .from('envios_pecas')
    .insert({ ...input, estado: 'aberto', criado_por: criadoPor, criado_por_nome: criadoPorNome })
    .select()
    .single()
  if (error || !data) return { data: null, error }

  const envio = data as EnvioPeca
  if (itens.length > 0) {
    const linhas = itens.map((i) => ({
      envio_id: envio.id,
      peca_id: i.peca_id,
      peca_nome: i.peca_nome,
      serial_number: i.serial_number ?? null,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }))
    const { error: erroItens } = await supabase.from('envios_pecas_itens').insert(linhas)
    if (erroItens) return { data: envio, error: erroItens }
  }
  return { data: envio, error: null }
}

export async function atualizarEnvio(id: string, patch: Partial<EnvioPeca>) {
  return supabase.from('envios_pecas').update(patch).eq('id', id).select().single()
}

// Apaga um envio (os itens caem em cascata) e a respetiva linha no livro de Encomendas.
export async function eliminarEnvio(id: string) {
  await supabase.from('recepcao_movimentos').delete()
    .eq('referencia_tipo', 'envio_pecas').eq('referencia_id', id)
  return supabase.from('envios_pecas').delete().eq('id', id)
}

// Muda o estado; ao expedir regista a data de expedição.
// Se for um envio para fornecedor com motivo "reparação", atualiza o
// "em reparação" das peças (só contam enquanto expedidas e ainda por voltar).
export async function alterarEstado(id: string, estado: EnvioEstado) {
  const patch: Partial<EnvioPeca> = { estado }
  if (estado === 'expedido') patch.expedido_em = new Date().toISOString()
  const res = await supabase.from('envios_pecas').update(patch).eq('id', id).select().single()
  await aplicarReparacaoStock(id)
  return res
}

// Marca (ou desmarca) que as peças de um envio de reparação voltaram do fornecedor.
export async function marcarReparacaoVoltou(envioId: string, voltou: boolean) {
  await supabase
    .from('envios_pecas')
    .update({ reparacao_voltou_em: voltou ? new Date().toISOString() : null })
    .eq('id', envioId)
  await aplicarReparacaoStock(envioId)
  return obterEnvio(envioId)
}

// Recalcula o "em reparação" de todas as peças de um envio (se aplicável).
async function aplicarReparacaoStock(envioId: string) {
  const { data: envio } = await supabase
    .from('envios_pecas')
    .select('destinatario_tipo, motivo')
    .eq('id', envioId)
    .single()
  if (!envio || envio.destinatario_tipo !== 'fornecedor' || envio.motivo !== 'reparacao') return
  const { data: itens } = await supabase.from('envios_pecas_itens').select('peca_id').eq('envio_id', envioId)
  const pecaIds = Array.from(new Set((itens ?? []).map((i) => (i as { peca_id: string | null }).peca_id).filter(Boolean))) as string[]
  for (const pid of pecaIds) await recalcularReparacaoPeca(pid)
}

// Soma as unidades desta peça que estão fora em reparação (envios a fornecedor,
// motivo reparação, expedidos e ainda por voltar) e grava em pecas.quantidade_reparacao.
export async function recalcularReparacaoPeca(pecaId: string): Promise<number> {
  const { data: envios } = await supabase
    .from('envios_pecas')
    .select('id')
    .eq('destinatario_tipo', 'fornecedor')
    .eq('motivo', 'reparacao')
    .eq('estado', 'expedido')
    .is('reparacao_voltou_em', null)
  const ids = (envios ?? []).map((e) => (e as { id: string }).id)
  let total = 0
  if (ids.length > 0) {
    const { data: itens } = await supabase
      .from('envios_pecas_itens')
      .select('quantidade')
      .eq('peca_id', pecaId)
      .in('envio_id', ids)
    total = (itens ?? []).reduce((a, i) => a + ((i as { quantidade: number }).quantidade || 0), 0)
  }
  await supabase.from('pecas').update({ quantidade_reparacao: total }).eq('id', pecaId)
  return total
}

// Fornecedor(es) onde cada peça está a ser reparada (envios expedidos, por voltar).
export type ReparacaoInfo = { fornecedor: string; quantidade: number; numero: string | null }
export async function reparacoesAtivasPorPeca(): Promise<Map<string, ReparacaoInfo[]>> {
  const map = new Map<string, ReparacaoInfo[]>()
  const { data: envios } = await supabase
    .from('envios_pecas')
    .select('id, numero, fornecedor_nome')
    .eq('destinatario_tipo', 'fornecedor')
    .eq('motivo', 'reparacao')
    .eq('estado', 'expedido')
    .is('reparacao_voltou_em', null)
  const lista = (envios ?? []) as { id: string; numero: string | null; fornecedor_nome: string | null }[]
  if (lista.length === 0) return map
  const porId = new Map(lista.map((e) => [e.id, e]))
  const { data: itens } = await supabase
    .from('envios_pecas_itens')
    .select('peca_id, quantidade, envio_id')
    .in('envio_id', lista.map((e) => e.id))
  for (const it of (itens ?? []) as { peca_id: string | null; quantidade: number; envio_id: string }[]) {
    if (!it.peca_id) continue
    const e = porId.get(it.envio_id)
    const arr = map.get(it.peca_id) ?? []
    arr.push({ fornecedor: e?.fornecedor_nome ?? '—', quantidade: it.quantidade, numero: e?.numero ?? null })
    map.set(it.peca_id, arr)
  }
  return map
}

export async function marcarPago(id: string, pago: boolean, dataPagamento: string | null) {
  return supabase
    .from('envios_pecas')
    .update({ pago, data_pagamento: pago ? dataPagamento : null })
    .eq('id', id)
    .select()
    .single()
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export async function listarItens(envioId: string): Promise<EnvioItem[]> {
  const { data } = await supabase
    .from('envios_pecas_itens')
    .select('*')
    .eq('envio_id', envioId)
    .order('created_at', { ascending: true })
  return (data as EnvioItem[]) ?? []
}

// ─── Documentos (faturas / cartas de porte) ──────────────────────────────────

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

// Carrega um documento, atualiza o envio e devolve o url/caminho.
export async function carregarDocumento(
  envioId: string,
  tipo: 'fatura' | 'carta_porte',
  ficheiro: File
): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${envioId}/${tipo}-${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_ENVIOS).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }

  const { data: pub } = supabase.storage.from(BUCKET_ENVIOS).getPublicUrl(caminho)
  const patch: Partial<EnvioPeca> =
    tipo === 'fatura'
      ? { fatura_url: pub.publicUrl, fatura_caminho: caminho, faturado: true }
      : { carta_porte_url: pub.publicUrl, carta_porte_caminho: caminho }

  const { error: erroBd } = await supabase.from('envios_pecas').update(patch).eq('id', envioId)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

// ─── Fotos do envio ──────────────────────────────────────────────────────────

export type EnvioFoto = { id: string; envio_id: string; url: string; caminho: string; created_at: string }

export async function listarFotos(envioId: string): Promise<EnvioFoto[]> {
  const { data } = await supabase
    .from('envios_pecas_fotos')
    .select('*')
    .eq('envio_id', envioId)
    .order('created_at', { ascending: true })
  return (data as EnvioFoto[]) ?? []
}

// Carrega uma foto para o bucket (prefixo fotos/) e regista-a na tabela.
export async function carregarFoto(envioId: string, ficheiro: File): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${envioId}/fotos/${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_ENVIOS).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { data: pub } = supabase.storage.from(BUCKET_ENVIOS).getPublicUrl(caminho)
  const { error: erroBd } = await supabase
    .from('envios_pecas_fotos')
    .insert({ envio_id: envioId, url: pub.publicUrl, caminho })
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

export async function apagarFoto(fotoId: string, caminho: string) {
  await supabase.storage.from(BUCKET_ENVIOS).remove([caminho])
  return supabase.from('envios_pecas_fotos').delete().eq('id', fotoId)
}

// ─── Pesquisa de material (Stock de Peças + Tabela de Preços) ────────────────

export type MaterialOpc = {
  peca_id: string | null   // null quando vem do preçário (não é uma peça do stock)
  nome: string
  preco: number
  origem: 'stock' | 'preçário'
  detalhe: string | null
  serial_number: string | null   // S/N do stock de peças (null no preçário)
}

// Procura itens faturáveis em ambas as fontes e junta os resultados.
export async function pesquisarMaterial(q: string): Promise<MaterialOpc[]> {
  const termo = q.trim()
  if (termo.length < 1) return []
  const [pc, pr] = await Promise.all([
    supabase
      .from('pecas')
      .select('id, nome, marca, grupo, preco_venda, serial_number')
      .or(`nome.ilike.%${termo}%,grupo.ilike.%${termo}%,serial_number.ilike.%${termo}%`)
      .order('nome')
      .limit(15),
    supabase
      .from('tabela_precos')
      .select('id, nome, categoria, preco')
      .eq('ativo', true)
      .or(`nome.ilike.%${termo}%,categoria.ilike.%${termo}%`)
      .order('nome')
      .limit(15),
  ])
  const doPrecario: MaterialOpc[] = ((pr.data as { nome: string; categoria: string | null; preco: number | null }[]) ?? []).map((p) => ({
    peca_id: null,
    nome: p.nome,
    preco: p.preco ?? 0,
    origem: 'preçário',
    detalhe: p.categoria,
    serial_number: null,
  }))
  const doStock: MaterialOpc[] = ((pc.data as { id: string; nome: string; marca: string | null; grupo: string | null; preco_venda: number | null; serial_number: string | null }[]) ?? []).map((p) => ({
    peca_id: p.id,
    nome: p.nome,
    preco: p.preco_venda ?? 0,
    origem: 'stock',
    detalhe: [p.marca, p.grupo].filter(Boolean).join(' · ') || null,
    serial_number: p.serial_number,
  }))
  return [...doPrecario, ...doStock]
}

// ─── Seletores para o formulário ─────────────────────────────────────────────

export type FuncionarioOpc = { id: string; nome: string }

// Lista de funcionários (para escolher o responsável pela encomenda).
export async function listarFuncionarios(): Promise<FuncionarioOpc[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, nome')
    .order('nome')
  return ((data as { id: string; nome: string | null }[]) ?? [])
    .filter((p) => p.nome)
    .map((p) => ({ id: p.id, nome: p.nome as string }))
}

export type ClienteEnvioOpc = { id: string; nome: string; pais: string | null; email: string | null }

export async function listarClientesEnvio(): Promise<ClienteEnvioOpc[]> {
  const { data } = await supabase
    .from('clientes')
    .select('id, nome, pais, email')
    .order('nome')
    .limit(2000)
  return (data as ClienteEnvioOpc[]) ?? []
}

export type FornecedorEnvioOpc = { id: string; nome: string }

// Lista de fornecedores (destinatário = fornecedor).
export async function listarFornecedoresEnvio(): Promise<FornecedorEnvioOpc[]> {
  const { data } = await supabase
    .from('fornecedores')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
  return (data as FornecedorEnvioOpc[]) ?? []
}

// Adiciona um cliente novo (nome, email, telefone, país) à tabela clientes.
export async function criarClienteEnvio(
  nome: string,
  email: string,
  telefone: string,
  pais: string
): Promise<ClienteEnvioOpc | null> {
  const paisFinal = pais.trim() || 'Portugal'
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome: nome.trim(),
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      pais: paisFinal,
      nacional: paisFinal.toLowerCase() === 'portugal',
    })
    .select('id, nome, pais, email')
    .single()
  if (error || !data) return null
  return data as ClienteEnvioOpc
}

// ─── Efeitos ─────────────────────────────────────────────────────────────────

// Handoff: quando a Logística marca "Pronto a Expedir", avisa o Administrativo
// para tratar da faturação (Keyinvoice), cartas de porte e expedição.
export async function notificarProntoExpedir(envio: EnvioPeca) {
  const autorNome = envio.responsavel_nome ?? envio.criado_por_nome ?? 'Logística'
  const corpo =
    `Encomenda ${envio.numero ?? ''} para ${envio.cliente_nome ?? '—'} está pronta a expedir. ` +
    `Tratar faturação (Keyinvoice), carta de porte e expedição.`
  return supabase.from('comunicados').insert({
    titulo: `Encomenda pronta a expedir: ${envio.numero ?? ''}`.trim(),
    corpo,
    area: 'Administrativo',
    prioridade: 'importante',
    autor_id: envio.criado_por,
    autor_nome: autorNome,
    autor_iniciais: iniciais(autorNome, null),
  })
}
