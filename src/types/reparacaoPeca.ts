// Histórico de reparação de peças (importado do monday.com).
// Cada registo é um evento de reparação de uma peça.
export type ReparacaoPeca = {
  id: string
  fornecedor: string | null      // fornecedor de serviço (quem repara)
  peca: string | null            // descrição da peça
  serial_number: string | null
  avaria: string | null
  garantia: string | null
  data_saida: string | null      // data de saída (YYYY-MM-DD)
  data_entrada: string | null    // data de entrada (YYYY-MM-DD)
  status: string | null
  pago: string | null            // "Pago", "Garantia", ou vazio
  observacoes: string | null
  monday_item_id: string | null
  created_at: string
  updated_at: string
}

// Estados usados ao criar/editar manualmente (o histórico pode ter outros valores).
export const STATUS_REPARACAO = [
  'Em Reparação',
  'Aguarda Envio',
  'Fechado',
  'Não reparado',
  'Não reparar',
  'Devolução',
  'Por recolher',
  'Compra',
  'Compra Novo',
] as const

export const PAGO_REPARACAO = ['Pago', 'Garantia'] as const
