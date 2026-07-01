// Histórico e processo de reparação de peças.
// Cada registo é um processo de reparação de uma peça (ou conjunto de peças).
export type ReparacaoPeca = {
  id: string
  numero: string | null            // RPC-YYYY-NNNN (gerado por trigger)
  // dono / cliente
  tipo_dono: 'nossa' | 'cliente' | null
  cliente_id: string | null
  cliente_nome: string | null
  // identificação da peça
  fornecedor: string | null        // fornecedor de serviço (quem repara)
  peca: string | null              // descrição da peça
  peca_id: string | null           // ligação ao stock de peças
  serial_number: string | null
  equipamento_sn: string | null    // SN do equipamento a que a peça pertence
  tem_sn: boolean | null
  sn_avariado: string | null
  sn_substituto: string | null
  qr_code: string | null
  avaria: string | null
  // garantia / pagamento
  garantia: string | null          // texto livre (histórico)
  tipo_garantia: TipoGarantia | null
  responsavel_pagamento: ResponsavelPagamento | null
  valor_reparacao: number | null
  faturado_cliente: boolean | null
  pago: string | null              // histórico ("Pago"/"Garantia")
  // peça substituta
  substituta_enviada: boolean | null
  substituta_peca_id: string | null
  substituta_sn: string | null
  cliente_enviou_avariada: boolean | null
  data_cliente_enviou: string | null
  // datas / estado
  data_saida: string | null
  data_entrada: string | null
  status: string | null            // estado do processo (ver ESTADOS_REPARACAO) ou histórico
  // notas
  observacoes: string | null
  notas: string | null
  monday_item_id: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type ReparacaoItem = {
  id: string
  reparacao_id: string
  descricao: string
  peca_id: string | null
  quantidade_saida: number
  quantidade_entrada: number
  estado: 'em_reparacao' | 'reparada' | 'nao_reparavel'
  created_at: string
}

export type ReparacaoMovimento = {
  id: string
  reparacao_id: string
  tipo: 'saida' | 'entrada' | 'substituta_enviada' | 'avariada_recebida'
  data: string
  quantidade: number
  sn: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
}

export type FornecedorReparacao = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  notas: string | null
  ativo: boolean
  created_at: string
}

// ── Estado do processo (usado nos registos novos) ──
export type EstadoReparacao = 'em_reparacao' | 'reparada' | 'nao_reparavel' | 'aguarda_avariada'

export const ESTADOS_REPARACAO: { valor: EstadoReparacao; label: string; cor: string }[] = [
  { valor: 'em_reparacao', label: 'Em reparação', cor: '#D4820A' },   // amarelo/laranja
  { valor: 'reparada', label: 'Reparada', cor: '#16A34A' },           // verde
  { valor: 'nao_reparavel', label: 'Não reparável', cor: '#DC2626' }, // vermelho
  { valor: 'aguarda_avariada', label: 'Aguarda avariada', cor: '#2563EB' }, // azul
]

export function estadoInfo(status: string | null) {
  return ESTADOS_REPARACAO.find((e) => e.valor === status) ?? null
}

// ── Garantia ──
export type TipoGarantia = 'sem_garantia' | 'garantia_nossa' | 'garantia_fabricante' | 'garantia_fornecedor_servico'

export const TIPOS_GARANTIA: { valor: TipoGarantia; label: string }[] = [
  { valor: 'sem_garantia', label: 'Sem garantia' },
  { valor: 'garantia_nossa', label: 'Garantia All4laser' },
  { valor: 'garantia_fabricante', label: 'Garantia Fabricante' },
  { valor: 'garantia_fornecedor_servico', label: 'Garantia Fornecedor Serviço' },
]

// ── Responsável pelo pagamento ──
export type ResponsavelPagamento = 'cliente' | 'all4laser' | 'fabricante' | 'fornecedor_servico'

export const RESPONSAVEIS_PAGAMENTO: { valor: ResponsavelPagamento; label: string }[] = [
  { valor: 'cliente', label: 'Cliente' },
  { valor: 'all4laser', label: 'All4laser' },
  { valor: 'fabricante', label: 'Fabricante' },
  { valor: 'fornecedor_servico', label: 'Fornecedor Serviço' },
]

// Responsável pelo pagamento sugerido a partir do tipo de garantia
export const RESPONSAVEL_POR_GARANTIA: Record<TipoGarantia, ResponsavelPagamento> = {
  sem_garantia: 'cliente',
  garantia_nossa: 'all4laser',
  garantia_fabricante: 'fabricante',
  garantia_fornecedor_servico: 'fornecedor_servico',
}
