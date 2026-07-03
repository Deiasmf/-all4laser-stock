// Tipos e constantes do módulo Receção de Encomenda (espelho do Envio de Encomenda).

export type RececaoEstado = 'aberto' | 'conferido' | 'cancelado'

// Estados com rótulo legível e cores do badge (cor do texto + fundo).
export const ESTADOS_RECECAO: {
  valor: RececaoEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'aberto', label: 'Por conferir', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'conferido', label: 'Conferido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#F9FAFB', bg: '#374151' },
]

export function estadoRececaoInfo(valor: string | null) {
  return ESTADOS_RECECAO.find((e) => e.valor === valor) ?? ESTADOS_RECECAO[0]
}

// ── Origem: de quem recebemos (cliente ou fornecedor) ──
export type OrigemTipo = 'cliente' | 'fornecedor'

// ── Motivo da receção ──
export type MotivoRececao = 'reparacao' | 'garantia' | 'devolucao' | 'compra'

export const MOTIVOS_RECECAO: { valor: MotivoRececao; label: string }[] = [
  { valor: 'reparacao', label: 'Retorno de reparação' },
  { valor: 'garantia', label: 'Garantia' },
  { valor: 'devolucao', label: 'Devolução de cliente' },
  { valor: 'compra', label: 'Compra a fornecedor' },
]

export function motivoRececaoInfo(valor: string | null) {
  return MOTIVOS_RECECAO.find((m) => m.valor === valor) ?? MOTIVOS_RECECAO[0]
}

// Tipo do documento ligado (envio / reparação) — para a correspondência (match).
export type RefDocTipo = 'reparacao' | 'envio_pecas' | 'nota_encomenda' | 'manual'

export type RececaoPeca = {
  id: string
  numero: string | null
  estado: RececaoEstado
  origem_tipo: OrigemTipo | null
  cliente_id: string | null
  cliente_nome: string | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoRececao | null
  equipamento_id: string | null
  equipamento_sn: string | null
  referencia_tipo: RefDocTipo | null
  referencia_id: string | null
  referencia_numero: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  recebido_em: string | null
  created_at: string
  updated_at: string
}

export type RececaoItem = {
  id: string
  rececao_id: string
  peca_id: string | null
  peca_nome: string | null
  serial_number: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  created_at: string
}

// Item escolhido no formulário (antes de gravar)
export type RececaoItemInput = {
  peca_id: string | null
  peca_nome: string
  serial_number: string | null
  quantidade: number
  preco_unitario: number
}

// Campos editáveis da receção (criação)
export type RececaoInput = {
  origem_tipo: OrigemTipo
  cliente_id: string | null
  cliente_nome: string | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoRececao
  equipamento_id: string | null
  equipamento_sn: string | null
  referencia_tipo: RefDocTipo
  referencia_id: string | null
  referencia_numero: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  notas: string | null
}

export function formatarEuro(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}
