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

export type EstadoRecolha =
  | 'a_agendar' | 'agendada' | 'em_transporte' | 'recolhido' | 'inspecionado' | 'concluido' | 'cancelado'

export const ESTADOS_RECOLHA: { valor: EstadoRecolha; label: string; cor: string; bg: string }[] = [
  { valor: 'a_agendar', label: 'A agendar', cor: '#374151', bg: '#E5E7EB' },
  { valor: 'agendada', label: 'Agendada', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'em_transporte', label: 'Em transporte', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'recolhido', label: 'Recolhido', cor: '#0E7490', bg: '#DFF5FA' },
  { valor: 'inspecionado', label: 'Inspecionado', cor: '#4338CA', bg: '#E8E8FD' },
  { valor: 'concluido', label: 'Concluído', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'cancelado', label: 'Cancelado', cor: '#B91C1C', bg: '#FEF2F2' },
]
export function estadoRecolhaInfo(v: string) {
  return ESTADOS_RECOLHA.find((e) => e.valor === v) ?? ESTADOS_RECOLHA[0]
}

// Estados que contam como "recolha em curso" (processo ainda ativo).
export const ESTADOS_RECOLHA_ATIVOS: EstadoRecolha[] = ['a_agendar', 'agendada', 'em_transporte', 'recolhido', 'inspecionado']
// Estados em que a recolha ainda não foi fisicamente feita (podem ficar atrasados).
const ESTADOS_RECOLHA_POR_FAZER: EstadoRecolha[] = ['a_agendar', 'agendada', 'em_transporte']

export type MotivoRecolha = 'fim_aluguer' | 'incumprimento' | 'recompra' | 'assistencia' | 'outro'

export const MOTIVOS_RECOLHA: { valor: MotivoRecolha; label: string }[] = [
  { valor: 'fim_aluguer', label: 'Fim de aluguer' },
  { valor: 'incumprimento', label: 'Incumprimento' },
  { valor: 'recompra', label: 'Recompra' },
  { valor: 'assistencia', label: 'Assistência' },
  { valor: 'outro', label: 'Outro' },
]
export function motivoRecolhaLabel(v: string | null): string {
  return MOTIVOS_RECOLHA.find((m) => m.valor === v)?.label ?? (v ?? '—')
}

export type RecolhaEquip = {
  id: string
  descricao: string | null
  equipamento_id: string | null
  equipamento_ref: string | null
  motivo: MotivoRecolha | null
  cliente_id: string | null
  origem_nome: string | null
  morada: string | null
  data_prevista: string | null
  data_recolha: string | null
  estado: EstadoRecolha
  transportadora: string | null
  responsavel_nome: string | null
  custos: number | null
  condicao_chegada: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

export type RecolhaInput = {
  descricao: string | null
  equipamento_id: string | null
  equipamento_ref: string | null
  motivo: MotivoRecolha | null
  cliente_id: string | null
  origem_nome: string | null
  morada: string | null
  data_prevista: string | null
  estado: EstadoRecolha
  transportadora: string | null
  responsavel_nome: string | null
  custos: number | null
  condicao_chegada: string | null
  notas: string | null
}

export type FiltroRecolhas = { estado?: EstadoRecolha; clienteId?: string; de?: string; ate?: string }

export async function listarRecolhas(f: FiltroRecolhas = {}): Promise<RecolhaEquip[]> {
  let q = supabase.from('financeiro_recolhas_equipamento').select('*').order('created_at', { ascending: false })
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.clienteId) q = q.eq('cliente_id', f.clienteId)
  if (f.de) q = q.gte('data_prevista', f.de)
  if (f.ate) q = q.lte('data_prevista', f.ate)
  const { data } = await q
  return (data as RecolhaEquip[]) ?? []
}

type Autor = { id: string | null; nome: string | null }

export async function criarRecolha(input: RecolhaInput, criadoPor: Autor) {
  const res = await supabase.from('financeiro_recolhas_equipamento').insert({
    ...input,
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
  }).select().single()
  // Primeiro evento da timeline (estado inicial).
  if (res.data) await registarEvento((res.data as RecolhaEquip).id, input.estado, criadoPor, 'Recolha criada')
  return res
}

// Edição de campos (sem mexer no estado/timeline).
export async function atualizarRecolha(id: string, patch: Partial<RecolhaEquip>) {
  return supabase.from('financeiro_recolhas_equipamento').update(patch).eq('id', id).select().single()
}

// Mudança de estado — grava também um evento na timeline. `extra` permite
// atualizar campos ligados à transição (ex.: data_recolha ao ficar "recolhido").
export async function mudarEstadoRecolha(
  id: string,
  estado: EstadoRecolha,
  por: Autor,
  opts: { nota?: string | null; extra?: Partial<RecolhaEquip> } = {}
) {
  const res = await supabase
    .from('financeiro_recolhas_equipamento')
    .update({ estado, ...(opts.extra ?? {}) })
    .eq('id', id).select().single()
  if (!res.error) await registarEvento(id, estado, por, opts.nota ?? null)
  return res
}

