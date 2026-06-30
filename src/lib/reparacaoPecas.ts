import { supabase } from './supabase'
import type { ReparacaoPeca } from '@/types/reparacaoPeca'

export async function listarReparacoes(): Promise<ReparacaoPeca[]> {
  const { data } = await supabase
    .from('reparacao_pecas')
    .select('*')
    .order('data_entrada', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data as ReparacaoPeca[]) ?? []
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
