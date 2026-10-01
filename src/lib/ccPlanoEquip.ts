// Equipamentos de um plano de pagamento (ex.: bundle "15 máquinas" da Laserix).
// Lista as máquinas enviadas cobertas pelo plano (com data de envio) e serve de
// base à exclusão nas Consignações/Processos (por nº de série) — sem dupla
// contagem. RLS has_financeiro_access (dados financeiros do plano).

import { supabase } from './supabase'

export type Autor = { id: string | null; nome: string | null }

export type PlanoEquipamento = {
  id: string
  plano_id: string
  equipamento_id: string | null
  numero_serie: string | null
  modelo: string | null
  data_envio: string | null
  notas: string | null
  criado_por_nome: string | null
  created_at: string
}

// Normaliza o nº de série para comparação (maiúsculas, só alfanuméricos).
export function normalizarSerie(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function listarEquipamentosPlano(planoId: string): Promise<PlanoEquipamento[]> {
  const { data } = await supabase
    .from('cc_plano_equipamentos')
    .select('*')
    .eq('plano_id', planoId)
    .order('data_envio', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  return (data ?? []) as PlanoEquipamento[]
}

export type NovoEquipamentoPlano = {
  plano_id: string
  numero_serie?: string | null
  modelo?: string | null
  data_envio?: string | null
}
export async function adicionarEquipamentoPlano(input: NovoEquipamentoPlano, autor: Autor) {
  return supabase.from('cc_plano_equipamentos').insert({
    plano_id: input.plano_id,
    numero_serie: input.numero_serie?.trim() || null,
    modelo: input.modelo?.trim() || null,
    data_envio: input.data_envio || null,
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select().single()
}

export async function atualizarEquipamentoPlano(
  id: string, patch: { numero_serie?: string | null; modelo?: string | null; data_envio?: string | null },
) {
  const p: Record<string, unknown> = {}
  if (patch.numero_serie !== undefined) p.numero_serie = patch.numero_serie?.trim() || null
  if (patch.modelo !== undefined) p.modelo = patch.modelo?.trim() || null
  if (patch.data_envio !== undefined) p.data_envio = patch.data_envio || null
  return supabase.from('cc_plano_equipamentos').update(p).eq('id', id).select().single()
}

export async function removerEquipamentoPlano(id: string) {
  return supabase.from('cc_plano_equipamentos').delete().eq('id', id)
}

// Conjunto dos nºs de série (normalizados) que estão em algum plano desta conta.
// Serve para excluir essas máquinas das Consignações/Processos (evita duplicação).
export async function seriesEmPlanos(contaId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('cc_plano_equipamentos')
    .select('numero_serie, cc_planos_pagamento!inner(conta_id)')
    .eq('cc_planos_pagamento.conta_id', contaId)
  const set = new Set<string>()
  for (const r of (data ?? []) as { numero_serie: string | null }[]) {
    const n = normalizarSerie(r.numero_serie)
    if (n) set.add(n)
  }
  return set
}
