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
  created_at: string
  updated_at: string
}

export type EnvioItem = {
  id: string
  envio_id: string
  peca_id: string | null
  peca_nome: string | null
  quantidade: number
  preco_unitario: number
  preco_total: number
  created_at: string
}

// Item escolhido no formulário (antes de gravar)
export type EnvioItemInput = {
  peca_id: string | null
  peca_nome: string
  quantidade: number
  preco_unitario: number
}

// Campos editáveis do envio (criação)
export type EnvioInput = {
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
