import { supabase } from './supabase'

// Dados de produto de um equipamento (tabela equipamento_produto, 1:1).
// A RLS deixa a equipa (staff) editar; o núcleo do inventário continua só-admin.

export const CONDICOES = [
  'Recondicionado', 'As it is', 'Usado', 'Usado em bom estado', 'Para Peças', 'Novo',
] as const
export type Condicao = (typeof CONDICOES)[number]

export const DISPONIBILIDADES = [
  { valor: 'disponivel', label: 'Disponível', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'reservado', label: 'Reservado', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'vendido', label: 'Vendido', cor: '#B91C1C', bg: '#FEE2E2' },
] as const
export function disponibilidadeInfo(v: string | null | undefined) {
  return DISPONIBILIDADES.find((d) => d.valor === v) ?? DISPONIBILIDADES[0]
}

export type EquipamentoProduto = {
  equipamento_id: string
  condicao: string | null
  condicao_descricao: string | null
  disponibilidade: string
  voltagem: string | null
  frequencia: string | null
  dimensoes: string | null
  peso_kg: number | null
  software_versao: string | null
  updated_at?: string
}

export async function obterProduto(equipamentoId: string): Promise<EquipamentoProduto | null> {
  const { data } = await supabase.from('equipamento_produto')
    .select('*').eq('equipamento_id', equipamentoId).maybeSingle()
  return (data as EquipamentoProduto) ?? null
}

export async function guardarProduto(equipamentoId: string, patch: Partial<EquipamentoProduto>) {
  return supabase.from('equipamento_produto').upsert(
    { equipamento_id: equipamentoId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'equipamento_id' },
  )
}

// ─── Handpieces (contador de pulsos por peça de mão) ──────────────────────────

export type Handpiece = {
  id: string
  equipamento_id: string
  nome: string
  contador_pulsos: number | null
  data_leitura: string | null
  ordem: number
}

export async function listarHandpieces(equipamentoId: string): Promise<Handpiece[]> {
  const { data } = await supabase.from('equipamento_handpieces')
    .select('*').eq('equipamento_id', equipamentoId)
    .order('ordem', { ascending: true }).order('created_at', { ascending: true })
  return (data as Handpiece[]) ?? []
}
export async function criarHandpiece(equipamentoId: string, patch: Partial<Handpiece>) {
  return supabase.from('equipamento_handpieces').insert({ equipamento_id: equipamentoId, ...patch })
}
export async function atualizarHandpiece(id: string, patch: Partial<Handpiece>) {
  return supabase.from('equipamento_handpieces').update(patch).eq('id', id)
}
export async function apagarHandpiece(id: string) {
  return supabase.from('equipamento_handpieces').delete().eq('id', id)
}

// A leitura do contador é considerada desatualizada se for mais antiga que
// `meses` (nas vendas de usados o contador é dos dados mais sensíveis).
export function leituraDesatualizada(dataLeitura: string | null, meses: number): boolean {
  if (!dataLeitura) return false
  const d = new Date(dataLeitura)
  const limite = new Date()
  limite.setMonth(limite.getMonth() - meses)
  return d < limite
}

// ─── Acessórios (lista estruturada) ───────────────────────────────────────────

export type AcessorioItem = { id: string; equipamento_id: string; descricao: string; ordem: number }

export async function listarAcessorios(equipamentoId: string): Promise<AcessorioItem[]> {
  const { data } = await supabase.from('equipamento_acessorios')
    .select('*').eq('equipamento_id', equipamentoId)
    .order('ordem', { ascending: true }).order('created_at', { ascending: true })
  return (data as AcessorioItem[]) ?? []
}
export async function criarAcessorio(equipamentoId: string, descricao: string, ordem: number) {
  return supabase.from('equipamento_acessorios').insert({ equipamento_id: equipamentoId, descricao, ordem })
}
export async function apagarAcessorio(id: string) {
  return supabase.from('equipamento_acessorios').delete().eq('id', id)
}

// ─── Configuração + completude da ficha ───────────────────────────────────────

export async function obterConfigFicha(): Promise<{ min_fotos: number; meses_leitura_valida: number }> {
  const { data } = await supabase.from('ficha_config')
    .select('min_fotos, meses_leitura_valida').eq('id', true).maybeSingle()
  return { min_fotos: data?.min_fotos ?? 5, meses_leitura_valida: data?.meses_leitura_valida ?? 6 }
}

