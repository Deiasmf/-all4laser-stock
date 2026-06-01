export type Cliente = {
  id: string
  nome: string
  pais: string
  nacional: boolean
  created_at: string
}

export type Aluguer = {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  equipamento_id: string | null
  serial_number: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
  tipo_aluguer: string | null
  valor: number | null
  metodo_pagamento: string | null
  nacional: boolean | null
  data_entrega: string | null
  data_recolha: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

// Opções fixas (CLAUDE.md / pedido da Andreia)
export const TIPOS_ALUGUER = [
  'Diário',
  '3 dias',
  'Semanal',
  'Quinzenal',
  'Mensal',
] as const

export const METODOS_PAGAMENTO = [
  'Numerário',
  'Transferência',
  'MBway',
] as const
