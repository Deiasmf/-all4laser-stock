import { supabase } from './supabase'

// Recolhas do Financeiro: dois temas independentes —
//  • Cobranças: acompanhamento de recebimentos de clientes.
//  • Recolha de equipamentos: logística de ir buscar equipamento.
// Ambas protegidas por RLS (só admin+financeiro).

// ─── Cobranças ───────────────────────────────────────────────────────────────

export type EstadoCobranca = 'pendente' | 'contactado' | 'promessa' | 'recolhido' | 'incobravel'

export const ESTADOS_COBRANCA: { valor: EstadoCobranca; label: string; cor: string; bg: string }[] = [
  { valor: 'pendente', label: 'Pendente', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'contactado', label: 'Contactado', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'promessa', label: 'Promessa de pagamento', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'recolhido', label: 'Recolhido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'incobravel', label: 'Incobrável', cor: '#B91C1C', bg: '#FEF2F2' },
]
export function estadoCobrancaInfo(v: string) {
  return ESTADOS_COBRANCA.find((e) => e.valor === v) ?? ESTADOS_COBRANCA[0]
}

export type Cobranca = {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  valor: number | null
  movimento_id: string | null
  estado: EstadoCobranca
  data_promessa: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type CobrancaInput = {
  cliente_id: string | null
  cliente_nome: string | null
  valor: number | null
  estado: EstadoCobranca
  data_promessa: string | null
  notas: string | null
}

export async function listarCobrancas(estado?: EstadoCobranca): Promise<Cobranca[]> {
  let q = supabase.from('financeiro_cobrancas').select('*').order('created_at', { ascending: false })
  if (estado) q = q.eq('estado', estado)
  const { data } = await q
  return (data as Cobranca[]) ?? []
}

export async function criarCobranca(input: CobrancaInput, criadoPor: { id: string | null; nome: string | null }) {
  return supabase.from('financeiro_cobrancas').insert({
    ...input,
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
  }).select().single()
}

export async function atualizarCobranca(id: string, patch: Partial<Cobranca>) {
  return supabase.from('financeiro_cobrancas').update(patch).eq('id', id).select().single()
}

export async function apagarCobranca(id: string) {
  return supabase.from('financeiro_cobrancas').delete().eq('id', id)
}

// ─── Recolha de equipamentos ─────────────────────────────────────────────────

export type EstadoRecolha = 'agendada' | 'em_curso' | 'recolhido' | 'cancelada'

export const ESTADOS_RECOLHA: { valor: EstadoRecolha; label: string; cor: string; bg: string }[] = [
  { valor: 'agendada', label: 'Agendada', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'em_curso', label: 'Em curso', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'recolhido', label: 'Recolhido', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelada', label: 'Cancelada', cor: '#F9FAFB', bg: '#374151' },
]
export function estadoRecolhaInfo(v: string) {
  return ESTADOS_RECOLHA.find((e) => e.valor === v) ?? ESTADOS_RECOLHA[0]
}

export type RecolhaEquip = {
  id: string
  descricao: string | null
  equipamento_ref: string | null
  cliente_id: string | null
  origem_nome: string | null
  morada: string | null
  data_prevista: string | null
  data_recolha: string | null
  estado: EstadoRecolha
  responsavel_nome: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type RecolhaInput = {
  descricao: string | null
  equipamento_ref: string | null
  cliente_id: string | null
  origem_nome: string | null
  morada: string | null
  data_prevista: string | null
  estado: EstadoRecolha
  notas: string | null
}

export async function listarRecolhas(estado?: EstadoRecolha): Promise<RecolhaEquip[]> {
  let q = supabase.from('financeiro_recolhas_equipamento').select('*').order('created_at', { ascending: false })
  if (estado) q = q.eq('estado', estado)
  const { data } = await q
  return (data as RecolhaEquip[]) ?? []
}

export async function criarRecolha(input: RecolhaInput, criadoPor: { id: string | null; nome: string | null }) {
  return supabase.from('financeiro_recolhas_equipamento').insert({
    ...input,
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
  }).select().single()
}

export async function atualizarRecolha(id: string, patch: Partial<RecolhaEquip>) {
  return supabase.from('financeiro_recolhas_equipamento').update(patch).eq('id', id).select().single()
}

export async function apagarRecolha(id: string) {
  return supabase.from('financeiro_recolhas_equipamento').delete().eq('id', id)
}
