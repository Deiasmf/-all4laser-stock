import { supabase } from './supabase'
import { listarNotasNaFase, obterEncaixotamento } from './neFluxo'
import { criarPackingList, guardarLinhasPacking } from './packingList'
import { moradaLinha, resumoEquipamentos, type Expedition, type ExpedicaoComContagem, type MoradaEntrega, type ExpedicaoEvento, type EstadoExpedition } from '@/types/expedition'
import type { NotaEncomenda } from '@/types/notaEncomenda'
import type { PackingList } from '@/types/packing'

// Camada de dados das Expedições (agrupamento de NEs). RLS: admin + administrativo.
export const BUCKET_EXPED_DOCS = 'expedicoes-docs'

type Autor = { id: string | null; nome: string | null }

function nomeSeguro(n: string) {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

async function registarEvento(expId: string, tipo: string, autor: Autor, extra?: { notaId?: string | null; detalhe?: string | null }) {
  await supabase.from('expedition_eventos').insert({
    expedition_id: expId, tipo, nota_id: extra?.notaId ?? null, detalhe: extra?.detalhe ?? null,
    user_id: autor.id, user_nome: autor.nome,
  })
}

// ─── NEs prontas a agrupar ───────────────────────────────────────────────────
// NEs na fase admin_expedicao/em_curso que NÃO estão numa expedição ativa.
export async function notasProntas(): Promise<NotaEncomenda[]> {
  const [notas, { data: ativas }] = await Promise.all([
    listarNotasNaFase('admin_expedicao'),
    supabase.from('expedition_notas').select('nota_id').is('removida_em', null),
  ])
  const usadas = new Set(((ativas as { nota_id: string }[] | null) ?? []).map((r) => r.nota_id))
  return notas.filter((n) => !usadas.has(n.id))
}

// Outras NEs prontas do mesmo cliente (atalho de sugestão de agrupamento).
export async function outrasProntasDoCliente(clienteId: string | null, excluirNotaId: string): Promise<NotaEncomenda[]> {
  if (!clienteId) return []
  const prontas = await notasProntas()
  return prontas.filter((n) => n.cliente_id === clienteId && n.id !== excluirNotaId)
}

// ─── Moradas de entrega do cliente ───────────────────────────────────────────
export async function moradasCliente(clienteId: string): Promise<MoradaEntrega[]> {
  const { data } = await supabase.from('cliente_moradas_entrega').select('*').eq('cliente_id', clienteId).order('created_at')
  return (data as MoradaEntrega[]) ?? []
}

// ─── Criação ─────────────────────────────────────────────────────────────────
export type CriarExpedicaoInput = {
  cliente_id: string | null
  cliente_nome: string | null
  morada: MoradaEntrega | null
  notaIds: string[]
}

export async function criarExpedicion(input: CriarExpedicaoInput, autor: Autor): Promise<{ id?: string; error?: string }> {
  if (input.notaIds.length === 0) return { error: 'Escolhe pelo menos uma Nota de Encomenda.' }
  const m = input.morada
  const { data, error } = await supabase.from('expeditions').insert({
    cliente_id: input.cliente_id, cliente_nome: input.cliente_nome,
    morada_entrega_id: m?.id ?? null, morada_etiqueta: m?.etiqueta ?? null,
    morada: m?.morada ?? null, cidade: m?.cidade ?? null, codigo_postal: m?.codigo_postal ?? null, pais: m?.pais ?? null,
    criado_por: autor.id, criado_por_nome: autor.nome,
  }).select().single()
  if (error || !data) return { error: error?.message ?? 'Falha ao criar a expedição.' }
  const exp = data as Expedition
  const rows = input.notaIds.map((nota_id, i) => ({ expedition_id: exp.id, nota_id, ordem: i }))
  const { error: eLig } = await supabase.from('expedition_notas').insert(rows)
  if (eLig) {
    // Reverte a expedição órfã se as NEs não puderam ser ligadas (ex.: já noutra expedição).
    await supabase.from('expeditions').delete().eq('id', exp.id)
    return { error: 'Uma das NEs já pertence a outra expedição ativa.' }
  }
  await registarEvento(exp.id, 'criada', autor, { detalhe: `${input.notaIds.length} NE(s)` })
  return { id: exp.id }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────
export type FiltroExpeditions = {
  estado?: EstadoExpedition
  clienteId?: string
  de?: string
  ate?: string
  procura?: string   // nº EXP, nº NE ou tracking
}

export async function listarExpeditions(f: FiltroExpeditions = {}): Promise<ExpedicaoComContagem[]> {
  let ids: string[] | null = null
  if (f.procura && f.procura.trim()) {
    const t = f.procura.trim()
    // Expedições cujo nº/tracking/cliente casa, OU que contêm uma NE cujo nº casa.
    const [{ data: exps }, { data: notas }] = await Promise.all([
      supabase.from('expeditions').select('id').or(`numero.ilike.%${t}%,tracking_numero.ilike.%${t}%,awb_numero.ilike.%${t}%,cliente_nome.ilike.%${t}%`),
      supabase.from('notas_encomenda').select('id').ilike('numero', `%${t}%`),
    ])
    const idSet = new Set(((exps as { id: string }[] | null) ?? []).map((e) => e.id))
    const notaIds = ((notas as { id: string }[] | null) ?? []).map((n) => n.id)
    if (notaIds.length) {
      const { data: liga } = await supabase.from('expedition_notas').select('expedition_id').in('nota_id', notaIds).is('removida_em', null)
      for (const l of (liga as { expedition_id: string }[] | null) ?? []) idSet.add(l.expedition_id)
    }
    ids = [...idSet]
    if (ids.length === 0) return []
  }

  let q = supabase.from('expeditions').select('*').order('created_at', { ascending: false })
  if (ids) q = q.in('id', ids)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.clienteId) q = q.eq('cliente_id', f.clienteId)
  if (f.de) q = q.gte('data_expedicao', f.de)
  if (f.ate) q = q.lte('data_expedicao', f.ate)
  const { data } = await q
  const exps = (data as Expedition[]) ?? []
  if (exps.length === 0) return []

  // Contagem de NEs ativas + resumo dos equipamentos por expedição.
  const { data: liga } = await supabase.from('expedition_notas')
    .select('expedition_id, nota:notas_encomenda(equipamento_modelo)')
    .in('expedition_id', exps.map((e) => e.id)).is('removida_em', null)
  const porExp = new Map<string, { equipamento_modelo: string | null }[]>()
  for (const l of (liga ?? []) as unknown as { expedition_id: string; nota: { equipamento_modelo: string | null } | null }[]) {
    if (!porExp.has(l.expedition_id)) porExp.set(l.expedition_id, [])
    if (l.nota) porExp.get(l.expedition_id)!.push(l.nota)
  }
  return exps.map((e) => {
    const ns = porExp.get(e.id) ?? []
    return { ...e, n_notas: ns.length, resumo: resumoEquipamentos(ns) }
  })
}

export async function obterExpedicion(id: string) {
  return supabase.from('expeditions').select('*').eq('id', id).single()
}

// NEs ativas de uma expedição (com os dados da NE).
export async function notasDaExpedicion(id: string): Promise<NotaEncomenda[]> {
  const { data } = await supabase
    .from('expedition_notas')
    .select('ordem, nota:notas_encomenda(*)')
    .eq('expedition_id', id).is('removida_em', null)
    .order('ordem')
  const linhas = (data ?? []) as unknown as { nota: NotaEncomenda | null }[]
  return linhas.map((l) => l.nota).filter((n): n is NotaEncomenda => !!n)
}

// Expedição ativa que contém uma NE (para o detalhe da NE — ponto 16).
export async function expedicaoDaNota(notaId: string): Promise<Pick<Expedition, 'id' | 'numero' | 'estado'> | null> {
  const { data } = await supabase
    .from('expedition_notas')
    .select('expedition:expeditions(id, numero, estado)')
    .eq('nota_id', notaId).is('removida_em', null)
    .limit(1)
  const linha = (data ?? [])[0] as unknown as { expedition: Pick<Expedition, 'id' | 'numero' | 'estado'> | null } | undefined
  return linha?.expedition ?? null
}

export async function eventosExpedicion(id: string): Promise<ExpedicaoEvento[]> {
  const { data } = await supabase.from('expedition_eventos').select('*').eq('expedition_id', id).order('created_at', { ascending: false })
  return (data as ExpedicaoEvento[]) ?? []
}

// ─── Gestão de NEs numa expedição em preparação ──────────────────────────────
export async function adicionarNota(exp: Expedition, nota: NotaEncomenda, autor: Autor): Promise<{ error?: string }> {
  if (nota.cliente_id !== exp.cliente_id) return { error: 'Só podes juntar NEs do mesmo cliente.' }
  const { error } = await supabase.from('expedition_notas').insert({ expedition_id: exp.id, nota_id: nota.id })
  if (error) return { error: 'Esta NE já pertence a outra expedição ativa.' }
  await registarEvento(exp.id, 'nota_add', autor, { notaId: nota.id, detalhe: nota.numero })
  return {}
}

export async function removerNota(expId: string, nota: NotaEncomenda, autor: Autor): Promise<{ error?: string }> {
  const { error } = await supabase.from('expedition_notas').update({ removida_em: new Date().toISOString() })
    .eq('expedition_id', expId).eq('nota_id', nota.id).is('removida_em', null)
  if (error) return { error: error.message }
  await registarEvento(expId, 'nota_remove', autor, { notaId: nota.id, detalhe: nota.numero })
  return {}
}

// ─── Atualização / transições de estado ──────────────────────────────────────
export type ExpedicaoPatch = Partial<Pick<Expedition,
  'tipo_transporte' | 'transportadora' | 'tracking_numero' | 'awb_numero' | 'data_prevista' | 'data_expedicao' | 'notas' |
  'morada_entrega_id' | 'morada_etiqueta' | 'morada' | 'cidade' | 'codigo_postal' | 'pais'>>

export async function atualizarExpedicion(id: string, patch: ExpedicaoPatch) {
  return supabase.from('expeditions').update(patch).eq('id', id).select().single()
}

export async function marcarEstado(id: string, estado: 'em_preparacao' | 'pronta', autor: Autor) {
  await supabase.from('expeditions').update({ estado }).eq('id', id)
  await registarEvento(id, 'estado', autor, { detalhe: estado })
}

export async function expedir(id: string, autor: Autor): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('expedir_expedition', { p_exp_id: id })
  if (error) return { error: error.message }
  await registarEvento(id, 'estado', autor, { detalhe: 'expedida' })
  return {}
}

