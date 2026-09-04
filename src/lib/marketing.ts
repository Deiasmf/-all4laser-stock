import { supabase } from './supabase'
import type {
  Campanha, CampanhaInput, Post, PostInput, PostDetalhe, Variante, VarianteInput,
  PostEquipamento, ComplianceItem, Aprovacao, PropostaPaga, EstadoPost, Plataforma,
  LinhaNegocio, ObjetivoPost, FormatoVariante,
} from '@/types/marketing'
import { CHECKLIST_ITENS } from '@/types/marketing'
import type { MediaAsset, TipoMedia } from '@/types/marketing'
import { comprimirImagem } from './mediaUpload'
import { semAcentos } from './categorizacaoFinanceira'

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

// ═══ IMPORTAÇÃO DO PLANO EDITORIAL (CSV) ════════════════════════════════════
// Aceita o CSV do plano set–dez (também serve um export de Excel guardado como
// CSV). Colunas suportadas (§17): data, hora, plataforma, título interno, tema,
// linha de negócio, objetivo, marca, modelo, mercado, idioma, formato, copy,
// CTA, URL, hashtags, link Canva, orgânico/pago, orçamento, notas.
const semAcento = (s: string) => semAcentos(s).toLowerCase().trim()

function detetarDelim(l: string): string {
  if (l.includes('\t')) return '\t'
  if (l.includes(';')) return ';'
  return ','
}

const MAPA_LINHA: Record<string, LinhaNegocio> = {
  venda: 'venda', sale: 'venda', sales: 'venda',
  aluguer: 'aluguer', rental: 'aluguer', rent: 'aluguer',
  'assistencia tecnica': 'assistencia', assistencia: 'assistencia',
  'technical assistance': 'assistencia', 'technical service': 'assistencia', service: 'assistencia',
  formacao: 'formacao', training: 'formacao', 'formacao/training': 'formacao',
  institucional: 'institucional', institutional: 'institucional', corporate: 'institucional',
}
const MAPA_OBJETIVO: Record<string, ObjetivoPost> = {
  notoriedade: 'notoriedade', awareness: 'notoriedade',
  educacao: 'educacao', education: 'educacao',
  prova: 'prova', proof: 'prova',
  captacao: 'captacao', acquisition: 'captacao', 'lead gen': 'captacao', leads: 'captacao',
  conversao: 'conversao', conversion: 'conversao',
  retencao: 'retencao', retention: 'retencao',
}
const MAPA_PLATAFORMA: Record<string, Plataforma> = {
  'instagram feed': 'instagram_feed', 'instagram': 'instagram_feed', 'ig': 'instagram_feed',
  'instagram post': 'instagram_feed', feed: 'instagram_feed',
  'instagram story': 'instagram_story', 'story': 'instagram_story', stories: 'instagram_story',
  'instagram stories': 'instagram_story', 'ig story': 'instagram_story',
  'instagram reel': 'instagram_reel', 'reel': 'instagram_reel', reels: 'instagram_reel', 'ig reel': 'instagram_reel',
  facebook: 'facebook', fb: 'facebook', 'facebook post': 'facebook', linkedin: 'linkedin', 'linked in': 'linkedin',
}
const MAPA_FORMATO: Record<string, FormatoVariante> = {
  imagem: 'imagem', image: 'imagem', foto: 'imagem', photo: 'imagem',
  carrossel: 'carrossel', carousel: 'carrossel',
  video: 'video', reel: 'reel', story: 'story',
  documento: 'documento', document: 'documento', pdf: 'documento',
  texto: 'texto', text: 'texto',
}
// Sinónimos de cabeçalho → campo canónico (PT e EN — o plano é bilingue).
const CAMPOS: Record<string, string> = {
  // data / hora
  data: 'data', date: 'data', dia: 'data', hora: 'hora', time: 'hora', horas: 'hora',
  // plataforma / rede
  plataforma: 'plataforma', platform: 'plataforma', rede: 'plataforma',
  'rede social': 'plataforma', 'social network': 'plataforma', network: 'plataforma',
  canal: 'plataforma', channel: 'plataforma',
  // título
  'titulo interno': 'titulo', titulo: 'titulo', title: 'titulo', 'internal title': 'titulo',
  'titulo da publicacao': 'titulo', 'titulo publicacao': 'titulo', post: 'titulo', publicacao: 'titulo',
  // tema
  tema: 'tema', theme: 'tema', topic: 'tema', topico: 'tema',
  // linha de negócio
  'linha de negocio': 'linha', linha: 'linha', 'business line': 'linha', 'line of business': 'linha',
  // objetivo
  objetivo: 'objetivo', objective: 'objetivo', goal: 'objetivo', 'objetivo do post': 'objetivo',
  // marca / modelo
  marca: 'marca', brand: 'marca', modelo: 'modelo', model: 'modelo',
  // mercado / idioma
  mercado: 'mercado', market: 'mercado', idioma: 'idioma', language: 'idioma', lingua: 'idioma', lang: 'idioma',
  // formato
  formato: 'formato', format: 'formato', tipo: 'formato', type: 'formato',
  // copy / texto
  copy: 'copy', texto: 'copy', text: 'copy', legenda: 'copy', caption: 'copy',
  conteudo: 'copy', content: 'copy', 'texto/copy': 'copy',
  // cta / url
  cta: 'cta', 'call to action': 'cta', 'chamada para acao': 'cta',
  url: 'url', link: 'url', 'url de destino': 'url', 'destination url': 'url', ligacao: 'url',
  // hashtags
  hashtags: 'hashtags', hashtag: 'hashtags', tags: 'hashtags',
  // canva
  'link canva': 'canva', canva: 'canva', 'canva link': 'canva', 'design canva': 'canva',
  // orgânico/pago
  'organico/pago': 'promo', 'organico / pago': 'promo', promocao: 'promo', 'organic/paid': 'promo',
  promocaopaga: 'promo', 'organic / paid': 'promo',
  // orçamento
  orcamento: 'orcamento', 'orcamento proposto': 'orcamento', budget: 'orcamento', 'proposed budget': 'orcamento',
  // notas
  notas: 'notas', notes: 'notas', observacoes: 'notas', obs: 'notas',
}

