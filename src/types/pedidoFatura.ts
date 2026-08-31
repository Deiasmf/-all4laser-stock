// Tipos e constantes do módulo Pedidos de Fatura / Pró-forma.

export type PedidoFaturaTipo = 'fatura' | 'pro_forma'

export const TIPOS_PEDIDO: { valor: PedidoFaturaTipo; label: string }[] = [
  { valor: 'fatura', label: 'Fatura' },
  { valor: 'pro_forma', label: 'Fatura pró-forma' },
]

export function tipoPedidoLabel(valor: string | null): string {
  return TIPOS_PEDIDO.find((t) => t.valor === valor)?.label ?? 'Fatura'
}

// Estados do fluxo, por ordem de progressão.
export type PedidoFaturaEstado =
  | 'nao_realizado'
  | 'a_realizar'
  | 'realizado'
  | 'enviado_cliente'

export const ESTADOS_PEDIDO: {
  valor: PedidoFaturaEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'nao_realizado', label: 'Não realizado', cor: '#991B1B', bg: '#FEE2E2' },
  { valor: 'a_realizar', label: 'A realizar', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'realizado', label: 'Realizado', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'enviado_cliente', label: 'Enviado ao cliente', cor: '#065F46', bg: '#D1FAE5' },
]

export function estadoPedidoInfo(valor: string | null) {
  return ESTADOS_PEDIDO.find((e) => e.valor === valor) ?? ESTADOS_PEDIDO[0]
}

export type PedidoFatura = {
  id: string
  numero: string | null
  tipo: PedidoFaturaTipo
  estado: PedidoFaturaEstado
  cliente_id: string | null
  cliente_nome: string
  cliente_email: string | null
  descricao: string
  valor: number | null
  documento_url: string | null
  documento_caminho: string | null
  enviado_em: string | null
  pago: boolean
  data_pagamento: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  created_at: string
  updated_at: string
}

// Campos que o colega preenche ao criar o pedido.
export type PedidoFaturaInput = {
  tipo: PedidoFaturaTipo
  cliente_id: string | null
  cliente_nome: string
  cliente_email: string | null
  descricao: string
  valor: number | null
  notas: string | null
}

export function formatarEuro(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export function formatarData(d: string | null | undefined) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}