export async function apagarRecolha(id: string) {
  return supabase.from('financeiro_recolhas_equipamento').delete().eq('id', id)
}

// ─── Timeline de estados ─────────────────────────────────────────────────────

export type RecolhaEvento = {
  id: string
  recolha_id: string
  estado: EstadoRecolha
  nota: string | null
  por_id: string | null
  por_nome: string | null
  created_at: string
}

async function registarEvento(recolhaId: string, estado: EstadoRecolha, por: Autor, nota: string | null) {
  await supabase.from('financeiro_recolhas_eventos').insert({
    recolha_id: recolhaId, estado, nota: nota?.trim() || null, por_id: por.id, por_nome: por.nome,
  })
}

export async function listarEventosRecolha(recolhaId: string): Promise<RecolhaEvento[]> {
  const { data } = await supabase
    .from('financeiro_recolhas_eventos')
    .select('*').eq('recolha_id', recolhaId).order('created_at', { ascending: true })
  return (data as RecolhaEvento[]) ?? []
}

// ─── Fotos da condição à chegada (bucket privado) ────────────────────────────

export const BUCKET_RECOLHAS = 'recolhas-fotos'

export type RecolhaFoto = { id: string; recolha_id: string; caminho: string; nome: string | null; created_at: string }

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

export async function listarFotosRecolha(recolhaId: string): Promise<RecolhaFoto[]> {
  const { data } = await supabase
    .from('financeiro_recolhas_fotos')
    .select('*').eq('recolha_id', recolhaId).order('created_at', { ascending: true })
  return (data as RecolhaFoto[]) ?? []
}

export async function carregarFotosRecolha(
  recolhaId: string,
  ficheiros: File[],
  criadoPor: string | null,
): Promise<{ carregadas: number; falhas: string[] }> {
  const res = { carregadas: 0, falhas: [] as string[] }
  for (const f of ficheiros) {
    const caminho = `${recolhaId}/${Date.now()}-${nomeSeguro(f.name)}`
    const { error } = await supabase.storage.from(BUCKET_RECOLHAS).upload(caminho, f)
    if (error) { res.falhas.push(f.name); continue }
    const { error: erroBd } = await supabase.from('financeiro_recolhas_fotos').insert({
      recolha_id: recolhaId, caminho, nome: f.name, criado_por: criadoPor,
    })
    if (erroBd) { res.falhas.push(f.name); continue }
    res.carregadas++
  }
  return res
}

export async function urlFotoRecolha(caminho: string, segundos = 120): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_RECOLHAS).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

export async function removerFotoRecolha(id: string, caminho: string) {
  await supabase.storage.from(BUCKET_RECOLHAS).remove([caminho])
  return supabase.from('financeiro_recolhas_fotos').delete().eq('id', id)
}

// ─── Ligação ao inventário ───────────────────────────────────────────────────

export type EquipOpc = { id: string; modelo: string | null; serial_number: string | null; ano: string | null }

export async function pesquisarEquipamentos(q: string): Promise<EquipOpc[]> {
  const termo = q.trim()
  if (termo.length < 2) return []
  const { data } = await supabase
    .from('equipamentos')
    .select('id, modelo, serial_number, ano')
    .or(`serial_number.ilike.%${termo}%,modelo.ilike.%${termo}%`)
    .order('modelo').limit(8)
  return (data as EquipOpc[]) ?? []
}

// Status do inventário oferecidos ao concluir uma recolha (reacondicionamento).
export const STATUS_INVENTARIO_RECOLHA: string[] = ['Prep-Técnico', 'Em stock', 'Peças', 'Prep-Logística', 'Reservado']

// Atualiza o status do equipamento via RPC (o financeiro não é admin e o UPDATE
// direto em equipamentos exige is_admin()).
export async function definirStatusEquipamento(equipamentoId: string, status: string) {
  return supabase.rpc('recolha_definir_status_equipamento', {
    p_equipamento_id: equipamentoId, p_status: status,
  })
}

// ─── Resumo para o dashboard ─────────────────────────────────────────────────

export type ResumoRecolhas = { emCurso: number; atrasadas: number }

export async function resumoRecolhas(): Promise<ResumoRecolhas> {
  const hoje = new Date().toISOString().slice(0, 10)
  const emCursoQ = supabase
    .from('financeiro_recolhas_equipamento')
    .select('id', { count: 'exact', head: true })
    .in('estado', ESTADOS_RECOLHA_ATIVOS)
  const atrasadasQ = supabase
    .from('financeiro_recolhas_equipamento')
    .select('id', { count: 'exact', head: true })
    .in('estado', ESTADOS_RECOLHA_POR_FAZER)
    .lt('data_prevista', hoje)
  const [emCurso, atrasadas] = await Promise.all([emCursoQ, atrasadasQ])
  return { emCurso: emCurso.count ?? 0, atrasadas: atrasadas.count ?? 0 }
}
