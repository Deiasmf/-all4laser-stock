import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO ATUAL DOS ALUGUERES
//
// O quadro é DERIVADO do status do equipamento (nunca mantido à mão):
//   • "Aluguer nacional" / "Aluguer internacional" → está em aluguer agora.
// A separação nacional/internacional vem do próprio status.
// A tabela `aluguer_situacao` só ENRIQUECE cada linha (cliente, datas, valor
// mensal, renovação) — é opcional e preenchida aos poucos.
//
// "Disponíveis" = frota de aluguer (equipamentos cujos modelos estão no
// catálogo `modelos_aluguer`) que estão livres (Em stock) ou indisponíveis
// (reacondicionamento). Os que estão em aluguer aparecem nos quadros de cima.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_ALUGUER_NAC = 'Aluguer nacional'
export const STATUS_ALUGUER_INT = 'Aluguer internacional'

// Status "em casa" que contam para os Disponíveis (fora daqui: Enviado, Olicargo,
// Consignação, etc. — equipamento que já saiu/foi vendido).
const STATUS_LIVRE = ['Em stock']
const STATUS_INDISPONIVEL = ['Prep-Técnico', 'Prep-Logística', 'Em reparação', 'Peças', 'Reservado', 'A verificar']

export type SituacaoAluguer = {
  equipamento_id: string
  serial_number: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
  status: string
  nacional: boolean
  destino: string | null
  data_saida: string | null
  // ficha opcional (aluguer_situacao)
  situacao_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  cliente_pais: string | null
  cliente_cidade: string | null
  data_inicio: string | null
  data_fim_prevista: string | null
  renovacao_automatica: boolean
  valor_mensal: number | null
  localizacao: string | null
  notas: string | null
}

export type EquipDisponivel = {
  id: string
  serial_number: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
  status: string
  modelo_aluguer: string | null
}

export type Disponiveis = { livres: EquipDisponivel[]; indisponiveis: EquipDisponivel[] }

export type FichaPatch = {
  cliente_id?: string | null
  data_inicio?: string | null
  data_fim_prevista?: string | null
  renovacao_automatica?: boolean
  valor_mensal?: number | null
  localizacao?: string | null
  notas?: string | null
}
export type Autor = { id: string | null; nome: string | null }

type EquipRow = {
  id: string; serial_number: string | null; marca: string | null; modelo: string | null
  ano: string | null; status: string; destino: string | null; data_saida: string | null
}
type FichaRow = {
  id: string; equipamento_id: string; cliente_id: string | null; data_inicio: string | null
  data_fim_prevista: string | null; renovacao_automatica: boolean; valor_mensal: number | null
  localizacao: string | null; notas: string | null
}
type ClienteRow = { id: string; nome: string | null; pais: string | null; cidade: string | null }

// ── Alugueres ativos (derivados do status) + ficha + cliente ────────────────
export async function carregarSituacaoAlugueres(): Promise<SituacaoAluguer[]> {
  const [rEquip, rFicha] = await Promise.all([
    supabase.from('equipamentos')
      .select('id, serial_number, marca, modelo, ano, status, destino, data_saida')
      .in('status', [STATUS_ALUGUER_NAC, STATUS_ALUGUER_INT]),
    supabase.from('aluguer_situacao').select('*'),
  ])
  const equip = (rEquip.data as EquipRow[]) ?? []
  const fichas = (rFicha.data as FichaRow[]) ?? []
  const fichaPorEquip = new Map(fichas.map((f) => [f.equipamento_id, f]))

  // Clientes referidos pelas fichas (para país/cidade/nome)
  const clienteIds = Array.from(new Set(fichas.map((f) => f.cliente_id).filter(Boolean))) as string[]
  const clientePorId = new Map<string, ClienteRow>()
  if (clienteIds.length) {
    const { data } = await supabase.from('clientes').select('id, nome, pais, cidade').in('id', clienteIds)
    for (const c of (data as ClienteRow[]) ?? []) clientePorId.set(c.id, c)
  }

  return equip.map((e) => {
    const f = fichaPorEquip.get(e.id) ?? null
    const c = f?.cliente_id ? clientePorId.get(f.cliente_id) ?? null : null
    return {
      equipamento_id: e.id,
      serial_number: e.serial_number,
      marca: e.marca,
      modelo: e.modelo,
      ano: e.ano,
      status: e.status,
      nacional: e.status === STATUS_ALUGUER_NAC,
      destino: e.destino,
      data_saida: e.data_saida,
      situacao_id: f?.id ?? null,
      cliente_id: f?.cliente_id ?? null,
      cliente_nome: c?.nome ?? null,
      cliente_pais: c?.pais ?? null,
      cliente_cidade: c?.cidade ?? null,
      data_inicio: f?.data_inicio ?? null,
      data_fim_prevista: f?.data_fim_prevista ?? null,
      renovacao_automatica: f?.renovacao_automatica ?? false,
      valor_mensal: f?.valor_mensal ?? null,
      localizacao: f?.localizacao ?? null,
      notas: f?.notas ?? null,
    }
  })
}

