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
  | 'recusado'

export const ESTADOS_PEDIDO: {
  valor: PedidoFaturaEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'nao_realizado', label: 'Pedido', cor: '#991B1B', bg: '#FEE2E2' },
  { valor: 'a_realizar', label: 'Em tratamento', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'realizado', label: 'Faturada', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'enviado_cliente', label: 'Enviada ao cliente', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'recusado', label: 'Recusado', cor: '#6B7280', bg: '#F3F4F6' },
]

// Estados "abertos" (ainda por responder) — contam para lembretes e monitorização.
export const ESTADOS_ABERTOS: PedidoFaturaEstado[] = ['nao_realizado', 'a_realizar']

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
  // Fatura emitida (Fase 2)
  num_fatura: string | null
  data_fatura: string | null
  valor_total: number | null
  motivo_recusa: string | null
  comprovativo_url: string | null
  comprovativo_caminho: string | null
  enviado_whatsapp_em: string | null
  respondido_em: string | null
  canais_usados: string[]
  financeiro_movimento_id: string | null
  lembrete_ultimo: string | null
  lembretes_count: number
  created_at: string
  updated_at: string
}

// Dados extraídos por IA do PDF da fatura (com confiança por campo).
export type CampoFatura = 'num_fatura' | 'data_fatura' | 'valor_total'
export type FaturaExtraida = {
  num_fatura: string | null
  data_fatura: string | null
  valor_total: number | null
  confianca: Partial<Record<CampoFatura, 'alta' | 'media' | 'baixa'>>
}

// Config única (admin): template do email + lembretes + substituto.
export type PedidoFaturaConfig = {
  assunto_template: string
  corpo_template: string
  lembrete_horas: number
  lembrete_horas_uteis: boolean
  escalona_cc_andreia: boolean
  substituto_id: string | null
  substituto_nome: string | null
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