export type LinhaImport = {
  linha: number
  titulo: string
  plataforma: Plataforma | null
  linha_negocio: LinhaNegocio | null
  objetivo: ObjetivoPost | null
  marca: string | null; modelo: string | null; mercado: string | null; idioma: string | null
  formato: FormatoVariante | null
  copy: string | null; cta: string | null; url: string | null
  hashtags: string[]
  canva_url: string | null
  paga: boolean
  orcamento: number | null
  notas: string | null
  data_agendada: string | null
  erros: string[]
}

function dataHoraParaIso(data: string, hora: string): string | null {
  const d = data.trim(); if (!d) return null
  let iso: string
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) iso = d.slice(0, 10)
  else {
    const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (!m) return null
    iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  const h = (hora || '').trim().match(/^(\d{1,2}):(\d{2})/)
  const hhmm = h ? `${h[1].padStart(2, '0')}:${h[2]}` : '09:00'
  const dt = new Date(`${iso}T${hhmm}`)          // hora local do browser (Lisboa)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

// Mapeia um cabeçalho a um campo canónico. Tenta o texto todo e, se falhar,
// cada parte de um cabeçalho bilingue ("Título Interno / Internal Title").
function mapearHeader(h: string): string {
  const n = semAcentos(h).toLowerCase().trim()
  if (CAMPOS[n]) return CAMPOS[n]
  for (const parte of n.split(/[/\n|()]+/).map((p) => p.trim())) {
    if (parte && CAMPOS[parte]) return CAMPOS[parte]
  }
  return ''
}

// Limpa uma célula: tira espaços, aspas envolventes e aspas duplicadas ("" → ").
function descell(s: string): string {
  let t = (s ?? '').trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).replace(/""/g, '"')
  return t.trim()
}

