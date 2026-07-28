export type Cliente = {
  id: string
  nome: string
  pais: string
  nacional: boolean
  email: string | null
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
  // Só o mês de recolha física (mês único ou último mês de um contrato de vários
  // meses). Meses intermédios de um contrato ficam false = só faturação.
  recolha_aplicavel: boolean | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
  // Visto de validação da informação do aluguer
  validado: boolean | null
  // Faturação (tabela mensal)
  valor_a_faturar: number | null
  nao_faturar: boolean | null
  fatura_url: string | null
  fatura_caminho: string | null
  fatura_nome: string | null
  fatura_enviada_em: string | null
  fatura_enviada_para: string | null
}

export type ContratoFicheiro = {
  id: string
  contrato_id: string
  url: string | null
  caminho: string | null
  nome: string | null
  created_at: string
}

export type ContratoAluguer = {
  id: string
  nacional: boolean
  titulo: string
  cliente_nome: string | null
  serial_number: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  // Preenchido pelo select com embed (contratos_aluguer_ficheiros)
  ficheiros?: ContratoFicheiro[]
}

export type FaturacaoEquip = {
  id: string
  serial_number: string
  equipamento_id: string | null
  modelo: string | null
  tipo: string | null
  localizacao: string | null
  nacional: boolean | null
  ano: string | null
  valor_mensal: number | null
  total_acumulado: number | null
  estado: string | null
  notas: string | null
}

// Tipos de aluguer NACIONAIS (curto prazo)
export const TIPOS_ALUGUER = [
  'Diário',
  '3 dias',
  'Semanal',
  'Quinzenal',
  'Mensal',
] as const

// Tipos de aluguer INTERNACIONAIS (contratos de longa duração)
export const TIPOS_INTERNACIONAL = [
  '12 meses',
  '24 meses',
] as const

export const METODOS_PAGAMENTO = [
  'Numerário',
  'Transferência',
  'MBway',
] as const
