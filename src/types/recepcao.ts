// Receção de Encomendas — movimentos centrais de entrada/saída de peças e
// "matches" (agrupamento de movimentos que se relacionam).

export type TipoMovimento = 'entrada' | 'saida'
export type MatchStatus = 'pendente' | 'fechado' | 'parcial'
export type ReferenciaTipo = 'reparacao' | 'envio_pecas' | 'nota_encomenda' | 'manual'
export type ContraparteTipo = 'cliente' | 'fornecedor_reparacao' | 'interno'

export type RecepcaoMovimento = {
  id: string
  tipo: TipoMovimento
  data_movimento: string
  origem_destino: string
  descricao: string
  quantidade: number | null
  serial_numbers: string[] | null
  equipamento_sn: string | null
  equipamento_id: string | null
  referencia_tipo: ReferenciaTipo | null
  referencia_id: string | null
  referencia_numero: string | null
  match_status: MatchStatus | null
  match_referencia_id: string | null
  match_id: string | null
  qr_lido: boolean | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
}

export type RecepcaoMatch = {
  id: string
  numero: string | null
  descricao: string | null
  contraparte: string | null
  contraparte_tipo: ContraparteTipo | null
  estado: MatchStatus | null
  movimentos_saida: number | null
  movimentos_entrada: number | null
  itens_pendentes: number | null
  notas: string | null
  created_at: string
  updated_at: string
}

// ── Aparência dos estados de match ──
export const MATCH_STATUS_INFO: Record<MatchStatus, { label: string; cor: string; fundo: string }> = {
  pendente: { label: 'Pendente', cor: '#8a5a00', fundo: '#fff3cd' },
  parcial: { label: 'Parcial', cor: '#9a4b00', fundo: '#ffe4c4' },
  fechado: { label: 'Fechado', cor: '#14652f', fundo: '#d7f5df' },
}

export function matchStatusInfo(s: string | null) {
  return MATCH_STATUS_INFO[(s as MatchStatus)] ?? MATCH_STATUS_INFO.pendente
}

export const REFERENCIA_TIPO_LABEL: Record<ReferenciaTipo, string> = {
  reparacao: 'Reparação',
  envio_pecas: 'Envio de peças',
  nota_encomenda: 'Nota de encomenda',
  manual: 'Manual',
}