export type Completude = {
  feitos: number
  total: number
  pct: number
  faltam: string[]
  leituraDesatualizada: boolean
}

// Calcula a % de completude da ficha de produto e o que falta. Critérios:
// condição, descrição do estado, nº mínimo de fotos, ≥1 handpiece com contador
// e data, e ≥1 acessório.
export async function obterCompletude(equipamentoId: string): Promise<Completude> {
  const [produto, fotosR, handpieces, acessR, cfg] = await Promise.all([
    obterProduto(equipamentoId),
    supabase.from('media').select('id', { count: 'exact', head: true })
      .eq('equipamento_id', equipamentoId).or('tipo.is.null,tipo.eq.foto'),
    listarHandpieces(equipamentoId),
    supabase.from('equipamento_acessorios').select('id', { count: 'exact', head: true })
      .eq('equipamento_id', equipamentoId),
    obterConfigFicha(),
  ])
  const nFotos = fotosR.count ?? 0
  const nAcess = acessR.count ?? 0
  const hpComLeitura = handpieces.filter((h) => h.contador_pulsos != null && h.data_leitura)

  const faltam: string[] = []
  if (!produto?.condicao) faltam.push('Condição')
  if (!produto?.condicao_descricao) faltam.push('Descrição do estado')
  if (nFotos < cfg.min_fotos) faltam.push(`Fotos (${nFotos}/${cfg.min_fotos})`)
  if (hpComLeitura.length === 0) faltam.push('Contador de handpiece (com data)')
  if (nAcess === 0) faltam.push('Acessórios')

  const total = 5
  const feitos = total - faltam.length
  const leituraDesat = handpieces.some((h) => h.contador_pulsos != null && leituraDesatualizada(h.data_leitura, cfg.meses_leitura_valida))
  return { feitos, total, pct: Math.round((feitos / total) * 100), faltam, leituraDesatualizada: leituraDesat }
}

// ─── Completude em lote (para a lista de stock) ───────────────────────────────
// Usa a view equipamento_completude (1 linha por equipamento) — eficiente.
export type CompletudeMini = { feitos: number; total: number }

export async function carregarCompletudeMapa(): Promise<Map<string, CompletudeMini>> {
  const mapa = new Map<string, CompletudeMini>()
  let de = 0
  const lote = 1000
  while (true) {
    const { data, error } = await supabase.from('equipamento_completude')
      .select('equipamento_id, feitos, total').range(de, de + lote - 1)
    if (error || !data || data.length === 0) break
    for (const r of data as { equipamento_id: string; feitos: number; total: number }[]) {
      mapa.set(r.equipamento_id, { feitos: r.feitos, total: r.total })
    }
    if (data.length < lote) break
    de += lote
  }
  return mapa
}

// Cor/estado do badge de completude (verde=100%, amarelo=parcial, vermelho=0).
export function completudeCor(feitos: number, total: number) {
  const pct = total ? Math.round((feitos / total) * 100) : 0
  if (pct === 100) return { pct, cor: '#065F46', bg: '#D1FAE5' }
  if (feitos > 0) return { pct, cor: '#92400E', bg: '#FEF3C7' }
  return { pct, cor: '#B91C1C', bg: '#FEE2E2' }
}

// ─── Links partilháveis (página pública /p/[token]) ───────────────────────────

export type FichaLink = {
  id: string
  equipamento_id: string
  token: string
  idioma: string
  incluir_preco: boolean
  incluir_sn_completo: boolean
  expira_em: string
  revogado: boolean
  views: number
  ultima_view: string | null
  criado_em: string
}

