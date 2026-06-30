import { supabase } from './supabase'
import type { ReparacaoPeca } from '@/types/reparacaoPeca'

export async function listarReparacoes(): Promise<ReparacaoPeca[]> {
  // O Supabase devolve no máximo 1000 linhas por pedido; o histórico tem mais.
  // Vamos buscando páginas de 1000 até esgotar.
  const PAGINA = 1000
  const todos: ReparacaoPeca[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await supabase
      .from('reparacao_pecas')
      .select('*')
      .order('data_entrada', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1)
    const lote = (data as ReparacaoPeca[]) ?? []
    todos.push(...lote)
    if (lote.length < PAGINA) break
  }
  return todos
}

export async function criarReparacao(r: Partial<ReparacaoPeca>) {
  return supabase.from('reparacao_pecas').insert({
    fornecedor: r.fornecedor ?? null,
    peca: r.peca ?? null,
    serial_number: r.serial_number ?? null,
    avaria: r.avaria ?? null,
    garantia: r.garantia ?? null,
    data_saida: r.data_saida ?? null,
    data_entrada: r.data_entrada ?? null,
    status: r.status ?? null,
    pago: r.pago ?? null,
    observacoes: r.observacoes ?? null,
  }).select().single()
}

export async function atualizarReparacao(id: string, r: Partial<ReparacaoPeca>) {
  return supabase.from('reparacao_pecas').update({
    fornecedor: r.fornecedor ?? null,
    peca: r.peca ?? null,
    serial_number: r.serial_number ?? null,
    avaria: r.avaria ?? null,
    garantia: r.garantia ?? null,
    data_saida: r.data_saida ?? null,
    data_entrada: r.data_entrada ?? null,
    status: r.status ?? null,
    pago: r.pago ?? null,
    observacoes: r.observacoes ?? null,
  }).eq('id', id).select().single()
}

export function eliminarReparacao(id: string) {
  return supabase.from('reparacao_pecas').delete().eq('id', id)
}