export function parsePlanoCsv(texto: string): { linhas: LinhaImport[]; erroGeral: string | null } {
  // Ficheiro .xlsx (binário zip "PK") não é CSV — dar mensagem clara.
  if (texto.startsWith('PK') || texto.includes('[Content_Types].xml')) {
    return { linhas: [], erroGeral: 'Isto parece um ficheiro Excel (.xlsx). Abre-o no Excel/Sheets e guarda como CSV (Ficheiro → Guardar como → CSV) e volta a carregar.' }
  }
  const limpo = texto.replace(/^﻿/, '')            // remove BOM do Excel
  const todas = limpo.split(/\r?\n/)
  if (todas.filter((l) => l.trim() !== '').length < 2) {
    return { linhas: [], erroGeral: 'Ficheiro vazio ou sem linhas de dados.' }
  }

  // A linha de cabeçalho pode não ser a 1ª (há ficheiros com título/banner por
  // cima). Procuramos a primeira linha que mapeia "título" E "plataforma".
  let headerRow = -1, delim = ',', header: string[] = []
  let melhor = { n: 0, brutos: [] as string[] }
  for (let i = 0; i < Math.min(todas.length, 40); i++) {
    if (!todas[i].trim()) continue
    const d = detetarDelim(todas[i])
    const brutos = todas[i].split(d).map(descell)
    const mapa = brutos.map(mapearHeader)
    const n = mapa.filter(Boolean).length
    if (n > melhor.n) melhor = { n, brutos }
    if (mapa.includes('titulo') && mapa.includes('plataforma')) {
      headerRow = i; delim = d; header = mapa; break
    }
  }
  if (headerRow < 0) {
    return { linhas: [], erroGeral: `Não encontrei a linha de cabeçalho com “título interno” e “plataforma”. Linha mais parecida: ${melhor.brutos.filter(Boolean).join(' | ') || '(nenhuma)'}.` }
  }
  const idx = (campo: string) => header.indexOf(campo)
  const cel = (cols: string[], campo: string) => { const i = idx(campo); return i >= 0 ? descell(cols[i] ?? '') : '' }

  const out: LinhaImport[] = []
  for (let i = headerRow + 1; i < todas.length; i++) {
    if (!todas[i].trim()) continue
    const cols = todas[i].split(delim)
    // Salta linhas totalmente vazias (só separadores) ou de secção sem dados.
    if (cols.every((c) => descell(c) === '')) continue
    const titulo = cel(cols, 'titulo')
    // Linha sem título nem plataforma preenchidos = separador/subtítulo → ignora.
    if (!titulo && !cel(cols, 'plataforma')) continue
    const platRaw = semAcento(cel(cols, 'plataforma'))
    const plataforma = MAPA_PLATAFORMA[platRaw] ?? null
    const promo = semAcento(cel(cols, 'promo'))
    const orcRaw = cel(cols, 'orcamento').replace(/[€\s]/g, '').replace(',', '.')
    const dataAg = dataHoraParaIso(cel(cols, 'data'), cel(cols, 'hora'))
    const erros: string[] = []
    if (!titulo) erros.push('sem título')
    if (!plataforma) erros.push(`plataforma inválida: “${cel(cols, 'plataforma')}”`)
    if (cel(cols, 'data') && !dataAg) erros.push('data inválida')
    out.push({
      linha: i + 1, titulo, plataforma,
      linha_negocio: MAPA_LINHA[semAcento(cel(cols, 'linha'))] ?? null,
      objetivo: MAPA_OBJETIVO[semAcento(cel(cols, 'objetivo'))] ?? null,
      marca: cel(cols, 'marca') || null, modelo: cel(cols, 'modelo') || null,
      mercado: cel(cols, 'mercado') || null, idioma: cel(cols, 'idioma') || null,
      formato: MAPA_FORMATO[semAcento(cel(cols, 'formato'))] ?? null,
      copy: cel(cols, 'copy') || null, cta: cel(cols, 'cta') || null, url: cel(cols, 'url') || null,
      hashtags: cel(cols, 'hashtags').split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean),
      canva_url: cel(cols, 'canva') || null,
      paga: promo.includes('pag') || promo.includes('paid'),
      orcamento: orcRaw && !isNaN(Number(orcRaw)) ? Number(orcRaw) : null,
      notas: [cel(cols, 'tema'), cel(cols, 'notas')].filter(Boolean).join(' — ') || null,
      data_agendada: dataAg, erros,
    })
  }
  return { linhas: out, erroGeral: null }
}

export type ResultadoImport = { criados: number; ignorados: number; falhados: number; detalhe: string[] }

