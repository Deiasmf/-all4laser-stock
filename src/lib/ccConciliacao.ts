// Fase 3: casar um movimento bancário (crédito) com a conta corrente da parceria
// (ex.: Laserix), criando recebimentos no cc_movimentos sem dupla contagem.
// Chama os RPCs cc_conciliar_bank / cc_desconciliar_bank. Acesso has_financeiro_access.

import { supabase } from './supabase'

export type AlocacaoCC = {
  origem_tipo: 'venda' | 'prestacao' | 'reconciliacao'
  origem_id: string | null
  valor: number
  moeda: string
  taxa: number   // unidades por 1 EUR
}

// Casa o movimento bancário com uma conta corrente: cria 1+ cc_movimentos
// 'recebido'. O RPC valida (Σ ≤ valor do banco) e marca o banco como conciliado.
export async function conciliarBankCC(
  bankMovementId: string, contaId: string, alocacoes: AlocacaoCC[], data: string, autorNome: string | null,
) {
  return supabase.rpc('cc_conciliar_bank', {
    p_bank_movement: bankMovementId,
    p_conta_id: contaId,
    p_alocacoes: alocacoes,
    p_data: data,
    p_autor_nome: autorNome,
  })
}

export async function desconciliarBankCC(bankMovementId: string) {
  return supabase.rpc('cc_desconciliar_bank', { p_bank_movement: bankMovementId })
}

export type CCMovimentoDoBanco = {
  id: string; conta_id: string; valor: number; moeda: string; valor_eur: number | null
  data: string; origem_tipo: string | null; origem_id: string | null; conta_nome?: string
}

// Recebimentos de contas correntes criados a partir de um movimento bancário
// (para mostrar na vista "conciliados" e permitir desfazer).
export async function ccMovimentosDoBanco(bankMovementId: string): Promise<CCMovimentoDoBanco[]> {
  const { data } = await supabase
    .from('cc_movimentos')
    .select('id, conta_id, valor, moeda, valor_eur, data, origem_tipo, origem_id, cc_contas(nome)')
    .eq('bank_movement_id', bankMovementId)
  return (data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string, conta_id: m.conta_id as string, valor: m.valor as number,
    moeda: m.moeda as string, valor_eur: (m.valor_eur as number) ?? null, data: m.data as string,
    origem_tipo: (m.origem_tipo as string) ?? null, origem_id: (m.origem_id as string) ?? null,
    conta_nome: (m.cc_contas as { nome?: string } | null)?.nome,
  }))
}
