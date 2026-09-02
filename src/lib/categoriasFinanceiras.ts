import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Categorias de documentos financeiros + regras automáticas de categorização.
//
//  • Categorias em 2 níveis: categoria (parent_id null) e subcategoria (parent_id).
//  • Regras: aplicadas na importação (e re-aplicáveis à mão). A 1ª regra ativa que
//    casa (por `ordem`) define a categoria/subcategoria.
//  • Categorização em massa: aplica uma categoria a vários documentos de uma vez.
//
// Acesso protegido por RLS (só admin + financeiro).
// ─────────────────────────────────────────────────────────────────────────────

export type Categoria = {
  id: string
  parent_id: string | null
  nome: string
  cor: string | null
  ordem: number
  ativo: boolean
  created_at: string
}

export type CampoRegra = 'descricao' | 'documento_ref' | 'entidade_nome'
export type OperadorRegra = 'contem' | 'comeca' | 'igual'

export type Regra = {
  id: string
  ordem: number
  ativo: boolean
  campo: CampoRegra
  operador: OperadorRegra
  valor: string
  categoria_id: string | null
  subcategoria_id: string | null
  created_at: string
}

export const LABEL_CAMPO: Record<CampoRegra, string> = {
  descricao: 'Descrição',
  documento_ref: 'Nº do documento',
  entidade_nome: 'Nome da entidade',
}
export const LABEL_OPERADOR: Record<OperadorRegra, string> = {
  contem: 'contém',
  comeca: 'começa por',
  igual: 'é igual a',
}

// ─── Normalização (para o matching das regras) ───────────────────────────────
function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// ─── Categorias: leitura ──────────────────────────────────────────────────────

export async function listarCategorias(): Promise<Categoria[]> {
  const { data } = await supabase
    .from('financeiro_categorias')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  return (data as Categoria[]) ?? []
}

export type ArvoreCategoria = Categoria & { subs: Categoria[] }

// Organiza as categorias em árvore (topo + subcategorias).
export function arvore(cats: Categoria[]): ArvoreCategoria[] {
  const topo = cats.filter((c) => !c.parent_id)
  return topo.map((t) => ({
    ...t,
    subs: cats.filter((s) => s.parent_id === t.id),
  }))
}

// Mapa id → nome (categoria e "Categoria › Subcategoria" para subcategorias).
export function mapaNomes(cats: Categoria[]): Map<string, string> {
  const porId = new Map(cats.map((c) => [c.id, c]))
  const m = new Map<string, string>()
  for (const c of cats) {
    const pai = c.parent_id ? porId.get(c.parent_id) : null
    m.set(c.id, pai ? `${pai.nome} › ${c.nome}` : c.nome)
  }
  return m
}

// Opções "planas" para dropdowns: categorias de topo + subcategorias indentadas.
// O `value` é o id da categoria OU da subcategoria escolhida.
export type OpcaoCategoria = { value: string; label: string; isSub: boolean }

export function opcoesPlanas(cats: Categoria[]): OpcaoCategoria[] {
  const out: OpcaoCategoria[] = []
  for (const t of cats.filter((c) => !c.parent_id && c.ativo).sort((a, b) => a.ordem - b.ordem)) {
    out.push({ value: t.id, label: t.nome, isSub: false })
    for (const s of cats.filter((c) => c.parent_id === t.id && c.ativo)) {
      out.push({ value: s.id, label: `  › ${s.nome}`, isSub: true })
    }
  }
  return out
}

// Converte o value escolhido num dropdown para o par (categoria_id, subcategoria_id).
// Se for uma subcategoria, a categoria fica a ser o pai.
export function resolverSelecao(
  cats: Categoria[],
  value: string
): { categoria_id: string | null; subcategoria_id: string | null } {
  if (!value) return { categoria_id: null, subcategoria_id: null }
  const c = cats.find((x) => x.id === value)
  if (!c) return { categoria_id: null, subcategoria_id: null }
  return c.parent_id
    ? { categoria_id: c.parent_id, subcategoria_id: c.id }
    : { categoria_id: c.id, subcategoria_id: null }
}

// ─── Categorias: escrita ──────────────────────────────────────────────────────

export async function criarCategoria(input: {
  nome: string
  parent_id?: string | null
  cor?: string | null
  ordem?: number
}) {
  return supabase.from('financeiro_categorias').insert({
    nome: input.nome.trim(),
    parent_id: input.parent_id ?? null,
    cor: input.cor ?? null,
    ordem: input.ordem ?? 0,
  }).select().single()
}

export async function atualizarCategoria(id: string, patch: Partial<Pick<Categoria, 'nome' | 'cor' | 'ordem' | 'ativo'>>) {
  const p: Record<string, unknown> = { ...patch }
  if (typeof p.nome === 'string') p.nome = p.nome.trim()
  return supabase.from('financeiro_categorias').update(p).eq('id', id)
}

// Apaga a categoria (as subcategorias caem em cascata; os documentos ficam sem
// categoria por causa do "on delete set null").
export async function apagarCategoria(id: string) {
  return supabase.from('financeiro_categorias').delete().eq('id', id)
}

// ─── Regras: leitura / escrita ────────────────────────────────────────────────

export async function listarRegras(): Promise<Regra[]> {
  const { data } = await supabase
    .from('financeiro_regras_categoria')
    .select('*')
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as Regra[]) ?? []
}

export async function criarRegra(input: {
  campo: CampoRegra
  operador: OperadorRegra
  valor: string
  categoria_id: string | null
  subcategoria_id: string | null
  ordem?: number
}) {
  return supabase.from('financeiro_regras_categoria').insert({
    campo: input.campo,
    operador: input.operador,
    valor: input.valor.trim(),
    categoria_id: input.categoria_id,
    subcategoria_id: input.subcategoria_id,
    ordem: input.ordem ?? 0,
  }).select().single()
}

export async function atualizarRegra(id: string, patch: Partial<Omit<Regra, 'id' | 'created_at'>>) {
  return supabase.from('financeiro_regras_categoria').update(patch).eq('id', id)
}

export async function apagarRegra(id: string) {
  return supabase.from('financeiro_regras_categoria').delete().eq('id', id)
}

// ─── Matching de uma regra a um documento ─────────────────────────────────────

export type DocParaRegra = {
  descricao?: string | null
  documento_ref?: string | null
  entidade_nome?: string | null
}

function casa(regra: Regra, doc: DocParaRegra): boolean {
  const alvo = norm(doc[regra.campo])
  const termo = norm(regra.valor)
  if (!termo) return false
  if (regra.operador === 'igual') return alvo === termo
  if (regra.operador === 'comeca') return alvo.startsWith(termo)
  return alvo.includes(termo)
}

// Aplica a lista de regras (já ordenada) a um documento. Devolve a categoria da
// 1ª regra ativa que casa, ou null se nenhuma casar.
export function aplicarRegras(
  regras: Regra[],
  doc: DocParaRegra
): { categoria_id: string; subcategoria_id: string | null } | null {
  for (const r of regras) {
    if (!r.ativo || !r.categoria_id) continue
    if (casa(r, doc)) return { categoria_id: r.categoria_id, subcategoria_id: r.subcategoria_id }
  }
  return null
}

// ─── Categorização em massa ───────────────────────────────────────────────────

export async function categorizarMovimentos(
  ids: string[],
  categoria_id: string | null,
  subcategoria_id: string | null
): Promise<{ ok: boolean; erro?: string }> {
  if (ids.length === 0) return { ok: true }
  const { error } = await supabase
    .from('financeiro_movimentos')
    .update({ categoria_id, subcategoria_id })
    .in('id', ids)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
