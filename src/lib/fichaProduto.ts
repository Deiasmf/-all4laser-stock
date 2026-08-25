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
