import { supabase } from './supabase'
import { iniciais } from './ui'
import type { NotaEncomenda, NotaMaterial, NotaInput, MaterialEscolhido } from '@/types/notaEncomenda'

// ─── Notas de encomenda ─────────────────────────────────────────────────────

export async function listarNotas(): Promise<NotaEncomenda[]> {
  const { data } = await supabase
    .from('notas_encomenda')
    .select('*')
    .order('data_pedido', { ascending: false })
    .order('created_at', { ascending: false })
  return (data as NotaEncomenda[]) ?? []
}

export async function obterNota(id: string) {
  return supabase.from('notas_encomenda').select('*').eq('id', id).single()
}

export async function criarNota(
  input: NotaInput,
  criadoPor: string | null,
  criadoPorNome: string | null
) {
  return supabase
    .from('notas_encomenda')
    .insert({ ...input, criado_por: criadoPor, criado_por_nome: criadoPorNome })
    .select()
    .single()
}

export async function atualizarNota(id: string, input: Partial<NotaInput>) {
  return supabase.from('notas_encomenda').update(input).eq('id', id).select().single()
}

export async function alterarEstadoNota(id: string, estado: NotaEncomenda['estado']) {
  return supabase.from('notas_encomenda').update({ estado }).eq('id', id).select().single()
}

export async function eliminarNota(id: string) {
  return supabase.from('notas_encomenda').delete().eq('id', id)
}

// ─── Material da nota ────────────────────────────────────────────────────────

export async function listarMateriais(notaId: string): Promise<NotaMaterial[]> {
  const { data } = await supabase
    .from('notas_encomenda_material')
    .select('*')
    .eq('nota_id', notaId)
    .order('ordem', { ascending: true })
  return (data as NotaMaterial[]) ?? []
}

// Substitui todo o material de uma nota (apaga o existente e insere o novo).
export async function guardarMateriais(notaId: string, itens: MaterialEscolhido[]) {
  await supabase.from('notas_encomenda_material').delete().eq('nota_id', notaId)
  if (itens.length === 0) return { error: null }
  const linhas = itens.map((m, i) => ({
    nota_id: notaId,
    categoria: m.categoria,
    item: m.item,
    ordem: i,
  }))
  return supabase.from('notas_encomenda_material').insert(linhas)
}

// ─── Seletores para o formulário ─────────────────────────────────────────────

export type ClienteOpc = { id: string; nome: string; pais: string | null }

export async function pesquisarClientes(q: string): Promise<ClienteOpc[]> {
  if (q.trim().length < 1) return []
  const { data } = await supabase
    .from('clientes')
    .select('id, nome, pais')
    .ilike('nome', `%${q.trim()}%`)
    .order('nome')
    .limit(8)
  return (data as ClienteOpc[]) ?? []
}

export type EquipStockOpc = {
  id: string
  modelo: string | null
  marca: string | null
  serial_number: string | null
  ano: string | null
}

// Só equipamentos em stock (disponíveis para emitir uma nota de encomenda).
export async function pesquisarEquipamentosStock(q: string): Promise<EquipStockOpc[]> {
  if (q.trim().length < 2) return []
  const termo = q.trim()
  const { data } = await supabase
    .from('equipamentos')
    .select('id, modelo, marca, serial_number, ano')
    .eq('status', 'Em stock')
    .or(`serial_number.ilike.%${termo}%,modelo.ilike.%${termo}%`)
    .order('modelo')
    .limit(8)
  return (data as EquipStockOpc[]) ?? []
}

// ─── Efeitos ao emitir uma nota ──────────────────────────────────────────────

// Equipamento passa a preparação logística (status oficial existente).
export async function marcarEquipamentoEmPreparacao(equipamentoId: string) {
  return supabase
    .from('equipamentos')
    .update({ status: 'Prep-Logística' })
    .eq('id', equipamentoId)
}

// Cria um comunicado para a área técnica e outro para a logística.
export async function notificarNovaNota(nota: NotaEncomenda) {
  const autorNome = nota.criado_por_nome ?? 'Comercial'
  const corpo =
    `Equipamento ${nota.equipamento_modelo ?? '—'} SN ${nota.equipamento_sn ?? '—'} ` +
    `para ${nota.cliente_nome ?? '—'} (${nota.pais_destino ?? '—'}). ` +
    `Detalhes técnicos: ${nota.detalhes_tecnicos?.trim() || '—'}. Preparar para expedição.`
  const base = {
    titulo: `Nova Nota de Encomenda: ${nota.numero ?? ''}`.trim(),
    corpo,
    prioridade: 'importante',
    autor_id: nota.criado_por,
    autor_nome: autorNome,
    autor_iniciais: iniciais(autorNome, null),
  }
  return supabase.from('comunicados').insert([
    { ...base, area: 'tecnico' },
    { ...base, area: 'logistica' },
  ])
}