export async function marcarEntregue(id: string, autor: Autor) {
  await supabase.from('expeditions').update({ estado: 'entregue', data_entrega: new Date().toISOString().slice(0, 10) }).eq('id', id)
  await registarEvento(id, 'estado', autor, { detalhe: 'entregue' })
}

export async function cancelar(id: string, autor: Autor): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('cancelar_expedition', { p_exp_id: id })
  if (error) return { error: error.message }
  await registarEvento(id, 'estado', autor, { detalhe: 'cancelada' })
  return {}
}

// ─── Carta de porte (bucket privado) ─────────────────────────────────────────
export async function carregarCartaPorte(expId: string, file: File): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${expId}/${Date.now()}-${nomeSeguro(file.name)}`
  const { error } = await supabase.storage.from(BUCKET_EXPED_DOCS).upload(caminho, file)
  if (error) return { ok: false, motivo: error.message }
  const { error: e2 } = await supabase.from('expeditions').update({ carta_porte_caminho: caminho, carta_porte_url: null }).eq('id', expId)
  if (e2) return { ok: false, motivo: e2.message }
  return { ok: true }
}

export async function urlCartaPorte(exp: Pick<Expedition, 'carta_porte_caminho' | 'carta_porte_url'>, segundos = 120): Promise<string | null> {
  if (exp.carta_porte_caminho) {
    const { data } = await supabase.storage.from(BUCKET_EXPED_DOCS).createSignedUrl(exp.carta_porte_caminho, segundos)
    if (data?.signedUrl) return data.signedUrl
  }
  return exp.carta_porte_url ?? null
}

// ─── Packing list consolidada (reutiliza o módulo PL) ────────────────────────
export async function packingListDaExpedicion(expId: string): Promise<PackingList | null> {
  const { data } = await supabase.from('packing_lists').select('*').eq('expedition_id', expId).order('created_at', { ascending: false }).limit(1)
  return (data as PackingList[])?.[0] ?? null
}

// Cria (ou recria) a packing list da expedição, consolidando as caixas de cada NE.
export async function gerarPackingListExpedicion(exp: Expedition, notas: NotaEncomenda[], autor: Autor): Promise<{ id?: string; error?: string }> {
  const idioma = (exp.pais ?? '').toLowerCase().includes('portugal') ? 'pt' : 'en'
  const referencia = `${exp.numero ?? ''} · ${notas.map((n) => n.numero).filter(Boolean).join(', ')}`.trim()
  const { data: pl, error } = await criarPackingList({
    idioma,
    destinatario_nome: exp.cliente_nome,
    destinatario_morada: moradaLinha(exp) || null,
    referencia,
    tracking_awb: exp.tracking_numero || exp.awb_numero || null,
    observacoes: null,
  }, autor.id)
  if (error || !pl) return { error: error?.message ?? 'Falha ao criar a packing list.' }
  const plId = (pl as PackingList).id
  await supabase.from('packing_lists').update({ expedition_id: exp.id }).eq('id', plId)

  // Uma linha (volume) por NE, a partir dos dados de encaixotamento.
  const linhas = await Promise.all(notas.map(async (n) => {
    const enc = await obterEncaixotamento(n.id)
    return {
      descricao: `${n.equipamento_modelo ?? 'Equipamento'}${n.equipamento_sn ? ` (SN ${n.equipamento_sn})` : ''}`,
      ext_c: enc?.exterior_comprimento ?? null,
      ext_l: enc?.exterior_largura ?? null,
      ext_a: enc?.exterior_altura ?? null,
      peso_liquido: enc?.peso_liquido ?? null,
      peso_bruto: enc?.peso_bruto ?? null,
      quantidade: 1,
    }
  }))
  await guardarLinhasPacking(plId, linhas)
  await registarEvento(exp.id, 'doc', autor, { detalhe: 'Packing list gerada' })
  return { id: plId }
}
