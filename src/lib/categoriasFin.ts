import { supabase } from './supabase'
import { semAcentos } from './categorizacaoFinanceira'

// ─────────────────────────────────────────────────────────────────────────────
// Categorização gerível (por cima do #118).
//
//  • Categorias de TOPO na tabela financeiro_categorias — geríveis. A coluna
//    financeiro_movimentos.categoria continua a guardar a CHAVE de topo (é isso
//    que as comissões usam: chave 'servico_tecnico'). As categorias com
//    protegida=true não se apagam.
//  • Subcategorias em financeiro_subcategorias (movimento.subcategoria_id).
//  • Regras automáticas em financeiro_regras_categoria (aplicadas na importação).
//
// Nos dropdowns usa-se um "value" plano: 'cat:<chave>' para uma categoria de topo
// e 'sub:<id>' para uma subcategoria. resolverValor() converte no par
// (categoria_chave, subcategoria_id) que se grava no movimento.
// ─────────────────────────────────────────────────────────────────────────────

export type CategoriaFin = {
  id: string
  chave: string
  label: string
  icon: string | null
  cor: string | null
  bg: string | null
  ordem: number
  ativo: boolean
  protegida: boolean
  created_at: string
}

export type Subcategoria = {
  id: string
  categoria_id: string
  nome: string
  ordem: number
  ativo: boolean
  created_at: string
}

export type CampoRegra = 'descricao' | 'documento_ref' | 'entidade_nome'
export type OperadorRegra = 'contem' | 'comeca' | 'igual'

export type RegraCat = {
  id: string
  ordem: number
  ativo: boolean
  campo: CampoRegra
  operador: OperadorRegra
  valor: string
  categoria_chave: string
  subcategoria_id: string | null
  created_at: string
}

export const LABEL_CAMPO: Record<CampoRegra, string> = {
  descricao: 'Descrição',
  documento_ref: 'Nº do documento',
  entidade_nome: 'Nome da entidade',
}
export const LABEL_OPERADOR: Record<OperadorRegra, string> = {
  contem: 'contém', comeca: 'começa por', igual: 'é igual a',
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function listarCategorias(): Promise<CategoriaFin[]> {
  const { data } = await supabase
    .from('financeiro_categorias')
    .select('*')
    .order('ordem', { ascending: true })
    .order('label', { ascending: true })
  return (data as CategoriaFin[]) ?? []
}

export async function listarSubcategorias(): Promise<Subcategoria[]> {
  const { data } = await supabase
    .from('financeiro_subcategorias')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  return (data as Subcategoria[]) ?? []
}

export async function listarRegras(): Promise<RegraCat[]> {
  const { data } = await supabase
    .from('financeiro_regras_categoria')
    .select('*')
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as RegraCat[]) ?? []
}

// ─── Mapas / opções para dropdowns ────────────────────────────────────────────

export function mapaCategorias(cats: CategoriaFin[]): Map<string, CategoriaFin> {
  return new Map(cats.map((c) => [c.chave, c]))
}
export function mapaSubcategorias(subs: Subcategoria[]): Map<string, Subcategoria> {
  return new Map(subs.map((s) => [s.id, s]))
}

export type OpcaoCat = { value: string; label: string; isSub: boolean }

// Opções "planas": categorias de topo ativas + subcategorias ativas indentadas.
export function opcoesPlanas(cats: CategoriaFin[], subs: Subcategoria[]): OpcaoCat[] {
  const out: OpcaoCat[] = []
  for (const c of cats.filter((x) => x.ativo)) {
    out.push({ value: `cat:${c.chave}`, label: `${c.icon ?? ''} ${c.label}`.trim(), isSub: false })
    for (const s of subs.filter((x) => x.categoria_id === c.id && x.ativo)) {
      out.push({ value: `sub:${s.id}`, label: `   › ${s.nome}`, isSub: true })
    }
  }
  return out
}

// Converte o "value" do dropdown no par a gravar no movimento.
export function resolverValor(
  value: string,
  subs: Subcategoria[],
  cats: CategoriaFin[]
): { categoria_chave: string | null; subcategoria_id: string | null } {
  if (!value) return { categoria_chave: null, subcategoria_id: null }
  if (value.startsWith('cat:')) return { categoria_chave: value.slice(4), subcategoria_id: null }
  if (value.startsWith('sub:')) {
    const id = value.slice(4)
    const sub = subs.find((s) => s.id === id)
    const cat = sub ? cats.find((c) => c.id === sub.categoria_id) : null
    return { categoria_chave: cat?.chave ?? null, subcategoria_id: sub ? id : null }
  }
  return { categoria_chave: null, subcategoria_id: null }
}

// "value" atual de um movimento (para pré-selecionar o dropdown).
export function valorDe(m: { categoria: string | null; subcategoria_id: string | null }): string {
  if (m.subcategoria_id) return `sub:${m.subcategoria_id}`
  if (m.categoria) return `cat:${m.categoria}`
  return ''
}

// Nome legível de um movimento categorizado ("Categoria › Subcategoria").
export function nomeCategoriaDe(
  m: { categoria: string | null; subcategoria_id: string | null },
  catMap: Map<string, CategoriaFin>,
  subMap: Map<string, Subcategoria>
): string {
  const cat = m.categoria ? catMap.get(m.categoria) : null
  const sub = m.subcategoria_id ? subMap.get(m.subcategoria_id) : null
  if (cat && sub) return `${cat.label} › ${sub.nome}`
  if (cat) return cat.label
  return ''
}