// Importa as linhas válidas como publicações em rascunho (nunca publica nem
// aprova). Dedup por (título + plataforma + data agendada) para reimportar sem
// duplicar. Cada linha = 1 publicação + 1 variante.
export async function importarPlano(linhas: LinhaImport[], autor: Autor): Promise<ResultadoImport> {
  const res: ResultadoImport = { criados: 0, ignorados: 0, falhados: 0, detalhe: [] }

  // Chaves já existentes (para idempotência).
  const { data: existRaw } = await supabase.from('marketing_post_variants')
    .select('plataforma, data_agendada, marketing_posts(titulo_interno)').limit(5000)
  const chave = (t: string, p: string, d: string | null) => `${semAcento(t)}|${p}|${d ?? ''}`
  const vistos = new Set(
    ((existRaw as unknown as { plataforma: string; data_agendada: string | null; marketing_posts: { titulo_interno: string } | null }[]) ?? [])
      .map((r) => chave(r.marketing_posts?.titulo_interno ?? '', r.plataforma, r.data_agendada)),
  )

  for (const l of linhas) {
    if (l.erros.length > 0 || !l.plataforma) { res.falhados++; continue }
    const k = chave(l.titulo, l.plataforma, l.data_agendada)
    if (vistos.has(k)) { res.ignorados++; continue }
    try {
      const post = await criarPost({
        titulo_interno: l.titulo, linha_negocio: l.linha_negocio, objetivo: l.objetivo,
        mercados: l.mercado ? [l.mercado] : [], idioma_base: l.idioma, canva_url: l.canva_url,
        notas_internas: l.notas, estrategia_promocao: l.paga ? 'candidata_paga' : 'organica',
      }, autor)
      if (post.error || !post.data) { res.falhados++; continue }
      await criarVariante(post.data.id, {
        plataforma: l.plataforma, formato: l.formato, idioma: l.idioma, texto: l.copy,
        cta: l.cta, url_destino: l.url, hashtags: l.hashtags, data_agendada: l.data_agendada,
      }, autor)
      vistos.add(k); res.criados++
    } catch {
      res.falhados++
    }
  }
  return res
}

// ═══ BIBLIOTECA DE MEDIA ════════════════════════════════════════════════════
export const BUCKET_MARKETING = 'marketing-media'
const nomeSeguro = (n: string) => n.normalize('NFD').replace(/[^\w.\-]/g, '_')

export async function listarMediaAssets(): Promise<MediaAsset[]> {
  const { data } = await supabase.from('marketing_media_assets')
    .select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(2000)
  return (data as MediaAsset[]) ?? []
}

export type MediaMeta = {
  nome_interno: string
  marca?: string | null
  modelo?: string | null
  campaign_id?: string | null
  mercado?: string | null
  idioma?: string | null
  origem?: string | null
  direitos?: string | null
  direitos_validade?: string | null
  etiquetas?: string[]
}

// Carrega um ficheiro para o bucket privado e cria o registo na biblioteca.
export async function carregarMediaAsset(file: File, meta: MediaMeta, autor: Autor) {
  const otimizado = await comprimirImagem(file)
  const tipo: TipoMedia = otimizado.type.startsWith('image/') ? 'imagem'
    : otimizado.type.startsWith('video/') ? 'video' : 'documento'
  const caminho = `${new Date().getFullYear()}/${Date.now()}-${nomeSeguro(otimizado.name)}`
  const up = await supabase.storage.from(BUCKET_MARKETING).upload(caminho, otimizado)
  if (up.error) return { data: null, error: up.error }
  return supabase.from('marketing_media_assets').insert({
    nome_interno: meta.nome_interno.trim() || otimizado.name,
    tipo, caminho,
    marca: limpar(meta.marca), modelo: limpar(meta.modelo),
    campaign_id: meta.campaign_id || null, mercado: limpar(meta.mercado), idioma: limpar(meta.idioma),
    origem: limpar(meta.origem), direitos: limpar(meta.direitos),
    direitos_validade: meta.direitos_validade || null, etiquetas: meta.etiquetas ?? [],
    estado: 'rascunho', proprietario_id: autor.id, proprietario_nome: autor.nome,
    criado_por: autor.id, criado_por_nome: autor.nome,
  }).select('*').single()
}

// Regista uma ligação Canva (sem ficheiro).
export async function criarLinkCanva(canvaUrl: string, meta: MediaMeta, autor: Autor) {
  return supabase.from('marketing_media_assets').insert({
    nome_interno: meta.nome_interno.trim() || 'Design Canva',
    tipo: 'canva_link', canva_url: canvaUrl.trim(),
    marca: limpar(meta.marca), modelo: limpar(meta.modelo), campaign_id: meta.campaign_id || null,
    mercado: limpar(meta.mercado), idioma: limpar(meta.idioma), etiquetas: meta.etiquetas ?? [],
    estado: 'rascunho', proprietario_id: autor.id, proprietario_nome: autor.nome,
    criado_por: autor.id, criado_por_nome: autor.nome,
  }).select('*').single()
}

