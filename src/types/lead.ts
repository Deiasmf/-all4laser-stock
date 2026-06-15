export type CanalLead = 'website' | 'email' | 'facebook' | 'instagram'
export type EstadoLead = 'nova' | 'contactada' | 'proposta_enviada' | 'convertida' | 'perdida'

export type Lead = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  cidade: string | null
  mensagem: string | null
  canal: CanalLead
  modelo_interesse: string | null
  data_inicio: string | null
  data_fim: string | null
  estado: EstadoLead
  nota_interna: string | null
  created_at: string
  updated_at: string
}

export const CANAL_CONFIG: Record<CanalLead, { label: string; icone: string }> = {
  website: { label: 'Website', icone: '🌐' },
  email: { label: 'Email', icone: '✉️' },
  facebook: { label: 'Facebook', icone: '📘' },
  instagram: { label: 'Instagram', icone: '📸' },
}

export const ESTADO_CONFIG: Record<EstadoLead, { label: string; color: string; bg: string }> = {
  nova: { label: 'Nova', color: '#2D6BC4', bg: '#e9f0fb' },
  contactada: { label: 'Contactada', color: '#D4820A', bg: '#fdf2e3' },
  proposta_enviada: { label: 'Proposta enviada', color: '#7B3FC4', bg: '#f1eafb' },
  convertida: { label: 'Convertida', color: '#00A87A', bg: '#e6f7f1' },
  perdida: { label: 'Perdida', color: '#c0392b', bg: '#fbecea' },
}

export const CANAL_OPCOES = Object.keys(CANAL_CONFIG) as CanalLead[]
export const ESTADO_OPCOES = Object.keys(ESTADO_CONFIG) as EstadoLead[]
