// Processos de Peças — fluxo Receção/Envio modelado como processos ponta-a-ponta.
// Cada processo agrupa os movimentos de um caso (cortesia+reparação, garantia, etc.).

// ── Tipos de fluxo ──
export type TipoFluxo =
  | 'cortesia_reparacao_externa'
  | 'garantia_substituta_permanente'
  | 'garantia_cliente_envia_primeiro'

export const FLUXOS: { valor: TipoFluxo; label: string; icon: string; descricao: string }[] = [
  {
    valor: 'cortesia_reparacao_externa',
    label: 'Cortesia + Reparação Externa',
    icon: '🔄',
    descricao: 'Enviamos peça de cortesia, reparamos a avariada no fornecedor, faturamos e o cliente devolve a cortesia.',
  },
  {
    valor: 'garantia_substituta_permanente',
    label: 'Garantia — Substituta Permanente',
    icon: '✅',
    descricao: 'Enviamos substituta definitiva; o cliente envia a avariada, que fica no nosso stock.',
  },
  {
    valor: 'garantia_cliente_envia_primeiro',
    label: 'Garantia — Cliente Envia Primeiro',
    icon: '📦',
    descricao: 'O cliente envia a avariada primeiro; depois enviamos a substituta permanente.',
  },
]

export function fluxoInfo(v: string | null) {
  return FLUXOS.find((f) => f.valor === v) ?? FLUXOS[0]
}

// ── Estados ──
export type EstadoProcesso =
  | 'aberto'
  | 'em_curso'
  | 'aguarda_cliente'
  | 'aguarda_reparacao'
  | 'aguarda_pagamento'
  | 'aguarda_devolucao_cortesia'
  | 'fechado'
  | 'cancelado'