// URL assinada (bucket privado) para pré-visualizar/descarregar.
export async function urlAssinadaMedia(caminho: string, segundos = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_MARKETING).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

export async function atualizarEstadoMedia(id: string, estado: MediaAsset['estado']) {
  return supabase.from('marketing_media_assets').update({ estado }).eq('id', id)
}

// Elimina (soft delete) e remove o ficheiro do bucket para não deixar órfãos.
export async function apagarMediaAsset(asset: MediaAsset, autor: Autor) {
  if (asset.caminho) await supabase.storage.from(BUCKET_MARKETING).remove([asset.caminho])
  return supabase.from('marketing_media_assets')
    .update({ deleted_at: new Date().toISOString(), deleted_by: autor.id, deleted_by_nome: autor.nome })
    .eq('id', asset.id)
}

// ═══ CALENDÁRIO ═════════════════════════════════════════════════════════════
export type AgendadaItem = {
  id: string; post_id: string; titulo_post: string; plataforma: Plataforma
  estado: string; data_agendada: string; mercados: string[]
}

export async function listarAgendadas(): Promise<AgendadaItem[]> {
  const { data } = await supabase.from('marketing_post_variants')
    .select('id, post_id, plataforma, estado, data_agendada, marketing_posts(titulo_interno, mercados)')
    .not('data_agendada', 'is', null)
    .order('data_agendada')
    .limit(1000)
  type Row = {
    id: string; post_id: string; plataforma: Plataforma; estado: string; data_agendada: string
    marketing_posts: { titulo_interno: string; mercados: string[] } | null
  }
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id, post_id: r.post_id, plataforma: r.plataforma, estado: r.estado,
    data_agendada: r.data_agendada,
    titulo_post: r.marketing_posts?.titulo_interno ?? '—',
    mercados: r.marketing_posts?.mercados ?? [],
  }))
}

// ═══ DASHBOARD ══════════════════════════════════════════════════════════════
export type ProximaVariante = {
  id: string; post_id: string; plataforma: Plataforma; titulo_post: string
  data_agendada: string
}
export type MarketingDashboard = {
  porEstado: Record<string, number>
  agendadas7: number
  agendadas30: number
  candidatasPagas: number
  campanhasAtivas: number
  proximas: ProximaVariante[]
}

export async function dashboardMarketing(): Promise<MarketingDashboard> {
  const agora = new Date()
  const em7 = new Date(agora.getTime() + 7 * 864e5).toISOString()
  const em30 = new Date(agora.getTime() + 30 * 864e5).toISOString()
  const isoAgora = agora.toISOString()

  const [posts, variantes, propostas, campanhas] = await Promise.all([
    supabase.from('marketing_posts').select('estado_global, estrategia_promocao').is('deleted_at', null).limit(5000),
    supabase.from('marketing_post_variants')
      .select('id, post_id, plataforma, data_agendada, marketing_posts(titulo_interno)')
      .not('data_agendada', 'is', null).gte('data_agendada', isoAgora)
      .order('data_agendada').limit(200),
    supabase.from('marketing_paid_proposals').select('estado').eq('estado', 'proposta'),
    supabase.from('marketing_campaigns').select('id').eq('estado', 'ativa').is('deleted_at', null),
  ])

  const porEstado: Record<string, number> = {}
  for (const p of (posts.data as { estado_global: string }[] ?? [])) {
    porEstado[p.estado_global] = (porEstado[p.estado_global] ?? 0) + 1
  }
  type VRow = { id: string; post_id: string; plataforma: Plataforma; data_agendada: string; marketing_posts: { titulo_interno: string } | null }
  const vs = (variantes.data as unknown as VRow[]) ?? []
  const agendadas7 = vs.filter((v) => v.data_agendada <= em7).length
  const agendadas30 = vs.filter((v) => v.data_agendada <= em30).length
  const proximas: ProximaVariante[] = vs.slice(0, 8).map((v) => ({
    id: v.id, post_id: v.post_id, plataforma: v.plataforma,
    titulo_post: v.marketing_posts?.titulo_interno ?? '—', data_agendada: v.data_agendada,
  }))

  return {
    porEstado,
    agendadas7, agendadas30,
    candidatasPagas: (propostas.data as unknown[])?.length ?? 0,
    campanhasAtivas: (campanhas.data as unknown[])?.length ?? 0,
    proximas,
  }
}
