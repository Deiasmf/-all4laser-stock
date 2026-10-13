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
// Fatura (direto):  nao_realizado → a_realizar → realizado → enviado_cliente
// Pró-forma (2 etapas): nao_realizado → a_realizar → realizado (proforma emitida)
//   → aguarda_pagamento → fatura_pedida → fatura_realizada → fechado
// Em qualquer ponto: recusado / cancelado (com motivo).
export type PedidoFaturaEstado =
  | 'nao_realizado'
  | 'a_realizar'
  | 'realizado'
  | 'enviado_cliente'
  | 'aguarda_pagamento'
  | 'fatura_pedida'
  | 'fatura_realizada'
  | 'fechado'
  | 'recusado'
  | 'cancelado'

export const ESTADOS_PEDIDO: {
  valor: PedidoFaturaEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'nao_realizado', label: 'Pedido', cor: '#991B1B', bg: '#FEE2E2' },
  { valor: 'a_realizar', label: 'Em tratamento', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'realizado', label: 'Emitida', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'enviado_cliente', label: 'Enviada ao cliente', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'aguarda_pagamento', label: 'Aguarda pagamento', cor: '#9A3412', bg: '#FFEDD5' },
  { valor: 'fatura_pedida', label: 'Fatura final pedida', cor: '#3730A3', bg: '#E0E7FF' },
  { valor: 'fatura_realizada', label: 'Fatura final emitida', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'fechado', label: 'Fechado', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'recusado', label: 'Recusado', cor: '#6B7280', bg: '#F3F4F6' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#6B7280', bg: '#F3F4F6' },
]

// Estados que são TRABALHO da faturação (Vanessa) — disparam lembretes 48h úteis
// e contam como "abertos" na monitorização. "aguarda_pagamento" NÃO entra aqui
// (não depende dela). Mantém-se ESTADOS_ABERTOS como alias retrocompatível.
export const ESTADOS_TRABALHO: PedidoFaturaEstado[] = ['nao_realizado', 'a_realizar', 'fatura_pedida']
export const ESTADOS_ABERTOS = ESTADOS_TRABALHO

export function estadoPedidoInfo(valor: string | null) {
  return ESTADOS_PEDIDO.find((e) => e.valor === valor) ?? ESTADOS_PEDIDO[0]
}

// Etapa do documento a tratar neste momento: a pró-forma (1ª etapa) ou a fatura
// final (2ª etapa). As faturas diretas são sempre "fatura".
export function etapaDocumento(p: { tipo: PedidoFaturaTipo; estado: PedidoFaturaEstado }): 'proforma' | 'fatura' {
  if (p.tipo !== 'pro_forma') return 'fatura'
  const etapaFatura: PedidoFaturaEstado[] = ['fatura_pedida', 'fatura_realizada', 'fechado']
  return etapaFatura.includes(p.estado) ? 'fatura' : 'proforma'
}

// Pedido concluído (fechado): fatura direta enviada, ou pró-forma com fatura final enviada.
export function pedidoFechado(p: { tipo: PedidoFaturaTipo; estado: PedidoFaturaEstado }): boolean {
  return p.estado === 'fechado' || (p.tipo === 'fatura' && p.estado === 'enviado_cliente')
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
  // Documento FISCAL emitido (fatura direta ou fatura final da pró-forma)
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
  // Pró-forma (1ª etapa) — documento próprio, separado do fiscal
  proforma_url: string | null
  proforma_caminho: string | null
  proforma_num: string | null
  proforma_data: string | null
  proforma_valor: number | null
  proforma_enviada_em: string | null
  // Timestamps por etapa (para a monitorização dos 3 tempos) + nota de ajuste
  pagamento_recebido_em: string | null
  fatura_pedida_em: string | null
  fechado_em: string | null
  fatura_ajuste_nota: string | null
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
  // Lembrete ao criador enquanto a pró-forma aguarda pagamento do cliente.
  aguarda_pagamento_lembrete_ativo: boolean
  aguarda_pagamento_lembrete_dias: number
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
