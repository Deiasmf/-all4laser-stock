export type Prioridade = 'normal' | 'importante' | 'urgente'
export type EstadoTarefa = 'pendente' | 'em_curso' | 'concluida'

export type Comunicado = {
  id: string
  titulo: string
  corpo: string
  autor_id: string | null
  autor_nome: string
  autor_iniciais: string
  area: string | null
  prioridade: Prioridade
  created_at: string
}

export type Tarefa = {
  id: string
  titulo: string
  descricao: string | null
  area: string
  assignee_id: string | null
  assignee_nome: string | null
  data_limite: string | null
  estado: EstadoTarefa
  prioridade: Prioridade
  created_at: string
}

export type ChatMensagem = {
  id: string
  autor_id: string | null
  autor_nome: string
  autor_iniciais: string
  mensagem: string
  created_at: string
}

// Áreas/departamentos com cor para os badges.
export const AREAS = [
  'Administrativo',
  'Financeiro',
  'Comercial',
  'Marketing',
  'Técnico',
  'Logístico',
  'Clínico',
  'Alugueres',
  'Projetos',
] as const

export type Area = (typeof AREAS)[number]

export const AREA_COR: Record<string, { color: string; bg: string }> = {
  Administrativo: { color: '#3552eb', bg: '#EEF0FF' },
  Financeiro: { color: '#00A87A', bg: '#E6F7F1' },
  Comercial: { color: '#644de3', bg: '#ECE8FB' },
  Marketing: { color: '#be40cf', bg: '#FDEEFF' },
  Técnico: { color: '#D4820A', bg: '#FDF2E3' },
  Logístico: { color: '#0500ff', bg: '#E7E6FF' },
  Clínico: { color: '#9745d7', bg: '#F5EEFF' },
  Alugueres: { color: '#3552eb', bg: '#EEF0FF' },
  Projetos: { color: '#6b7280', bg: '#F1F1F4' },
}

export function corArea(area: string | null | undefined) {
  return (area && AREA_COR[area]) || { color: '#6b7280', bg: '#F1F1F4' }
}
