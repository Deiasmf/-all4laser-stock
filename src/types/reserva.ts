export type Modalidade = 'diario' | '2dias' | 'semanal' | 'mensal'
export type EstadoReserva = 'pendente_validacao' | 'confirmada' | 'cancelada' | 'concluida'

export type ModeloAluguer = {
  id: string
  nome: string
  marca: string
  requer_zimmer: boolean
  alugavel: boolean
  frota: number
}

export type Reserva = {
  id: string
  modelo_id: string | null
  modelo_nome: string
  cliente_id: string | null
  cliente_nome: string | null
  modalidade: Modalidade | null
  data_inicio: string
  data_fim: string
  com_zimmer: boolean
  estado: EstadoReserva
  nota: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export const MODALIDADE_CONFIG: Record<Modalidade, { label: string }> = {
  diario: { label: 'Diário' },
  '2dias': { label: '2 dias' },
  semanal: { label: 'Semanal' },
  mensal: { label: 'Mensal' },
}

export const ESTADO_RESERVA_CONFIG: Record<EstadoReserva, { label: string; color: string; bg: string }> = {
  pendente_validacao: { label: 'Pendente', color: '#D4820A', bg: '#fdf2e3' },
  confirmada: { label: 'Confirmada', color: '#00A87A', bg: '#e6f7f1' },
  cancelada: { label: 'Cancelada', color: '#c0392b', bg: '#fbecea' },
  concluida: { label: 'Concluída', color: '#6b7280', bg: '#f1f1f4' },
}

export const MODALIDADE_OPCOES = Object.keys(MODALIDADE_CONFIG) as Modalidade[]

export const ZIMMER_PACK = 'Zimmer Cryo 6'

// Estados de reserva que ocupam frota (impedem nova reserva no mesmo intervalo)
export const ESTADOS_OCUPAM: EstadoReserva[] = ['pendente_validacao', 'confirmada']
