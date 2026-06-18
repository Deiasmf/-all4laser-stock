export type EstadoNota = 'emitida' | 'em_preparacao' | 'expedida' | 'cancelada'

export type CapasOpcao = 'Originais' | 'Pintadas' | 'Sem capas'

export type NotaEncomenda = {
  id: string
  numero: string | null
  data_pedido: string
  cliente_id: string | null
  cliente_nome: string | null
  pais_destino: string | null
  equipamento_id: string | null
  equipamento_modelo: string | null
  equipamento_sn: string | null
  equipamento_ano: string | null
  detalhes_tecnicos: string | null
  capas: CapasOpcao | null
  observacoes: string | null
  estado: EstadoNota
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type NotaMaterial = {
  id: string
  nota_id: string
  categoria: string | null
  item: string | null
  ordem: number
}

// Campos editáveis no formulário (numero/datas/estado-de-fluxo geridos à parte)
export type NotaInput = {
  data_pedido: string
  cliente_id: string | null
  cliente_nome: string | null
  pais_destino: string | null
  equipamento_id: string | null
  equipamento_modelo: string | null
  equipamento_sn: string | null
  equipamento_ano: string | null
  detalhes_tecnicos: string | null
  capas: CapasOpcao | null
  observacoes: string | null
  estado: EstadoNota
}

// Item de material escolhido (para gravar em notas_encomenda_material)
export type MaterialEscolhido = { categoria: string; item: string }

export const CAPAS_OPCOES: CapasOpcao[] = ['Originais', 'Pintadas', 'Sem capas']

export const ESTADO_NOTA_CONFIG: Record<EstadoNota, { label: string; color: string; bg: string }> = {
  emitida: { label: 'Emitida', color: '#2563EB', bg: '#e8f0fe' },
  em_preparacao: { label: 'Em preparação', color: '#D4820A', bg: '#fdf2e3' },
  expedida: { label: 'Expedida', color: '#00A87A', bg: '#e6f7f1' },
  cancelada: { label: 'Cancelada', color: '#6B7280', bg: '#f1f2f4' },
}

export const ESTADO_NOTA_OPCOES = Object.keys(ESTADO_NOTA_CONFIG) as EstadoNota[]
