import { supabase } from './supabase'

// Alertas de clientes inativos (não alugam há X dias). Limiares configuráveis.

export type InatividadeSettings = {
  id: number
  dias_atencao: number
  dias_critico: number
  email_resumo_ativo: boolean
  email_destinatarios: string | null
  updated_at: string
}

export type LinhaInatividade = {
  cliente_id: string
  cliente_nome: string
  email: string | null
  telefone: string | null
  contacto_nome: string | null
  ultimo_fim: string
  modelo: string | null
  marca: string | null
  serial_number: string | null
  dias_inatividade: number
  nota: string | null
  silenciado_ate: string | null
  arquivado: boolean
}

export type Nivel = 'critico' | 'atencao' | 'ok'

export const NIVEL_INFO: Record<Exclude<Nivel, 'ok'>, { label: string; cor: string; bg: string }> = {
  critico: { label: 'Crítico', cor: '#B91C1C', bg: '#FEF2F2' },
  atencao: { label: 'Atenção', cor: '#92400E', bg: '#FEF3C7' },
}

const hoje = () => new Date().toISOString().slice(0, 10)

export function silenciado(silenciado_ate: string | null): boolean {
  return !!silenciado_ate && silenciado_ate >= hoje()
}

export function nivelDe(dias: number, s: InatividadeSettings): Nivel {
  if (dias >= s.dias_critico) return 'critico'
  if (dias >= s.dias_atencao) return 'atencao'
  return 'ok'
}

export async function obterSettings(): Promise<InatividadeSettings> {
  const { data } = await supabase.from('client_inactivity_settings').select('*').eq('id', 1).single()
  return (data as InatividadeSettings) ?? { id: 1, dias_atencao: 30, dias_critico: 45, email_resumo_ativo: true, email_destinatarios: null, updated_at: '' }
}

export async function guardarSettings(patch: Partial<InatividadeSettings>) {
  return supabase.from('client_inactivity_settings').update(patch).eq('id', 1).select().single()
}

export async function listarInatividade(): Promise<LinhaInatividade[]> {
  const { data } = await supabase.from('client_rental_inactivity').select('*').order('dias_inatividade', { ascending: false })
  return (data as LinhaInatividade[]) ?? []
}

// Contagens para o dashboard (excluem clientes silenciados).
export type ResumoInatividade = { atencao: number; critico: number }

export async function resumoInatividade(): Promise<ResumoInatividade> {
  const [s, linhas] = await Promise.all([obterSettings(), listarInatividade()])
  const ativas = linhas.filter((l) => !silenciado(l.silenciado_ate))
  return {
    atencao: ativas.filter((l) => l.dias_inatividade >= s.dias_atencao).length,
    critico: ativas.filter((l) => l.dias_inatividade >= s.dias_critico).length,
  }
}

// ─── Follow-up (nota / silenciar / arquivar) ─────────────────────────────────

async function upsertFollowup(cliente_id: string, patch: Record<string, unknown>, user: { id: string | null; nome: string | null }) {
  return supabase.from('client_inactivity_followup').upsert(
    { cliente_id, ...patch, updated_by: user.id, updated_by_nome: user.nome },
    { onConflict: 'cliente_id' }
  )
}

export function guardarNota(cliente_id: string, nota: string, user: { id: string | null; nome: string | null }) {
  return upsertFollowup(cliente_id, { nota: nota.trim() || null }, user)
}

export function silenciarCliente(cliente_id: string, dias: number, user: { id: string | null; nome: string | null }) {
  const ate = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
  return upsertFollowup(cliente_id, { silenciado_ate: ate }, user)
}

export function reativarCliente(cliente_id: string, user: { id: string | null; nome: string | null }) {
  return upsertFollowup(cliente_id, { silenciado_ate: null }, user)
}

export function arquivarCliente(cliente_id: string, user: { id: string | null; nome: string | null }) {
  return upsertFollowup(cliente_id, { arquivado: true }, user)
}

export function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}