// ─── Categorias: escrita ──────────────────────────────────────────────────────

function slug(s: string): string {
  return semAcentos(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'cat'
}

export async function criarCategoria(input: { label: string; icon?: string | null; cor?: string | null; bg?: string | null; ordem?: number }) {
  return supabase.from('financeiro_categorias').insert({
    chave: slug(input.label),
    label: input.label.trim(),
    icon: input.icon ?? '🏷️',
    cor: input.cor ?? '#374151',
    bg: input.bg ?? '#F3F4F6',
    ordem: input.ordem ?? 0,
  }).select().single()
}

export async function atualizarCategoria(id: string, patch: Partial<Pick<CategoriaFin, 'label' | 'icon' | 'cor' | 'bg' | 'ordem' | 'ativo'>>) {
  const p: Record<string, unknown> = { ...patch }
  if (typeof p.label === 'string') p.label = p.label.trim()
  return supabase.from('financeiro_categorias').update(p).eq('id', id)
}

// Só apaga categorias não protegidas (as protegidas alimentam lógica, ex.: comissões).
export async function apagarCategoria(c: CategoriaFin): Promise<{ ok: boolean; erro?: string }> {
  if (c.protegida) return { ok: false, erro: 'Esta categoria está protegida e não pode ser apagada.' }
  const { error } = await supabase.from('financeiro_categorias').delete().eq('id', c.id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// ─── Subcategorias: escrita ───────────────────────────────────────────────────

export async function criarSubcategoria(input: { categoria_id: string; nome: string; ordem?: number }) {
  return supabase.from('financeiro_subcategorias').insert({
    categoria_id: input.categoria_id,
    nome: input.nome.trim(),
    ordem: input.ordem ?? 0,
  }).select().single()
}
export async function atualizarSubcategoria(id: string, patch: Partial<Pick<Subcategoria, 'nome' | 'ordem' | 'ativo'>>) {
  const p: Record<string, unknown> = { ...patch }
  if (typeof p.nome === 'string') p.nome = p.nome.trim()
  return supabase.from('financeiro_subcategorias').update(p).eq('id', id)
}
export async function apagarSubcategoria(id: string) {
  return supabase.from('financeiro_subcategorias').delete().eq('id', id)
}

// ─── Regras: escrita ──────────────────────────────────────────────────────────

export async function criarRegra(input: {
  campo: CampoRegra; operador: OperadorRegra; valor: string
  categoria_chave: string; subcategoria_id: string | null; ordem?: number
}) {
  return supabase.from('financeiro_regras_categoria').insert({
    campo: input.campo, operador: input.operador, valor: input.valor.trim(),
    categoria_chave: input.categoria_chave, subcategoria_id: input.subcategoria_id,
    ordem: input.ordem ?? 0,
  }).select().single()
}
export async function atualizarRegra(id: string, patch: Partial<Omit<RegraCat, 'id' | 'created_at'>>) {
  return supabase.from('financeiro_regras_categoria').update(patch).eq('id', id)
}
export async function apagarRegra(id: string) {
  return supabase.from('financeiro_regras_categoria').delete().eq('id', id)
}

// ─── Matching das regras (para a importação) ──────────────────────────────────

export type DocParaRegra = {
  descricao?: string | null
  documento_ref?: string | null
  entidade_nome?: string | null
}

function casa(regra: RegraCat, doc: DocParaRegra): boolean {
  const alvo = semAcentos(doc[regra.campo] ?? '').trim()
  const termo = semAcentos(regra.valor).trim()
  if (!termo) return false
  if (regra.operador === 'igual') return alvo === termo
  if (regra.operador === 'comeca') return alvo.startsWith(termo)
  return alvo.includes(termo)
}

// 1ª regra ativa (por ordem) que casa → categoria/subcategoria; senão null.
export function aplicarRegras(
  regras: RegraCat[],
  doc: DocParaRegra
): { categoria_chave: string; subcategoria_id: string | null } | null {
  for (const r of regras) {
    if (!r.ativo || !r.categoria_chave) continue
    if (casa(r, doc)) return { categoria_chave: r.categoria_chave, subcategoria_id: r.subcategoria_id }
  }
  return null
}

// ─── Categorização em massa / manual ──────────────────────────────────────────

// Aplica categoria/subcategoria a vários documentos. Fixa categoria_manual para
// a reimportação não sobrepor a escolha da utilizadora.
export async function categorizarMovimentos(
  ids: string[],
  categoria_chave: string | null,
  subcategoria_id: string | null
): Promise<{ ok: boolean; erro?: string }> {
  if (ids.length === 0) return { ok: true }
  // Ação manual = documento revisto: fixa categoria_manual e limpa a marca
  // "automática" (categoria_auto) para sair da lista de "por rever".
  const { error } = await supabase
    .from('financeiro_movimentos')
    .update({ categoria: categoria_chave, subcategoria_id, categoria_manual: categoria_chave !== null, categoria_auto: false })
    .in('id', ids)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