export function urlLinkPublico(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/p/${token}`
}

export async function listarLinks(equipamentoId: string): Promise<FichaLink[]> {
  const { data } = await supabase.from('ficha_links')
    .select('*').eq('equipamento_id', equipamentoId).order('criado_em', { ascending: false })
  return (data as FichaLink[]) ?? []
}

export async function criarLink(
  equipamentoId: string,
  opts: { idioma: string; incluir_preco: boolean; incluir_sn_completo: boolean },
  criadoPor: string | null,
) {
  return supabase.from('ficha_links')
    .insert({ equipamento_id: equipamentoId, ...opts, criado_por: criadoPor })
    .select().single()
}

export async function revogarLink(id: string) {
  return supabase.from('ficha_links').update({ revogado: true }).eq('id', id)
}

// ─── Envio por email: histórico + template por defeito ────────────────────────

export type EnvioFichaEquip = {
  criado_em: string
  para_email: string
  para_nome: string | null
  enviado_por_nome: string | null
  idioma: string | null
  views: number | null
}

// Histórico de envios da ficha DESTE equipamento (a que leads/clientes foi enviado).
export async function listarEnviosEquipamento(equipamentoId: string): Promise<EnvioFichaEquip[]> {
  const { data } = await supabase.from('ficha_envio_itens')
    .select('envio:ficha_envios(criado_em, para_email, para_nome, enviado_por_nome, idioma), link:ficha_links(views)')
    .eq('equipamento_id', equipamentoId)
  const rows = (data as unknown as { envio: Omit<EnvioFichaEquip, 'views'> | null; link: { views: number } | null }[]) ?? []
  return rows
    .filter((r) => r.envio)
    .map((r) => ({ ...(r.envio as Omit<EnvioFichaEquip, 'views'>), views: r.link?.views ?? null }))
    .sort((a, b) => (b.criado_em ?? '').localeCompare(a.criado_em ?? ''))
}

// Assunto/corpo por defeito do email (editável no envio), por idioma.
export function emailFichaDefault(idioma: string, nomeEquip: string): { assunto: string; corpo: string } {
  const n = nomeEquip || 'equipamento'
  switch (idioma) {
    case 'en': return { assunto: `All4laser – ${n}`, corpo: `Hello,\n\nPlease find attached the product sheet for the ${n}. We remain at your disposal for any questions or to arrange a viewing.\n\nBest regards,\nAll4laser Sales Team` }
    case 'es': return { assunto: `All4laser – ${n}`, corpo: `Buenas tardes,\n\nAdjuntamos la ficha del equipo ${n}. Quedamos a su disposición para cualquier aclaración o para concertar una visita.\n\nUn cordial saludo,\nEquipo Comercial All4laser` }
    case 'fr': return { assunto: `All4laser – ${n}`, corpo: `Bonjour,\n\nVeuillez trouver ci-joint la fiche de l'équipement ${n}. Nous restons à votre disposition pour toute question ou pour organiser une visite.\n\nCordialement,\nÉquipe Commerciale All4laser` }
    default: return { assunto: `All4laser – ${n}`, corpo: `Boa tarde,\n\nConforme o interesse demonstrado, segue em anexo a ficha do equipamento ${n}. Ficamos ao dispor para qualquer esclarecimento ou para agendar uma visita.\n\nCom os melhores cumprimentos,\nEquipa Comercial All4laser` }
  }
}
export function labelFichaOnline(idioma: string): string {
  return idioma === 'en' ? 'Online sheet' : idioma === 'es' ? 'Ficha online' : idioma === 'fr' ? 'Fiche en ligne' : 'Ficha online'
}

// Histórico de fichas enviadas A ESTA lead (que equipamentos, quando, por quem).
export type EnvioFichaLead = {
  criado_em: string
  enviado_por_nome: string | null
  idioma: string | null
  equipamentos: string[]
}
export async function listarEnviosLead(leadId: string): Promise<EnvioFichaLead[]> {
  const { data } = await supabase.from('ficha_envios')
    .select('criado_em, enviado_por_nome, idioma, itens:ficha_envio_itens(equipamento:equipamentos(marca, modelo))')
    .eq('lead_id', leadId).order('criado_em', { ascending: false })
  const rows = (data as unknown as {
    criado_em: string; enviado_por_nome: string | null; idioma: string | null
    itens: { equipamento: { marca: string | null; modelo: string | null } | null }[] | null
  }[]) ?? []
  return rows.map((r) => ({
    criado_em: r.criado_em,
    enviado_por_nome: r.enviado_por_nome,
    idioma: r.idioma,
    equipamentos: (r.itens ?? [])
      .map((i) => [i.equipamento?.marca, i.equipamento?.modelo].filter(Boolean).join(' '))
      .filter(Boolean),
  }))
}
