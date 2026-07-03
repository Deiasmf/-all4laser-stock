import { supabase } from './supabase'
import type {
  RececaoPeca, RececaoItem, RececaoInput, RececaoItemInput, RececaoEstado, RefDocTipo,
} from '@/types/rececaoPecas'

// ─── Receções ─────────────────────────────────────────────────────────────────

export async function listarRececoes(estado?: RececaoEstado): Promise<RececaoPeca[]> {
  let q = supabase.from('rececoes_pecas').select('*').order('created_at', { ascending: false })
  if (estado) q = q.eq('estado', estado)
  const { data } = await q
  return (data as RececaoPeca[]) ?? []
}

export async function obterRececao(id: string) {
  return supabase.from('rececoes_pecas').select('*').eq('id', id).single()
}

export async function criarRececao(
  input: RececaoInput,
  itens: RececaoItemInput[],
  criadoPor: string | null,
  criadoPorNome: string | null
) {
  const { data, error } = await supabase
    .from('rececoes_pecas')
    .insert({ ...input, estado: 'aberto', criado_por: criadoPor, criado_por_nome: criadoPorNome })
    .select()
    .single()
  if (error || !data) return { data: null, error }

  const rececao = data as RececaoPeca
  if (itens.length > 0) {
    const linhas = itens.map((i) => ({
      rececao_id: rececao.id,
      peca_id: i.peca_id,
      peca_nome: i.peca_nome,
      serial_number: i.serial_number ?? null,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }))
    const { error: erroItens } = await supabase.from('rececoes_pecas_itens').insert(linhas)
    if (erroItens) return { data: rececao, error: erroItens }
  }
  return { data: rececao, error: null }
}

export async function atualizarRececao(id: string, patch: Partial<RececaoPeca>) {
  return supabase.from('rececoes_pecas').update(patch).eq('id', id).select().single()
}

export async function alterarEstadoRececao(id: string, estado: RececaoEstado) {
  const patch: Partial<RececaoPeca> = { estado }
  if (estado === 'conferido') patch.recebido_em = new Date().toISOString()
  return supabase.from('rececoes_pecas').update(patch).eq('id', id).select().single()
}

export async function eliminarRececao(id: string) {
  await supabase.from('recepcao_movimentos').delete()
    .eq('referencia_tipo', 'rececao').eq('referencia_id', id)
  return supabase.from('rececoes_pecas').delete().eq('id', id)
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export async function listarItensRececao(rececaoId: string): Promise<RececaoItem[]> {
  const { data } = await supabase
    .from('rececoes_pecas_itens')
    .select('*')
    .eq('rececao_id', rececaoId)
    .order('created_at', { ascending: true })
  return (data as RececaoItem[]) ?? []
}

// ─── Ligação a um documento existente (envio EP / reparação RPC) ──────────────

export type RefDocOpc = { id: string; numero: string; label: string; tipo: RefDocTipo }

export async function pesquisarDocumentos(q: string): Promise<RefDocOpc[]> {
  const t = q.trim()
  if (t.length < 2) return []
  const [envios, reparacoes] = await Promise.all([
    supabase.from('envios_pecas').select('id, numero, cliente_nome, fornecedor_nome').ilike('numero', `%${t}%`).limit(6),
    supabase.from('reparacao_pecas').select('id, numero, peca').ilike('numero', `%${t}%`).limit(6),
  ])
  const dosEnvios = ((envios.data as { id: string; numero: string; cliente_nome: string | null; fornecedor_nome: string | null }[]) ?? [])
    .map((e) => ({ id: e.id, numero: e.numero, label: `${e.numero} · Envio${e.fornecedor_nome || e.cliente_nome ? ` · ${e.fornecedor_nome || e.cliente_nome}` : ''}`, tipo: 'envio_pecas' as RefDocTipo }))
  const dasReparacoes = ((reparacoes.data as { id: string; numero: string; peca: string | null }[]) ?? [])
    .map((r) => ({ id: r.id, numero: r.numero, label: `${r.numero} · Reparação${r.peca ? ` · ${r.peca}` : ''}`, tipo: 'reparacao' as RefDocTipo }))
  return [...dosEnvios, ...dasReparacoes]
}
