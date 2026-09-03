import { supabase } from './supabase'

// Memória de catalogação por cliente (Item 3).
// - categoria_defeito / subcategoria_defeito_id vivem na ficha do cliente e
//   pré-categorizam as faturas FUTURAS desse cliente (marca "automática").
// - Ao catalogar uma fatura à mão, propomos aplicar a mesma categoria às
//   restantes faturas sem categoria do mesmo cliente.

// Faturas (movimentos de cliente) ainda sem categoria de um cliente.
// `excluirId` tira a fatura que acabou de ser catalogada.
export async function faturasSemCategoriaCliente(
  clienteId: string,
  excluirId?: string
): Promise<string[]> {
  const { data } = await supabase
    .from('financeiro_movimentos')
    .select('id')
    .eq('cliente_id', clienteId)
    .is('categoria', null)
  let ids = ((data as { id: string }[]) ?? []).map((r) => r.id)
  if (excluirId) ids = ids.filter((i) => i !== excluirId)
  return ids
}

// Grava a categoria-defeito na ficha do cliente (faturas futuras herdam-na).
export async function definirCategoriaDefeitoCliente(
  clienteId: string,
  categoria_defeito: string | null,
  subcategoria_defeito_id: string | null
): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from('clientes')
    .update({ categoria_defeito, subcategoria_defeito_id })
    .eq('id', clienteId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export type CategoriaDefeitoCliente = {
  categoria_defeito: string | null
  subcategoria_defeito_id: string | null
}

// Lê a categoria-defeito de um cliente (para mostrar/editar na ficha).
export async function obterCategoriaDefeitoCliente(clienteId: string): Promise<CategoriaDefeitoCliente> {
  const { data } = await supabase
    .from('clientes')
    .select('categoria_defeito, subcategoria_defeito_id')
    .eq('id', clienteId)
    .single()
  return {
    categoria_defeito: (data as CategoriaDefeitoCliente | null)?.categoria_defeito ?? null,
    subcategoria_defeito_id: (data as CategoriaDefeitoCliente | null)?.subcategoria_defeito_id ?? null,
  }
}
