import { supabase } from './supabase'
import type {
  Area,
  Gap,
  Processo,
  ProcessoCompleto,
  Step,
  StatusProcesso,
  NivelGap,
} from '@/types/processo'

export type AreaComResumo = Area & {
  totalProcessos: number
  gapsCriticos: number
  gapsMedios: number
  gapsBaixos: number
}

export type GapComArea = Gap & {
  area_nome: string
  area_slug: string
  area_icone: string
  area_cor: string
}

// Conteúdo editável dos sub-itens de um processo
export type SubItens = {
  steps: Step[]
  inputs: string[]
  outputs: string[]
  kpis: string[]
  ferramentas: string[]
}

// ---------- LEITURA ----------

// Áreas + nº de processos + contagem de gaps por nível (calculado no cliente)
export async function listarAreasComResumo(): Promise<AreaComResumo[]> {
  const [{ data: areas }, { data: procs }, { data: gaps }] = await Promise.all([
    supabase.from('areas_processos').select('*').order('ordem'),
    supabase.from('processos').select('id, area_id'),
    supabase.from('area_gaps').select('area_id, nivel, resolvido'),
  ])

  return ((areas as Area[]) ?? []).map((a) => {
    const gapsArea = ((gaps as { area_id: string; nivel: NivelGap; resolvido: boolean }[]) ?? [])
      .filter((g) => g.area_id === a.id && !g.resolvido)
    return {
      ...a,
      totalProcessos: ((procs as { area_id: string }[]) ?? []).filter((p) => p.area_id === a.id).length,
      gapsCriticos: gapsArea.filter((g) => g.nivel === 'critico').length,
      gapsMedios: gapsArea.filter((g) => g.nivel === 'medio').length,
      gapsBaixos: gapsArea.filter((g) => g.nivel === 'baixo').length,
    }
  })
}

// Total de gaps críticos ativos (para o badge da topbar)
export async function contarGapsCriticos(): Promise<number> {
  const { count } = await supabase
    .from('area_gaps')
    .select('id', { count: 'exact', head: true })
    .eq('nivel', 'critico')
    .eq('resolvido', false)
  return count ?? 0
}

export async function obterAreaPorSlug(slug: string): Promise<Area | null> {
  const { data } = await supabase.from('areas_processos').select('*').eq('slug', slug).single()
  return (data as Area) ?? null
}

export async function listarAreas(): Promise<Area[]> {
  const { data } = await supabase.from('areas_processos').select('*').order('ordem')
  return (data as Area[]) ?? []
}

export async function listarProcessosDaArea(areaId: string): Promise<Processo[]> {
  const { data } = await supabase
    .from('processos')
    .select('*')
    .eq('area_id', areaId)
    .order('ordem')
  return (data as Processo[]) ?? []
}

export async function obterProcessoCompleto(id: string): Promise<ProcessoCompleto | null> {
  const { data } = await supabase.from('v_processos_completos').select('*').eq('id', id).single()
  return (data as ProcessoCompleto) ?? null
}

export async function listarGapsAtivos(): Promise<GapComArea[]> {
  const { data } = await supabase
    .from('area_gaps')
    .select('*, areas_processos!inner(nome, slug, icone, cor_accent)')
    .eq('resolvido', false)
    .order('nivel')
  type Row = Gap & { areas_processos: { nome: string; slug: string; icone: string; cor_accent: string } }
  return ((data as Row[]) ?? []).map((g) => ({
    ...g,
    area_nome: g.areas_processos.nome,
    area_slug: g.areas_processos.slug,
    area_icone: g.areas_processos.icone,
    area_cor: g.areas_processos.cor_accent,
  }))
}

export async function listarGapsDaArea(areaId: string): Promise<Gap[]> {
  const { data } = await supabase
    .from('area_gaps')
    .select('*')
    .eq('area_id', areaId)
    .order('ordem')
  return (data as Gap[]) ?? []
}

// ---------- ESCRITA (admin) ----------

export async function criarArea(a: Omit<Area, 'id' | 'created_at'>) {
  return supabase.from('areas_processos').insert(a).select('*').single()
}

export async function criarProcesso(p: Omit<Processo, 'id' | 'created_at' | 'updated_at'>) {
  return supabase.from('processos').insert(p).select('id').single()
}

export async function atualizarProcesso(
  id: string,
  campos: Partial<Pick<Processo, 'nome' | 'descricao' | 'responsavel' | 'status' | 'notas' | 'area_id' | 'ordem'>>
) {
  return supabase.from('processos').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function eliminarProcesso(id: string) {
  return supabase.from('processos').delete().eq('id', id)
}

// Substitui todos os sub-itens de um processo (abordagem simples e robusta)
export async function gravarSubItens(processoId: string, itens: SubItens) {
  await Promise.all([
    supabase.from('processo_steps').delete().eq('processo_id', processoId),
    supabase.from('processo_inputs').delete().eq('processo_id', processoId),
    supabase.from('processo_outputs').delete().eq('processo_id', processoId),
    supabase.from('processo_kpis').delete().eq('processo_id', processoId),
    supabase.from('processo_ferramentas').delete().eq('processo_id', processoId),
  ])

  const limpos = (arr: string[]) => arr.map((t) => t.trim()).filter(Boolean)
  const tarefas: PromiseLike<unknown>[] = []

  const steps = itens.steps.filter((s) => s.acao.trim())
  if (steps.length) {
    tarefas.push(
      supabase.from('processo_steps').insert(
        steps.map((s, i) => ({ processo_id: processoId, ordem: i + 1, acao: s.acao.trim() }))
      )
    )
  }
  const inserirTexto = (tabela: string, arr: string[]) => {
    const vals = limpos(arr)
    if (vals.length) {
      tarefas.push(
        supabase.from(tabela).insert(vals.map((t, i) => ({ processo_id: processoId, texto: t, ordem: i + 1 })))
      )
    }
  }
  inserirTexto('processo_inputs', itens.inputs)
  inserirTexto('processo_outputs', itens.outputs)
  inserirTexto('processo_kpis', itens.kpis)
  inserirTexto('processo_ferramentas', itens.ferramentas)

  return Promise.all(tarefas)
}

export async function marcarGapResolvido(gapId: string, resolvido: boolean) {
  return supabase
    .from('area_gaps')
    .update({ resolvido, resolved_at: resolvido ? new Date().toISOString() : null })
    .eq('id', gapId)
}

export const STATUS_VALIDOS: StatusProcesso[] = ['ativo', 'em-transicao', 'por-criar', 'planeamento', 'parcial']
