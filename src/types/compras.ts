// Tipos do módulo Gestão de Peças e Compras.

export type EstadoPecaFalta = 'em_falta' | 'pedida' | 'recebida'

export type PecaFalta = {
  id: string
  equipamento_id: string | null
  equipamento_sn: string | null
  equipamento_modelo: string | null
  peca_id: string | null
  peca_nome: string | null
  quantidade_necessaria: number
  estado: EstadoPecaFalta
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type EstadoPedido =
  | 'rascunho' | 'enviado' | 'em_cotacao' | 'aprovado'
  | 'encomendado' | 'recebido_parcial' | 'recebido_total' | 'cancelado'

export type PedidoCompra = {
  id: string
  numero: string | null
  estado: EstadoPedido
  urgente: boolean
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type PedidoItem = {
  id: string
  pedido_id: string
  peca_id: string | null
  peca_nome: string | null
  quantidade: number
  quantidade_recebida: number
  notas: string | null
  created_at: string
}

export type Cotacao = {
  id: string
  pedido_id: string
  fornecedor: string | null
  valor_total: number | null
  prazo_entrega_dias: number | null
  notas: string | null
  selecionado: boolean
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
}

export type Fornecedor = {
  id: string
  nome: string
  contacto: string | null
  email: string | null
  notas: string | null
  ativo: boolean
  created_at: string
}

export const ESTADO_PEDIDO_CONFIG: Record<EstadoPedido, { label: string; color: string; bg: string }> = {
  rascunho: { label: 'Rascunho', color: '#6B7280', bg: '#f1f2f4' },
  enviado: { label: 'Enviado', color: '#2563EB', bg: '#e8f0fe' },
  em_cotacao: { label: 'Em cotação', color: '#644de3', bg: '#ECE8FB' },
  aprovado: { label: 'Aprovado', color: '#0891B2', bg: '#e3f5f9' },
  encomendado: { label: 'Encomendado', color: '#D4820A', bg: '#fdf2e3' },
  recebido_parcial: { label: 'Receção parcial', color: '#B45309', bg: '#fdf2e3' },
  recebido_total: { label: 'Recebido', color: '#00A87A', bg: '#e6f7f1' },
  cancelado: { label: 'Cancelado', color: '#6B7280', bg: '#f1f2f4' },
}

export const ESTADO_PEDIDO_OPCOES = Object.keys(ESTADO_PEDIDO_CONFIG) as EstadoPedido[]

// Estados em que um pedido ainda está "em aberto" (peça com encomenda pendente).
export const ESTADOS_PEDIDO_ABERTO: EstadoPedido[] = [
  'rascunho', 'enviado', 'em_cotacao', 'aprovado', 'encomendado', 'recebido_parcial',
]

export const ESTADO_FALTA_CONFIG: Record<EstadoPecaFalta, { label: string; color: string; bg: string }> = {
  em_falta: { label: 'Em falta', color: '#DC2626', bg: '#fdecea' },
  pedida: { label: 'Pedida', color: '#D4820A', bg: '#fdf2e3' },
  recebida: { label: 'Recebida', color: '#00A87A', bg: '#e6f7f1' },
}

export const LOCALIZACOES_PECA = [
  'Armazém',
  'Armazém pequeno',
  'Área logística',
  'Prateleira Candela',
  'Prateleira Cynosure',
  'Prateleira Alma',
  'Outro',
]
