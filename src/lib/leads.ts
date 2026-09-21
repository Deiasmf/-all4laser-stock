import { supabase } from './supabase'
import type { EstadoLead, Lead, LeadStatusHistory } from '@/types/lead'

export type ResponsavelLead = { id: string; nome: string; email: string }

// Só a Andreia e o Eduardo podem ser responsáveis de leads (decisão do negócio).
const EMAILS_RESPONSAVEIS = ['andreia.fernandes@all4laser.com', 'eduardo.esteves@all4laser.com']

export async function listarLeads(): Promise<Lead[]> {
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  return (data as Lead[]) ?? []
}

// Criação manual de uma lead pela equipa (canais sem entrada automática:
// email, bimedis, telefone, referência...). Devolve { data, error }.
export async function criarLead(
  campos: Pick<Lead, 'nome' | 'canal'> &
    Partial<Pick<Lead, 'email' | 'telefone' | 'cidade' | 'modelo_interesse' | 'data_inicio' | 'data_fim' | 'mensagem'>>
) {
  return supabase
    .from('leads')
    .insert({ ...campos, estado: 'nova' })
    .select('*')
    .single()
}

// Atualização de campos livres da lead (nota interna, etc.). NÃO muda o estado
// nem o responsável — isso passa pelas RPCs abaixo, que registam histórico e
// tratam da tarefa de follow-up.
export async function atualizarLead(
  id: string,
  campos: Partial<Pick<Lead, 'nota_interna'>>
) {
  return supabase
    .from('leads')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
}

// Muda o estado de uma ou várias leads (individual ou em massa). Regista sempre
// o histórico (quem/quando) e cria/atualiza/conclui a tarefa de follow-up.
// Perdida exige motivo; Contactada/Proposta exigem responsável na lead.
export async function mudarEstadoLeads(ids: string[], estado: EstadoLead, motivo?: string | null) {
  return supabase.rpc('lead_mudar_estado', {
    p_lead_ids: ids,
    p_estado: estado,
    p_motivo: motivo ?? null,
  })
}

// Define/reatribui o responsável de uma lead (a tarefa de follow-up segue-o).
export async function definirResponsavelLead(id: string, responsavelId: string | null) {
  return supabase.rpc('lead_set_responsavel', { p_lead_id: id, p_resp: responsavelId })
}

// Lista os responsáveis possíveis (Andreia e Eduardo).
export async function listarResponsaveisLeads(): Promise<ResponsavelLead[]> {
  const { data } = await supabase.rpc('staff_colaboradores')
  const todos = (data as ResponsavelLead[]) ?? []
  return todos.filter((p) => EMAILS_RESPONSAVEIS.includes((p.email ?? '').toLowerCase()))
}

// Linha temporal de estados de uma lead (mais recente primeiro).
export async function listarHistoricoLead(id: string): Promise<LeadStatusHistory[]> {
  const { data } = await supabase
    .from('lead_status_history')
    .select('id, lead_id, estado_anterior, estado_novo, ator_nome, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
  return (data as LeadStatusHistory[]) ?? []
}

export async function eliminarLead(id: string) {
  return supabase.from('leads').delete().eq('id', id)
}

export const ESTADOS_SEGUINTES: Record<EstadoLead, EstadoLead[]> = {
  nova: ['contactada', 'proposta_enviada', 'convertida', 'perdida'],
  contactada: ['proposta_enviada', 'convertida', 'perdida'],
  proposta_enviada: ['convertida', 'perdida'],
  convertida: [],
  perdida: ['nova'],
}