export const ESTADOS: { valor: EstadoProcesso; label: string; cor: string; bg: string }[] = [
  { valor: 'aberto', label: 'Aberto', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'em_curso', label: 'Em curso', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'aguarda_cliente', label: 'Aguarda cliente', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'aguarda_reparacao', label: 'Aguarda reparação', cor: '#9A3412', bg: '#FFEDD5' },
  { valor: 'aguarda_pagamento', label: 'Aguarda pagamento', cor: '#991B1B', bg: '#FEE2E2' },
  { valor: 'aguarda_devolucao_cortesia', label: 'Aguarda devolução cortesia', cor: '#6D28D9', bg: '#EDE9FE' },
  { valor: 'fechado', label: 'Fechado', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#F9FAFB', bg: '#374151' },
]

export function estadoInfo(v: string | null) {
  return ESTADOS.find((e) => e.valor === v) ?? ESTADOS[0]
}

// ── Tipos de movimento ──
export type MovimentoTipo =
  | 'enviamos_substituta'
  | 'cliente_enviou_avariada'
  | 'enviamos_para_reparacao'
  | 'recebemos_de_reparacao'
  | 'enviamos_reparada_cliente'
  | 'cliente_devolveu_cortesia'
  | 'entrou_no_stock'
  | 'manual'

export const MOVIMENTOS: Record<MovimentoTipo, { label: string; icon: string; direcao: 'entrada' | 'saida' | 'neutro' }> = {
  enviamos_substituta:       { label: 'Enviámos substituta',        icon: '📤', direcao: 'saida' },
  cliente_enviou_avariada:   { label: 'Cliente enviou avariada',    icon: '📥', direcao: 'entrada' },
  enviamos_para_reparacao:   { label: 'Enviámos para reparação',    icon: '🔧', direcao: 'saida' },
  recebemos_de_reparacao:    { label: 'Recebemos reparada',         icon: '🛠️', direcao: 'entrada' },
  enviamos_reparada_cliente: { label: 'Enviámos reparada ao cliente', icon: '📤', direcao: 'saida' },
  cliente_devolveu_cortesia: { label: 'Cliente devolveu cortesia',  icon: '↩️', direcao: 'entrada' },
  entrou_no_stock:           { label: 'Entrou no stock',            icon: '📦', direcao: 'neutro' },
  manual:                    { label: 'Movimento manual',           icon: '✏️', direcao: 'neutro' },
}

export function movimentoInfo(v: string | null) {
  return MOVIMENTOS[(v as MovimentoTipo)] ?? MOVIMENTOS.manual
}

// ── Garantia ──
export type TipoGarantia = 'sem_garantia' | 'garantia_nossa' | 'garantia_fabricante' | 'garantia_fornecedor_servico'
export const TIPOS_GARANTIA: { valor: TipoGarantia; label: string }[] = [
  { valor: 'sem_garantia', label: 'Sem garantia' },
  { valor: 'garantia_nossa', label: 'Garantia All4laser' },
  { valor: 'garantia_fabricante', label: 'Garantia Fabricante' },
  { valor: 'garantia_fornecedor_servico', label: 'Garantia Fornecedor Serviço' },
]

export type ResponsavelPagamento = 'cliente' | 'all4laser' | 'fabricante' | 'fornecedor_servico'
export const RESPONSAVEIS_PAGAMENTO: { valor: ResponsavelPagamento; label: string }[] = [
  { valor: 'cliente', label: 'Cliente' },
  { valor: 'all4laser', label: 'All4laser' },
  { valor: 'fabricante', label: 'Fabricante' },
  { valor: 'fornecedor_servico', label: 'Fornecedor Serviço' },
]
export const RESPONSAVEL_POR_GARANTIA: Record<TipoGarantia, ResponsavelPagamento> = {
  sem_garantia: 'cliente',
  garantia_nossa: 'all4laser',
  garantia_fabricante: 'fabricante',
  garantia_fornecedor_servico: 'fornecedor_servico',
}

// ── Registos ──
export type ProcessoItemInput = { descricao: string; quantidade: number }

export type ProcessoPeca = {
  id: string
  numero: string | null
  tipo_fluxo: TipoFluxo
  estado: EstadoProcesso
  cliente_id: string | null
  cliente_nome: string
  peca_id: string | null
  peca_descricao: string
  tem_sn: boolean
  sn_avariado: string | null
  sn_substituto: string | null
  equipamento_id: string | null
  equipamento_sn: string | null
  em_garantia: boolean
  tipo_garantia: TipoGarantia | null
  responsavel_pagamento: ResponsavelPagamento | null
  fornecedor_reparacao_id: string | null
  fornecedor_reparacao_nome: string | null
  valor_a_faturar: number | null
  faturado: boolean
  pago: boolean
  data_pagamento: string | null
  substituta_peca_id: string | null
  substituta_descricao: string | null
  substituta_permanente: boolean
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type ProcessoMovimento = {
  id: string
  processo_id: string
  tipo: MovimentoTipo
  data_movimento: string
  quantidade: number
  itens: ProcessoItemInput[] | null
  sn: string | null
  origem: string | null
  destino: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
}

export type ProcessoItem = {
  id: string
  processo_id: string
  descricao: string
  quantidade_total: number
  quantidade_recebida: number
  quantidade_pendente: number
  estado: 'pendente' | 'parcial' | 'completo'
  created_at: string
}

// Campos editáveis do processo (criação)
export type ProcessoInput = {
  tipo_fluxo: TipoFluxo
  cliente_id: string | null
  cliente_nome: string
  peca_id: string | null
  peca_descricao: string
  tem_sn: boolean
  sn_avariado: string | null
  equipamento_id: string | null
  equipamento_sn: string | null
  em_garantia: boolean
  tipo_garantia: TipoGarantia | null
  responsavel_pagamento: ResponsavelPagamento | null
  valor_a_faturar: number | null
  substituta_peca_id: string | null
  substituta_descricao: string | null
  sn_substituto: string | null
  substituta_permanente: boolean
  notas: string | null
}

// Caso 1 = cortesia (volta ao stock); Casos 2/3 = substituta permanente (sai definitivamente).
export function substitutaEhPermanente(f: TipoFluxo): boolean {
  return f !== 'cortesia_reparacao_externa'
}

// ── Máquina de estados: ações disponíveis por (fluxo, estado) ──
export type EfeitoStock = 'cortesia' | 'avariada' | null

export type Accao = {
  id: string
  label: string
  icon: string
  movimento: MovimentoTipo
  estadoDestino: EstadoProcesso
  pedeSn?: boolean
  pedeItens?: boolean
  pedeFornecedor?: boolean
  efeitoStock?: EfeitoStock
  requerPago?: boolean   // só disponível depois de pago (ou em garantia)
  nota?: string
}

export function accoesProcesso(p: Pick<ProcessoPeca, 'tipo_fluxo' | 'estado'>): Accao[] {
  const { tipo_fluxo, estado } = p
  if (estado === 'fechado' || estado === 'cancelado') return []

  if (tipo_fluxo === 'cortesia_reparacao_externa') {
    switch (estado) {
      case 'aberto':
        return [{ id: 'enviar_substituta', label: 'Registar envio de substituta (cortesia)', icon: '📤', movimento: 'enviamos_substituta', estadoDestino: 'aguarda_cliente', pedeSn: true, pedeItens: true }]
      case 'aguarda_cliente':
        return [
          { id: 'receber_avariada', label: 'Registar receção da avariada do cliente', icon: '📥', movimento: 'cliente_enviou_avariada', estadoDestino: 'aguarda_cliente', pedeSn: true, pedeItens: true },
          { id: 'enviar_para_reparacao', label: 'Enviar para fornecedor de reparação', icon: '🔧', movimento: 'enviamos_para_reparacao', estadoDestino: 'aguarda_reparacao', pedeFornecedor: true },
        ]
      case 'aguarda_reparacao':
        return [{ id: 'receber_reparada', label: 'Registar receção da peça reparada', icon: '🛠️', movimento: 'recebemos_de_reparacao', estadoDestino: 'aguarda_pagamento' }]
      case 'aguarda_pagamento':
        return [{ id: 'enviar_ao_cliente', label: 'Registar envio da peça reparada ao cliente', icon: '📤', movimento: 'enviamos_reparada_cliente', estadoDestino: 'aguarda_devolucao_cortesia', requerPago: true }]
      case 'aguarda_devolucao_cortesia':
        return [{ id: 'receber_devolucao_cortesia', label: 'Registar devolução da cortesia pelo cliente', icon: '↩️', movimento: 'cliente_devolveu_cortesia', estadoDestino: 'fechado', efeitoStock: 'cortesia', nota: 'A peça de cortesia volta ao stock.' }]
    }
  }

  if (tipo_fluxo === 'garantia_substituta_permanente') {
    switch (estado) {
      case 'aberto':
        return [{ id: 'enviar_substituta_perm', label: 'Registar envio de substituta permanente', icon: '📤', movimento: 'enviamos_substituta', estadoDestino: 'aguarda_cliente', pedeSn: true, pedeItens: true, nota: 'Esta peça sai do stock definitivamente.' }]
      case 'aguarda_cliente':
        return [{ id: 'receber_avariada_stock', label: 'Registar receção da avariada do cliente', icon: '📥', movimento: 'cliente_enviou_avariada', estadoDestino: 'fechado', pedeSn: true, pedeItens: true, efeitoStock: 'avariada', nota: 'A peça avariada entra no stock a aguardar reparação.' }]
    }
  }

  if (tipo_fluxo === 'garantia_cliente_envia_primeiro') {
    switch (estado) {
      case 'aberto':
        return [{ id: 'receber_avariada_primeiro', label: 'Registar receção da avariada do cliente', icon: '📥', movimento: 'cliente_enviou_avariada', estadoDestino: 'em_curso', pedeSn: true, pedeItens: true }]
      case 'em_curso':
        return [{ id: 'enviar_substituta_perm2', label: 'Registar envio de substituta permanente', icon: '📤', movimento: 'enviamos_substituta', estadoDestino: 'fechado', pedeSn: true, pedeItens: true, efeitoStock: 'avariada', nota: 'A peça avariada entra no stock a aguardar reparação.' }]
    }
  }

  return []
}

export function formatarEuro(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}
