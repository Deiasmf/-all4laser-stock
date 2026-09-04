import { supabase } from './supabase'
import type {
  Campanha, CampanhaInput, Post, PostInput, PostDetalhe, Variante, VarianteInput,
  PostEquipamento, ComplianceItem, Aprovacao, PropostaPaga, EstadoPost,
} from '@/types/marketing'
import { CHECKLIST_ITENS } from '@/types/marketing'

export type Autor = { id: string; nome: string | null }

const limpar = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

// ═══ CAMPANHAS ══════════════════════════════════════════════════════════════
export async function listarCampanhas(): Promise<Campanha[]> {
  const { data } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000)
  return (data as Campanha[]) ?? []
}

export async function obterCampanha(id: string) {
  return supabase.from('marketing_campaigns').select('*').eq('id', id).single()
}

export async function criarCampanha(input: CampanhaInput, autor: Autor) {
  return supabase.from('marketing_campaigns').insert({
    nome: input.nome.trim(),
    objetivo_comercial: limpar(input.objetivo_comercial),
    linha_negocio: input.linha_negocio ?? null,
    oferta: limpar(input.oferta),
    mercados: input.mercados ?? [],
    publicos: limpar(input.publicos),
    data_inicio: input.data_inicio || null,
    data_fim: input.data_fim || null,
    idiomas: input.idiomas ?? [],
    canais: input.canais ?? [],
    landing_url: limpar(input.landing_url),
    kpi_principal: limpar(input.kpi_principal),
    kpis_secundarios: limpar(input.kpis_secundarios),
    estado: input.estado ?? 'rascunho',
    notas: limpar(input.notas),
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select('*').single()
}

export async function atualizarCampanha(id: string, input: CampanhaInput) {
  return supabase.from('marketing_campaigns').update({
    nome: input.nome.trim(),
    objetivo_comercial: limpar(input.objetivo_comercial),
    linha_negocio: input.linha_negocio ?? null,
    oferta: limpar(input.oferta),
    mercados: input.mercados ?? [],
    publicos: limpar(input.publicos),
    data_inicio: input.data_inicio || null,
    data_fim: input.data_fim || null,
    idiomas: input.idiomas ?? [],
    canais: input.canais ?? [],
    landing_url: limpar(input.landing_url),
    kpi_principal: limpar(input.kpi_principal),
    kpis_secundarios: limpar(input.kpis_secundarios),
    estado: input.estado ?? 'rascunho',
    notas: limpar(input.notas),
  }).eq('id', id).select('*').single()
}

export async function apagarCampanha(id: string, autor: Autor) {
  return supabase.from('marketing_campaigns')
    .update({ deleted_at: new Date().toISOString(), deleted_by: autor.id, deleted_by_nome: autor.nome })
    .eq('id', id)
}

// ═══ PUBLICAÇÕES ════════════════════════════════════════════════════════════
export type PostListItem = Post & { campanha_nome: string | null; n_variantes: number }

export async function listarPosts(): Promise<PostListItem[]> {
  const { data } = await supabase
    .from('marketing_posts')
    .select('*, marketing_campaigns(nome), marketing_post_variants(id)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000)
  type Row = Post & {
    marketing_campaigns: { nome: string } | null
    marketing_post_variants: { id: string }[] | null
  }
  return ((data as Row[]) ?? []).map((r) => ({
    ...r,
    campanha_nome: r.marketing_campaigns?.nome ?? null,
    n_variantes: r.marketing_post_variants?.length ?? 0,
  }))
}

export async function obterPostDetalhe(id: string): Promise<PostDetalhe | null> {
  const { data: post } = await supabase.from('marketing_posts').select('*').eq('id', id).single()
  if (!post) return null
  const p = post as Post
  const [variantes, equipamentos, checklist, aprovacoes, proposta, campanha] = await Promise.all([
    supabase.from('marketing_post_variants').select('*').eq('post_id', id).order('created_at'),
    supabase.from('marketing_post_equipment').select('*').eq('post_id', id),
    supabase.from('marketing_compliance_checks').select('*').eq('post_id', id).order('item'),
    supabase.from('marketing_post_approvals').select('*').eq('post_id', id).order('created_at', { ascending: false }),
    supabase.from('marketing_paid_proposals').select('*').eq('post_id', id).order('created_at', { ascending: false }).limit(1),
    p.campaign_id ? supabase.from('marketing_campaigns').select('nome').eq('id', p.campaign_id).single() : Promise.resolve({ data: null }),
  ])
  return {
    ...p,
    variantes: (variantes.data as Variante[]) ?? [],
    equipamentos: (equipamentos.data as PostEquipamento[]) ?? [],
    checklist: (checklist.data as ComplianceItem[]) ?? [],
    aprovacoes: (aprovacoes.data as Aprovacao[]) ?? [],
    proposta_paga: ((proposta.data as PropostaPaga[]) ?? [])[0] ?? null,
    campanha_nome: (campanha.data as { nome: string } | null)?.nome ?? null,
  }
}

export async function criarPost(input: PostInput, autor: Autor) {
  return supabase.from('marketing_posts').insert({
    titulo_interno: input.titulo_interno.trim(),
    campaign_id: input.campaign_id || null,
    linha_negocio: input.linha_negocio ?? null,
    objetivo: input.objetivo ?? null,
    mercados: input.mercados ?? [],
    idioma_base: limpar(input.idioma_base),
    publico_alvo: limpar(input.publico_alvo),
    prioridade: input.prioridade ?? 'normal',
    notas_internas: limpar(input.notas_internas),
    canva_url: limpar(input.canva_url),
    estrategia_promocao: input.estrategia_promocao ?? 'organica',
    estado_global: 'draft',
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select('*').single()
}

// Editar os campos de uma publicação. Se estava aprovada/programada, editar o
// conteúdo invalida a aprovação e volta a "em revisão" (regra §6.3).
export async function atualizarPost(id: string, input: PostInput, estadoAtual: EstadoPost, autor: Autor) {
  const invalida = estadoAtual === 'approved' || estadoAtual === 'scheduled'
  const patch: Record<string, unknown> = {
    titulo_interno: input.titulo_interno.trim(),
    campaign_id: input.campaign_id || null,
    linha_negocio: input.linha_negocio ?? null,
    objetivo: input.objetivo ?? null,
    mercados: input.mercados ?? [],
    idioma_base: limpar(input.idioma_base),
    publico_alvo: limpar(input.publico_alvo),
    prioridade: input.prioridade ?? 'normal',
    notas_internas: limpar(input.notas_internas),
    canva_url: limpar(input.canva_url),
    estrategia_promocao: input.estrategia_promocao ?? 'organica',
  }
  if (invalida) patch.estado_global = 'in_review'
  const res = await supabase.from('marketing_posts').update(patch).eq('id', id).select('*').single()
  if (!res.error && invalida) {
    await registarAcao(id, null, 'pediu_alteracoes', autor, 'Edição após aprovação — voltou a revisão.')
  }
  return res
}

export async function apagarPost(id: string, autor: Autor) {
  return supabase.from('marketing_posts')
    .update({ deleted_at: new Date().toISOString(), deleted_by: autor.id, deleted_by_nome: autor.nome })
    .eq('id', id)
}

// ── Máquina de estados (revisão/aprovação) ───────────────────────────────────
async function registarAcao(
  postId: string, variantId: string | null,
  acao: Aprovacao['acao'], autor: Autor, comentario?: string | null,
) {
  await supabase.from('marketing_post_approvals').insert({
    post_id: postId, variant_id: variantId, acao,
    por_id: autor.id, por_nome: autor.nome, comentario: limpar(comentario),
  })
}

async function mudarEstado(postId: string, estado: EstadoPost) {
  return supabase.from('marketing_posts').update({ estado_global: estado }).eq('id', postId)
}

export async function submeterRevisao(postId: string, autor: Autor) {
  const r = await mudarEstado(postId, 'in_review')
  if (!r.error) await registarAcao(postId, null, 'submeteu', autor)
  return r
}
export async function pedirAlteracoes(postId: string, autor: Autor, comentario: string) {
  const r = await mudarEstado(postId, 'changes_requested')
  if (!r.error) await registarAcao(postId, null, 'pediu_alteracoes', autor, comentario)
  return r
}
export async function aprovarPost(postId: string, autor: Autor) {
  const r = await mudarEstado(postId, 'approved')
  if (!r.error) await registarAcao(postId, null, 'aprovou', autor)
  return r
}
export async function cancelarPost(postId: string, autor: Autor) {
  const r = await mudarEstado(postId, 'cancelled')
  if (!r.error) await registarAcao(postId, null, 'cancelou', autor)
  return r
}
export async function arquivarPost(postId: string) {
  return mudarEstado(postId, 'archived')
}

// ── Variantes ────────────────────────────────────────────────────────────────
export async function criarVariante(postId: string, input: VarianteInput, autor: Autor) {
  return supabase.from('marketing_post_variants').insert({
    post_id: postId,
    plataforma: input.plataforma,
    idioma: limpar(input.idioma),
    texto: limpar(input.texto),
    titulo: limpar(input.titulo),
    cta: limpar(input.cta),
    url_destino: limpar(input.url_destino),
    hashtags: input.hashtags ?? [],
    primeiro_comentario: limpar(input.primeiro_comentario),
    alt_text: limpar(input.alt_text),
    formato: input.formato ?? null,
    data_agendada: input.data_agendada || null,
    estado: 'draft',
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select('*').single()
}

export async function atualizarVariante(id: string, input: VarianteInput) {
  return supabase.from('marketing_post_variants').update({
    plataforma: input.plataforma,
    idioma: limpar(input.idioma),
    texto: limpar(input.texto),
    titulo: limpar(input.titulo),
    cta: limpar(input.cta),
    url_destino: limpar(input.url_destino),
    hashtags: input.hashtags ?? [],
    primeiro_comentario: limpar(input.primeiro_comentario),
    alt_text: limpar(input.alt_text),
    formato: input.formato ?? null,
    data_agendada: input.data_agendada || null,
  }).eq('id', id).select('*').single()
}

export async function apagarVariante(id: string) {
  return supabase.from('marketing_post_variants').delete().eq('id', id)
}

// ── Equipamentos associados (substitui a lista inteira) ──────────────────────
export async function definirEquipamentos(
  postId: string, itens: { equipamento_id: string; marca: string | null; modelo: string | null }[],
) {
  await supabase.from('marketing_post_equipment').delete().eq('post_id', postId)
  if (itens.length === 0) return { error: null }
  return supabase.from('marketing_post_equipment').insert(
    itens.map((i) => ({ post_id: postId, equipamento_id: i.equipamento_id, marca: i.marca, modelo: i.modelo })),
  )
}

// ── Checklist de conformidade ────────────────────────────────────────────────
// Garante que existem as linhas-padrão para o post (idempotente).
export async function garantirChecklist(postId: string) {
  const { data } = await supabase.from('marketing_compliance_checks').select('item').eq('post_id', postId)
  const existentes = new Set((data as { item: string }[] ?? []).map((r) => r.item))
  const faltam = CHECKLIST_ITENS.filter((i) => !existentes.has(i.chave))
  if (faltam.length > 0) {
    await supabase.from('marketing_compliance_checks').insert(
      faltam.map((i) => ({ post_id: postId, item: i.chave, estado: 'pendente' })),
    )
  }
}

export async function definirCheck(
  postId: string, item: string,
  estado: ComplianceItem['estado'], justificacao: string | null, autor: Autor,
) {
  return supabase.from('marketing_compliance_checks').upsert({
    post_id: postId, item, estado, justificacao: limpar(justificacao),
    por_id: autor.id, por_nome: autor.nome, updated_at: new Date().toISOString(),
  }, { onConflict: 'post_id,item' })
}

// ── Propostas de promoção paga ───────────────────────────────────────────────
export async function criarProposta(postId: string, input: Partial<PropostaPaga>, autor: Autor) {
  // Marca a publicação como candidata a paga.
  await supabase.from('marketing_posts').update({ estrategia_promocao: 'candidata_paga' }).eq('id', postId)
  return supabase.from('marketing_paid_proposals').insert({
    post_id: postId,
    motivo: limpar(input.motivo),
    objetivo: input.objetivo ?? null,
    mercado: limpar(input.mercado),
    publico: limpar(input.publico),
    periodo_inicio: input.periodo_inicio || null,
    periodo_fim: input.periodo_fim || null,
    orcamento_proposto: input.orcamento_proposto ?? null,
    estado: 'proposta',
    observacoes: limpar(input.observacoes),
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select('*').single()
}

// Aprovar orçamento: a BD (trigger) garante que só admin/financeiro consegue.
export async function aprovarProposta(id: string, postId: string, autor: Autor, refExterna?: string | null) {
  const r = await supabase.from('marketing_paid_proposals').update({
    estado: 'aprovada', aprovado_por_id: autor.id, aprovado_por_nome: autor.nome,
    campanha_externa_ref: limpar(refExterna),
  }).eq('id', id).select('*').single()
  if (!r.error) {
    await supabase.from('marketing_posts').update({ estrategia_promocao: 'paga_aprovada' }).eq('id', postId)
  }
  return r
}

export async function rejeitarProposta(id: string) {
  return supabase.from('marketing_paid_proposals').update({ estado: 'rejeitada' }).eq('id', id)
}
