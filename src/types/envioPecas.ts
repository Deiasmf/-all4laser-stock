// Tipos e constantes do módulo Pedidos de Envio de Peças.

export type EnvioEstado =
  | 'aberto'
  | 'a_realizar'
  | 'pronto_a_expedir'
  | 'expedido'
  | 'cancelado'

// Estados com rótulo legível e cores do badge (cor do texto + fundo).
export const ESTADOS_ENVIO: {
  valor: EnvioEstado
  label: string
  cor: string
  bg: string
}[] = [
  { valor: 'aberto', label: 'Aberto', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'a_realizar', label: 'A realizar', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'pronto_a_expedir', label: 'Pronto a expedir', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'expedido', label: 'Expedido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#F9FAFB', bg: '#374151' },
]

export function estadoInfo(valor: string | null) {
  return ESTADOS_ENVIO.find((e) => e.valor === valor) ?? ESTADOS_ENVIO[0]
}

export const TRANSPORTADORAS = ['Nacex', 'UPS', 'FedEx', 'Outro'] as const
export type Transportadora = (typeof TRANSPORTADORAS)[number]

// ── Destinatário: cliente ou fornecedor ──
export type DestinatarioTipo = 'cliente' | 'fornecedor'

// ── Motivo do envio ──
// semCusto: envios sem custo/valor associado (não faturáveis por natureza).
export type MotivoEnvio = 'venda' | 'reparacao' | 'garantia' | 'pecas_falta'

export const MOTIVOS_ENVIO: { valor: MotivoEnvio; label: string; semCusto: boolean }[] = [
  { valor: 'venda', label: 'Venda', semCusto: false },
  { valor: 'reparacao', label: 'Reparação', semCusto: false },
  { valor: 'garantia', label: 'Peças em Garantia', semCusto: true },
  { valor: 'pecas_falta', label: 'Peças em falta', semCusto: true },
]

export function motivoInfo(valor: string | null) {
  return MOTIVOS_ENVIO.find((m) => m.valor === valor) ?? MOTIVOS_ENVIO[0]
}

// Links de tracking/abertura em nova aba por transportadora.
export const TRANSPORTADORA_LINK: Record<string, string> = {
  Nacex: 'https://www.nacex.pt',
  UPS: 'https://www.ups.com',
  FedEx: 'https://www.fedex.com',
}

// Software de faturação (abre numa nova aba ao clicar em "Faturar").
export const KEYINVOICE_URL = 'https://www.keyinvoice.com'

export type EnvioPeca = {
  id: string
  numero: string | null
  estado: EnvioEstado
  destinatario_tipo: DestinatarioTipo | null
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoEnvio | null
  faturavel: boolean
  cliente_id: string | null
  cliente_nome: string | null
  cliente_email: string | null
  morada_envio: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  transportadora: string | null
  transportadora_outro: string | null
  peso_kg: number | null
  comprimento_cm: number | null
  largura_cm: number | null
  altura_cm: number | null
  valor_a_faturar: number | null
  iva_isento: boolean
  iva_taxa: number
  faturado: boolean
  pago: boolean
  data_pagamento: string | null
  fatura_url: string | null
  fatura_caminho: string | null
  carta_porte_url: string | null
  carta_porte_caminho: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  expedido_em: string | null
  reparacao_voltou_em: string | null   // envios de reparação: quando as peças voltaram do fornecedor
  created_at: string
  updated_at: string
}

export type EnvioItem = {
  id: string
  envio_id: string
  peca_id: string | null
  peca_nome: string | null
  serial_number: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  created_at: string
}

// Item escolhido no formulário (antes de gravar)
export type EnvioItemInput = {
  peca_id: string | null
  peca_nome: string
  serial_number: string | null
  quantidade: number
  preco_unitario: number
}

// Campos editáveis do envio (criação)
export type EnvioInput = {
  destinatario_tipo: DestinatarioTipo
  fornecedor_id: string | null
  fornecedor_nome: string | null
  motivo: MotivoEnvio
  faturavel: boolean
  cliente_id: string | null
  cliente_nome: string | null
  cliente_email: string | null
  morada_envio: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  transportadora: string | null
  transportadora_outro: string | null
  peso_kg: number | null
  comprimento_cm: number | null
  largura_cm: number | null
  altura_cm: number | null
  valor_a_faturar: number | null
  iva_isento: boolean
  iva_taxa: number
  notas: string | null
}

// Nome a mostrar da transportadora (resolve "Outro")
export function transportadoraLabel(e: Pick<EnvioPeca, 'transportadora' | 'transportadora_outro'>) {
  if (!e.transportadora) return '—'
  if (e.transportadora === 'Outro') return e.transportadora_outro?.trim() || 'Outro'
  return e.transportadora
}

export function formatarEuro(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Taxas de IVA disponíveis (além de "Isento").
export const TAXAS_IVA = [23, 6] as const

export type IvaBreakdown = { base: number; isento: boolean; taxa: number; iva: number; total: number }

// Calcula o IVA e o total de um envio a partir do valor a faturar.
export function calcularIva(e: Pick<EnvioPeca, 'valor_a_faturar' | 'iva_isento' | 'iva_taxa'>): IvaBreakdown {
  const base = e.valor_a_faturar ?? 0
  const isento = !!e.iva_isento
  const taxa = isento ? 0 : (e.iva_taxa ?? 23)
  const iva = isento ? 0 : (base * taxa) / 100
  return { base, isento, taxa, iva, total: base + iva }
}
