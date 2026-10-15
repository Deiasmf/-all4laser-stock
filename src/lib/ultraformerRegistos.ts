import { supabase } from './supabase'
import {
  calcularValorUltraformer, contarDiasMesAntes, tarifarioVigente,
  type ResultadoCalculo,
} from './ultraformerCalculo'

// ─────────────────────────────────────────────────────────────────────────────
// ULTRAFORMER III — registo de pulsos (entrega/recolha) + gravação do cálculo.
// RLS: is_staff() (motoristas/logística). Assinaturas no bucket 'assinaturas';
// fotos no bucket privado 'ultraformer-docs'. Marca a paragem (pulsos_registado)
// para libertar o gate de conclusão da Agenda.
// ─────────────────────────────────────────────────────────────────────────────

export type Cartucho = {
  id: string
  area: 'rosto' | 'corpo'
  profundidade_mm: number
  serial_number: string | null
  ativo: boolean
}

export type LinhaRegisto = {
  id: string
  registo_id: string
  cartucho_id: string | null
  area: 'rosto' | 'corpo'
  profundidade_mm: number | null
  serial_number: string | null
  contador_entrega: number
  contador_recolha: number | null
  pulsos_utilizados: number | null
  override_regressao: boolean
  override_motivo: string | null
  pulsos_corrigido: number | null
  ordem: number | null
}

export type RegistoUltraformer = {
  id: string
  aluguer_id: string | null
  equipamento_id: string | null
  serial_number: string | null
  cliente_id: string | null
  cliente_nome: string | null
  stop_entrega_id: string | null
  stop_recolha_id: string | null
  estado: 'entrega' | 'recolhido' | 'faturado'
  data_entrega: string | null
  responsavel_entrega_nome: string | null
  clinica_resp_entrega: string | null
  clinica_validacao_entrega: boolean
  assinatura_entrega_caminho: string | null
  foto_entrega_caminho: string | null
  obs_entrega: string | null
  data_recolha: string | null
  responsavel_recolha_nome: string | null
  clinica_resp_recolha: string | null
  clinica_validacao_recolha: boolean
  assinatura_recolha_caminho: string | null
  foto_recolha_caminho: string | null
  obs_recolha: string | null
  total_pulsos_rosto: number | null
  total_pulsos_corpo: number | null
  total_pulsos_geral: number | null
  dias_aluguer: number | null
  dias_mes_antes: number | null
  valor_total: number | null
  valor_detalhe: ResultadoCalculo | null
  pedido_fatura_id: string | null
  linhas?: LinhaRegisto[]
}