// ── Disponíveis: frota de aluguer livre / indisponível ──────────────────────
function ilikeParaRegex(pat: string): RegExp {
  const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + esc.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
}

export async function carregarDisponiveis(): Promise<Disponiveis> {
  const [rModelos, rEquip] = await Promise.all([
    supabase.from('modelos_aluguer').select('nome, match_ilike').eq('ativo', true),
    supabase.from('equipamentos')
      .select('id, serial_number, marca, modelo, ano, status')
      .in('status', [...STATUS_LIVRE, ...STATUS_INDISPONIVEL]),
  ])
  const modelos = (rModelos.data as { nome: string; match_ilike: string[] | null }[]) ?? []
  const padroes: { nome: string; re: RegExp }[] = []
  for (const m of modelos) for (const p of m.match_ilike ?? []) padroes.push({ nome: m.nome, re: ilikeParaRegex(p) })

  const livres: EquipDisponivel[] = []
  const indisponiveis: EquipDisponivel[] = []
  for (const e of (rEquip.data as (EquipRow & { modelo: string | null })[]) ?? []) {
    const m = e.modelo ? padroes.find((p) => p.re.test((e.modelo ?? '').trim())) : undefined
    if (!m) continue // não pertence à frota de aluguer
    const item: EquipDisponivel = {
      id: e.id, serial_number: e.serial_number, marca: e.marca, modelo: e.modelo,
      ano: e.ano, status: e.status, modelo_aluguer: m.nome,
    }
    if (STATUS_LIVRE.includes(e.status)) livres.push(item)
    else indisponiveis.push(item)
  }
  return { livres, indisponiveis }
}

// ── CRUD da ficha de detalhe (upsert por equipamento) ───────────────────────
export async function guardarFichaSituacao(equipamentoId: string, patch: FichaPatch, autor: Autor) {
  const payload = {
    equipamento_id: equipamentoId, ...patch,
    atualizado_por: autor.id, atualizado_por_nome: autor.nome,
    updated_at: new Date().toISOString(),
  }
  return supabase.from('aluguer_situacao').upsert(payload, { onConflict: 'equipamento_id' }).select().single()
}

export async function apagarFichaSituacao(equipamentoId: string) {
  return supabase.from('aluguer_situacao').delete().eq('equipamento_id', equipamentoId)
}

// ── Helpers de datas ────────────────────────────────────────────────────────
export function inicioEfetivo(s: SituacaoAluguer): string | null {
  return s.data_inicio ?? s.data_saida ?? null
}

// Nº de dias entre uma data (YYYY-MM-DD) e hoje. Positivo = no passado.
export function diasDesde(data: string | null): number | null {
  if (!data) return null
  const d = new Date(data + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
}

// Dias até uma data futura (positivo = faltam N dias; negativo = já passou).
export function diasAte(data: string | null): number | null {
  const d = diasDesde(data)
  return d === null ? null : -d
}

export function duracaoTexto(inicio: string | null): string {
  const dias = diasDesde(inicio)
  if (dias === null) return '—'
  if (dias < 0) return 'ainda não começou'
  if (dias < 31) return `${dias} dia${dias === 1 ? '' : 's'}`
  const meses = Math.floor(dias / 30)
  return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

// Estado de alerta de um aluguer (para destaque visual).
export type AlertaAluguer = 'vencido' | 'a-terminar' | null
export function alertaDe(s: SituacaoAluguer): AlertaAluguer {
  if (s.renovacao_automatica || !s.data_fim_prevista) return null
  const dias = diasAte(s.data_fim_prevista)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'a-terminar'
  return null
}
