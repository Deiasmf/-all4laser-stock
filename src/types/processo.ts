export type StatusProcesso =
  | 'ativo'
  | 'em-transicao'
  | 'por-criar'
  | 'planeamento'
  | 'parcial'

export type NivelGap = 'critico' | 'medio' | 'baixo'

export type Area = {
  id: string
  slug: string
  nome: string
  icone: string
  cor_accent: string
  ordem: number
  created_at?: string
}

export type Processo = {
  id: string
  area_id: string
  nome: string
  descricao: string
  responsavel: string
  status: StatusProcesso
  notas: string | null
  ordem: number
  created_at?: string
  updated_at?: string
}

export type Step = { ordem: number; acao: string }

export type Gap = {
  id: string
  area_id: string
  nivel: NivelGap
  texto: string
  resolvido: boolean
  resolved_at: string | null
  ordem: number
}

// Forma devolvida pela view v_processos_completos
export type ProcessoCompleto = {
  id: string
  nome: string
  descricao: string
  responsavel: string
  status: StatusProcesso
  notas: string | null
  ordem: number
  area_id: string
  area_slug: string
  area_nome: string
  area_icone: string
  area_cor: string
  steps: Step[]
  inputs: string[]
  outputs: string[]
  kpis: string[]
  ferramentas: string[]
}

export const STATUS_CONFIG: Record<StatusProcesso, { label: string; color: string }> = {
  'ativo': { label: 'Ativo', color: '#00A87A' },
  'em-transicao': { label: 'Em Transição', color: '#D4820A' },
  'por-criar': { label: 'Por Criar', color: '#C0392B' },
  'planeamento': { label: 'Planeamento', color: '#2D6BC4' },
  'parcial': { label: 'Parcial', color: '#7B3FC4' },
}

export const NIVEL_CONFIG: Record<NivelGap, { label: string; color: string; bg: string }> = {
  critico: { label: 'Crítico', color: '#c0392b', bg: '#fbecea' },
  medio: { label: 'Médio', color: '#D4820A', bg: '#fdf2e3' },
  baixo: { label: 'Baixo', color: '#2D6BC4', bg: '#e9f0fb' },
}

export const STATUS_OPCOES = Object.keys(STATUS_CONFIG) as StatusProcesso[]
export const NIVEL_OPCOES = Object.keys(NIVEL_CONFIG) as NivelGap[]