function nomeSeguro(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

// Cartuchos ativos (rosto antes de corpo, por profundidade).
export async function listarCartuchosAtivos(): Promise<Cartucho[]> {
  const { data } = await supabase
    .from('ultraformer_cartuchos')
    .select('id, area, profundidade_mm, serial_number, ativo')
    .eq('ativo', true)
    .order('area', { ascending: false }) // 'rosto' > 'corpo'
    .order('profundidade_mm', { ascending: true })
  return ((data as Cartucho[]) ?? []).map((c) => ({ ...c, profundidade_mm: Number(c.profundidade_mm) }))
}

// O registo de uma paragem (entrega ou recolha). Para a recolha, se ainda não
// estiver ligado, procura o registo da entrega emparelhada (mesmo evento Google).
export async function registoDaParagem(stop: {
  id: string; tipo: 'entrega' | 'recolha' | 'indefinido'; google_event_id: string | null
}): Promise<RegistoUltraformer | null> {
  const campo = stop.tipo === 'recolha' ? 'stop_recolha_id' : 'stop_entrega_id'
  let { data } = await supabase.from('ultraformer_registos').select('*').eq(campo, stop.id).maybeSingle()

  if (!data && stop.tipo === 'recolha' && stop.google_event_id) {
    const { data: entrega } = await supabase
      .from('transport_stops').select('id')
      .eq('google_event_id', stop.google_event_id).eq('tipo', 'entrega').maybeSingle()
    if (entrega) {
      const r = await supabase.from('ultraformer_registos').select('*')
        .eq('stop_entrega_id', (entrega as { id: string }).id).maybeSingle()
      data = r.data
    }
  }
  if (!data) return null
  const reg = data as RegistoUltraformer
  const { data: linhas } = await supabase
    .from('ultraformer_registo_linhas').select('*').eq('registo_id', reg.id).order('ordem', { nullsFirst: false })
  return { ...reg, linhas: (linhas as LinhaRegisto[]) ?? [] }
}

export async function uploadFotoUltraformer(stopId: string, file: File): Promise<string | null> {
  const caminho = `${stopId}/${Date.now()}-${nomeSeguro(file.name)}`
  const { error } = await supabase.storage.from('ultraformer-docs').upload(caminho, file, { upsert: false })
  return error ? null : caminho
}

export async function uploadAssinaturaUltraformer(stopId: string, blob: Blob): Promise<string | null> {
  const caminho = `ultraformer/${stopId}/${Date.now()}.png`
  const { error } = await supabase.storage.from('assinaturas').upload(caminho, blob, { contentType: 'image/png', upsert: false })
  return error ? null : caminho
}

// URL assinada para pré-visualizar uma foto/PDF do bucket privado.
export async function urlAssinada(caminho: string, segundos = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from('ultraformer-docs').createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

// ─── Entrega ─────────────────────────────────────────────────────────────────
export type EntregaLinhaInput = {
  cartucho_id: string
  area: 'rosto' | 'corpo'
  profundidade_mm: number | null
  serial_number: string | null
  contador_entrega: number
}
export type EntregaInput = {
  stop: { id: string; cliente_id: string | null; cliente_nome: string | null; equipamento_id: string | null; serial_number: string | null }
  responsavelId: string | null
  responsavelNome: string | null
  linhas: EntregaLinhaInput[]
  clinicaResp: string | null
  clinicaValidacao: boolean
  assinaturaCaminho: string | null
  fotoCaminho: string | null
  obs: string | null
}

export async function gravarEntrega(input: EntregaInput): Promise<{ ok: boolean; registoId?: string; erro?: string }> {
  const { data: existing } = await supabase
    .from('ultraformer_registos').select('id').eq('stop_entrega_id', input.stop.id).maybeSingle()

  const payload = {
    equipamento_id: input.stop.equipamento_id,
    serial_number: input.stop.serial_number,
    cliente_id: input.stop.cliente_id,
    cliente_nome: input.stop.cliente_nome,
    stop_entrega_id: input.stop.id,
    estado: 'entrega' as const,
    data_entrega: new Date().toISOString(),
    responsavel_entrega_id: input.responsavelId,
    responsavel_entrega_nome: input.responsavelNome,
    clinica_resp_entrega: input.clinicaResp,
    clinica_validacao_entrega: input.clinicaValidacao,
    assinatura_entrega_caminho: input.assinaturaCaminho,
    foto_entrega_caminho: input.fotoCaminho,
    obs_entrega: input.obs,
    criado_por: input.responsavelId,
  }

  let registoId: string
  if (existing) {
    registoId = (existing as { id: string }).id
    const { error } = await supabase.from('ultraformer_registos').update(payload).eq('id', registoId)
    if (error) return { ok: false, erro: error.message }
    await supabase.from('ultraformer_registo_linhas').delete().eq('registo_id', registoId)
  } else {
    const { data, error } = await supabase.from('ultraformer_registos').insert(payload).select('id').single()
    if (error || !data) return { ok: false, erro: error?.message ?? 'Falha ao criar o registo.' }
    registoId = (data as { id: string }).id
  }

  const linhasRows = input.linhas.map((l, i) => ({
    registo_id: registoId, cartucho_id: l.cartucho_id, area: l.area,
    profundidade_mm: l.profundidade_mm, serial_number: l.serial_number,
    contador_entrega: l.contador_entrega, ordem: i + 1,
  }))
  if (linhasRows.length) {
    const { error } = await supabase.from('ultraformer_registo_linhas').insert(linhasRows)
    if (error) return { ok: false, erro: error.message }
  }

  await supabase.from('transport_stops').update({ pulsos_registado: true }).eq('id', input.stop.id)
  return { ok: true, registoId }
}

// ─── Recolha ─────────────────────────────────────────────────────────────────
export type RecolhaLinhaInput = {
  linha_id: string
  contador_recolha: number
  override_regressao: boolean
  override_motivo: string | null
  pulsos_corrigido: number | null
}
export type RecolhaInput = {
  registoId: string
  stopRecolhaId: string
  responsavelId: string | null
  responsavelNome: string | null
  linhas: RecolhaLinhaInput[]
  diasAluguer: number
  clinicaResp: string | null
  clinicaValidacao: boolean
  assinaturaCaminho: string | null
  fotoCaminho: string | null
  obs: string | null
}

export async function gravarRecolha(input: RecolhaInput): Promise<{ ok: boolean; resultado?: ResultadoCalculo; erro?: string }> {
  for (const l of input.linhas) {
    const { error } = await supabase.from('ultraformer_registo_linhas').update({
      contador_recolha: l.contador_recolha,
      override_regressao: l.override_regressao,
      override_motivo: l.override_motivo,
      pulsos_corrigido: l.pulsos_corrigido,
    }).eq('id', l.linha_id)
    if (error) return { ok: false, erro: error.message }
  }

  const { data: reg } = await supabase
    .from('ultraformer_registos').select('cliente_id, data_entrega').eq('id', input.registoId).maybeSingle()
  const { data: linhas } = await supabase
    .from('ultraformer_registo_linhas').select('area, pulsos_utilizados, pulsos_corrigido').eq('registo_id', input.registoId)

  const usados = (l: { pulsos_utilizados: number | null; pulsos_corrigido: number | null }) =>
    (l.pulsos_corrigido ?? l.pulsos_utilizados ?? 0)
  const ls = (linhas as { area: 'rosto' | 'corpo'; pulsos_utilizados: number | null; pulsos_corrigido: number | null }[]) ?? []
  const totalRosto = ls.filter((l) => l.area === 'rosto').reduce((s, l) => s + Math.max(0, usados(l)), 0)
  const totalCorpo = ls.filter((l) => l.area === 'corpo').reduce((s, l) => s + Math.max(0, usados(l)), 0)

  const tar = await tarifarioVigente()
  const clienteId = (reg as { cliente_id: string | null } | null)?.cliente_id ?? null
  const dataEntrega = (reg as { data_entrega: string | null } | null)?.data_entrega ?? new Date().toISOString()
  const diasMesAntes = await contarDiasMesAntes(clienteId, dataEntrega, input.registoId)
  const resultado = tar
    ? calcularValorUltraformer({ pulsosRosto: totalRosto, pulsosCorpo: totalCorpo, diasAluguer: input.diasAluguer, diasMesAntes }, tar)
    : null

  const { error } = await supabase.from('ultraformer_registos').update({
    stop_recolha_id: input.stopRecolhaId,
    estado: 'recolhido',
    data_recolha: new Date().toISOString(),
    responsavel_recolha_id: input.responsavelId,
    responsavel_recolha_nome: input.responsavelNome,
    clinica_resp_recolha: input.clinicaResp,
    clinica_validacao_recolha: input.clinicaValidacao,
    assinatura_recolha_caminho: input.assinaturaCaminho,
    foto_recolha_caminho: input.fotoCaminho,
    obs_recolha: input.obs,
    total_pulsos_rosto: totalRosto,
    total_pulsos_corpo: totalCorpo,
    total_pulsos_geral: totalRosto + totalCorpo,
    dias_aluguer: input.diasAluguer,
    dias_mes_antes: diasMesAntes,
    tarifario_id: tar?.id ?? null,
    valor_total: resultado?.valorTotal ?? null,
    valor_detalhe: resultado ?? null,
  }).eq('id', input.registoId)
  if (error) return { ok: false, erro: error.message }

  await supabase.from('transport_stops').update({ pulsos_registado: true }).eq('id', input.stopRecolhaId)
  return { ok: true, resultado: resultado ?? undefined }
}

// Rótulo de um cartucho: Rosto 1,5 mm (S/N …)
export function rotuloCartucho(c: { area: string; profundidade_mm: number | null; serial_number: string | null }): string {
  const area = c.area === 'rosto' ? 'Rosto' : 'Corpo'
  const mm = c.profundidade_mm != null ? `${String(c.profundidade_mm).replace('.', ',')} mm` : ''
  const sn = c.serial_number ? ` (S/N ${c.serial_number})` : ''
  return `${area} ${mm}${sn}`.trim()
}
