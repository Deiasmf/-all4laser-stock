import { supabase } from './supabase'
import type { Cliente, ClienteInput, HistoricoItem } from '@/types/cliente'

// ─── Fichas de cliente (CRM) ─────────────────────────────────────────────────

export async function listarClientesCompleto(): Promise<Cliente[]> {
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .order('nome')
    .limit(5000)
  return (data as Cliente[]) ?? []
}

export async function obterCliente(id: string) {
  return supabase.from('clientes').select('*').eq('id', id).single()
}

// País é NOT NULL na BD; `nacional` deriva do país.
function normalizar(input: ClienteInput) {
  const pais = (input.pais || '').trim() || 'Portugal'
  return {
    ...input,
    nome: input.nome.trim(),
    pais,
    nacional: pais.toLowerCase() === 'portugal',
    email: input.email?.trim() || null,
    telefone: input.telefone?.trim() || null,
    contacto_nome: input.contacto_nome?.trim() || null,
    nif: input.nif?.trim() || null,
    morada: input.morada?.trim() || null,
    cidade: input.cidade?.trim() || null,
    codigo_postal: input.codigo_postal?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
  }
}

export async function criarClienteFicha(input: ClienteInput) {
  return supabase
    .from('clientes')
    .insert({ ...normalizar(input), atualizado_em: new Date().toISOString() })
    .select()
    .single()
}

export async function atualizarCliente(id: string, input: ClienteInput) {
  return supabase
    .from('clientes')
    .update({ ...normalizar(input), atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

export async function eliminarCliente(id: string) {
  return supabase.from('clientes').delete().eq('id', id)
}

// ─── Histórico do cliente ────────────────────────────────────────────────────
// Alugueres, reservas e notas ligam por cliente_id; contratos só têm o nome.

export async function historicoCliente(cliente: Cliente): Promise<HistoricoItem[]> {
  const id = cliente.id
  const [alug, res, notas, contr] = await Promise.all([
    supabase.from('alugueres').select('id, modelo, valor, data_entrega, data_recolha').eq('cliente_id', id),
    supabase.from('reservas').select('id, data_inicio, data_fim, estado').eq('cliente_id', id),
    supabase.from('notas_encomenda').select('id, numero, equipamento_modelo, estado, data_pedido').eq('cliente_id', id),
    supabase.from('contratos_aluguer').select('id, cliente_nome, created_at').eq('cliente_nome', cliente.nome),
  ])

  const itens: HistoricoItem[] = []

  for (const a of (alug.data ?? []) as Record<string, unknown>[]) {
    const fora = a.data_recolha == null
    itens.push({
      tipo: 'aluguer',
      id: String(a.id),
      titulo: (a.modelo as string) || 'Aluguer',
      detalhe: fora ? 'A decorrer' : 'Recolhido',
      data: (a.data_entrega as string) ?? null,
      href: null,
    })
  }
  for (const r of (res.data ?? []) as Record<string, unknown>[]) {
    itens.push({
      tipo: 'reserva',
      id: String(r.id),
      titulo: 'Reserva',
      detalhe: `${(r.estado as string) ?? '—'} · ${fmt(r.data_inicio)} → ${fmt(r.data_fim)}`,
      data: (r.data_inicio as string) ?? null,
      href: null,
    })
  }
  for (const n of (notas.data ?? []) as Record<string, unknown>[]) {
    itens.push({
      tipo: 'nota',
      id: String(n.id),
      titulo: `${(n.numero as string) ?? 'Nota'} · ${(n.equipamento_modelo as string) ?? ''}`.trim(),
      detalhe: (n.estado as string) ?? '—',
      data: (n.data_pedido as string) ?? null,
      href: `/comercial/notas-encomenda/${n.id}`,
    })
  }
  for (const c of (contr.data ?? []) as Record<string, unknown>[]) {
    itens.push({
      tipo: 'contrato',
      id: String(c.id),
      titulo: 'Contrato de aluguer',
      detalhe: fmt(c.created_at),
      data: (c.created_at as string) ?? null,
      href: null,
    })
  }

  // Mais recentes primeiro (registos sem data ficam no fim).
  itens.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
  return itens
}

function fmt(d: unknown): string {
  if (!d) return '—'
  const dt = new Date(String(d))
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-PT')
}
