// ─────────────────────────────────────────────────────────────────────────────
// Automação de tracking — lado servidor (service_role). NÃO conhece o Ship24:
// fala só com o adaptador (src/lib/trackingProvider.ts) através da interface
// normalizada. Usada pelo webhook e pelo cron de reconciliação.
//
//   - registarEnviosPendentes: cria trackers para envios ativos com auto ligado
//     (respeita a quota do plano). Envios terminados nunca são registados.
//   - aplicarResultado: grava eventos (idempotente), atualiza estado/último
//     evento; ao detetar entrega regista a data e pára de seguir (liberta quota).
//   - reconciliar: varre os envios ativos e confirma o estado no Ship24 (apanha
//     webhooks perdidos), respeitando o rate limit.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  criarTracker, obterResultados, pararTracker, providerAtivo,
  type TrackingResultado, type EstadoNormalizado,
} from './trackingProvider'

const ESTADOS_TERMINAIS: EstadoNormalizado[] = ['entregue', 'devolvido']
const RATE_MS = 150 // ~6-7 req/s, abaixo do limite de 10 req/s do Ship24
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Número para enviar ao Ship24: tira espaços (os tracking numbers são guardados
// por vezes com espaços — ex.: "8755 1851 7586" — e o Ship24 não os reconhece
// nesse formato). Não mexe noutros separadores (ex.: "/" do NACEX).
function numeroLimpo(tracking: string | null, awb: string | null): string {
  return (tracking || awb || '').replace(/\s+/g, '').trim()
}

export function dbService(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Linha mínima de shipments_tracking que a automação precisa.
type EnvioRow = {
  id: string
  tracking_number: string | null
  awb: string | null
  carrier_id: string | null
  carrier_code_api: string | null
  ship24_tracker_id: string | null
  estado: EstadoNormalizado
  estado_manual: boolean
  entrega_efetiva: string | null
}

export type Integracao = {
  id: number
  ativo: boolean
  plano: string
  quota_limite: number
  quota_consumida: number
  quota_periodo_inicio: string | null
  ultimo_cron_em: string | null
  ultimo_cron_ok: boolean | null
  ultimo_cron_erro: string | null
  ultimo_webhook_em: string | null
  falhas_consecutivas: number
}

export async function lerIntegracao(sb: SupabaseClient): Promise<Integracao> {
  const { data } = await sb.from('tracking_integracao').select('*').eq('id', 1).maybeSingle()
  return (data as Integracao) ?? {
    id: 1, ativo: false, plano: 'free', quota_limite: 10, quota_consumida: 0,
    quota_periodo_inicio: null, ultimo_cron_em: null, ultimo_cron_ok: null,
    ultimo_cron_erro: null, ultimo_webhook_em: null, falhas_consecutivas: 0,
  }
}

// Garante que a quota corresponde ao mês atual (reset mensal automático).
async function garantirPeriodo(sb: SupabaseClient, integ: Integracao, hojeIso: string): Promise<Integracao> {
  const mesAtual = hojeIso.slice(0, 7) // YYYY-MM
  const mesPeriodo = (integ.quota_periodo_inicio ?? '').slice(0, 7)
  if (mesPeriodo === mesAtual) return integ
  const inicio = `${mesAtual}-01`
  await sb.from('tracking_integracao').update({ quota_consumida: 0, quota_periodo_inicio: inicio }).eq('id', 1)
  return { ...integ, quota_consumida: 0, quota_periodo_inicio: inicio }
}

// courierCode a enviar ao adaptador: o do envio, senão o do carrier associado.
async function courierCodeDoEnvio(sb: SupabaseClient, e: EnvioRow): Promise<string | null> {
  if (e.carrier_code_api) return e.carrier_code_api
  if (!e.carrier_id) return null
  const { data } = await sb.from('carriers').select('carrier_code_api, suporta_ship24').eq('id', e.carrier_id).maybeSingle()
  const c = data as { carrier_code_api: string | null; suporta_ship24: boolean } | null
  return c?.carrier_code_api ?? null
}

// ─── Aplicar um resultado normalizado a um envio ─────────────────────────────
// Grava os eventos novos (idempotência por event_id), atualiza o último evento e
// o estado (exceto se estiver em override manual). Ao entregar, regista a data e
// pára de seguir para libertar quota.
export async function aplicarResultado(
  sb: SupabaseClient,
  envio: EnvioRow,
  resultado: TrackingResultado,
  origem: 'webhook' | 'cron',
): Promise<{ novos: number; estadoMudou: boolean }> {
  if (!resultado.disponivel) return { novos: 0, estadoMudou: false }

  // Eventos já registados (para não duplicar).
  const { data: existentes } = await sb.from('tracking_updates')
    .select('event_id, ocorrido_em, descricao').eq('tracking_id', envio.id)
  const idsVistos = new Set((existentes ?? []).map((r) => (r as { event_id: string | null }).event_id).filter(Boolean) as string[])
  const chavesVistas = new Set((existentes ?? []).map((r) => {
    const x = r as { ocorrido_em: string | null; descricao: string | null }
    return `${x.ocorrido_em ?? ''}|${x.descricao ?? ''}`
  }))

  const novos = resultado.eventos.filter((ev) => {
    if (ev.eventId) return !idsVistos.has(ev.eventId)
    return !chavesVistas.has(`${ev.ocorridoEm ?? ''}|${ev.descricao ?? ''}`)
  })

  if (novos.length > 0) {
    await sb.from('tracking_updates').insert(novos.map((ev) => ({
      tracking_id: envio.id,
      event_id: ev.eventId,
      status_milestone: ev.statusMilestone,
      status_category: ev.statusCategory,
      estado_mapeado: ev.estado,
      descricao: ev.descricao,
      local: ev.local,
      courier_code: ev.courierCode,
      ocorrido_em: ev.ocorridoEm,
      recebido_por: origem,
    })))
  }

  const ultimo = resultado.ultimo
  const patch: Record<string, unknown> = {}
  if (ultimo) {
    patch.last_status_milestone = resultado.milestone
    patch.last_status_raw = ultimo.descricao
    patch.last_status_at = new Date().toISOString()
    patch.last_event_descricao = ultimo.descricao
    patch.last_event_local = ultimo.local
    patch.last_event_em = ultimo.ocorridoEm
  }

  let estadoMudou = false
  // O estado só é atualizado automaticamente se NÃO estiver em override manual.
  if (!envio.estado_manual && resultado.estado && resultado.estado !== envio.estado) {
    patch.estado = resultado.estado
    estadoMudou = true
  }
  if (resultado.entregue) {
    if (resultado.entregaEfetiva && !envio.entrega_efetiva) patch.entrega_efetiva = resultado.entregaEfetiva
  }

  if (Object.keys(patch).length > 0) {
    await sb.from('shipments_tracking').update(patch).eq('id', envio.id)
  }

  // Entregue/devolvido → parar de seguir no Ship24 (liberta quota).
  const estadoFinal = (patch.estado as EstadoNormalizado) ?? envio.estado
  if (ESTADOS_TERMINAIS.includes(estadoFinal) && envio.ship24_tracker_id) {
    await pararTracker(envio.ship24_tracker_id)
  }

  return { novos: novos.length, estadoMudou }
}

// ─── Registar envios ativos ainda sem tracker ────────────────────────────────
export async function registarEnviosPendentes(sb: SupabaseClient): Promise<{ criados: number; semQuota: number; erros: number }> {
  if (!providerAtivo()) return { criados: 0, semQuota: 0, erros: 0 }
  const hojeIso = new Date().toISOString()
  let integ = await lerIntegracao(sb)
  integ = await garantirPeriodo(sb, integ, hojeIso)

  const { data } = await sb.from('shipments_tracking')
    .select('id, tracking_number, awb, carrier_id, carrier_code_api, ship24_tracker_id, estado, estado_manual, entrega_efetiva')
    .eq('auto_tracking_enabled', true)
    .is('deleted_at', null)
    .eq('origem_anulada', false)
    .is('ship24_tracker_id', null)
    .not('estado', 'in', '("entregue","devolvido")')
  const pendentes = (data as EnvioRow[]) ?? []

  let criados = 0, semQuota = 0, erros = 0
  for (const e of pendentes) {
    const numero = numeroLimpo(e.tracking_number, e.awb)
    if (!numero) continue
    if (integ.quota_consumida + criados >= integ.quota_limite) { semQuota++; continue }

    const courier = await courierCodeDoEnvio(sb, e)
    const r = await criarTracker({ trackingNumber: numero, courierCode: courier, clientTrackerId: e.id })
    if (!r.ok) { erros++; await sleep(RATE_MS); continue }
    await sb.from('shipments_tracking').update({
      ship24_tracker_id: r.dados.trackerId,
      ship24_registado_em: new Date().toISOString(),
    }).eq('id', e.id)
    criados++
    await sleep(RATE_MS)
  }

  if (criados > 0) {
    await sb.from('tracking_integracao').update({ quota_consumida: integ.quota_consumida + criados }).eq('id', 1)
  }
  return { criados, semQuota, erros }
}

// ─── Reconciliação: confirmar o estado dos envios ativos já registados ───────
export async function reconciliar(sb: SupabaseClient): Promise<{ verificados: number; atualizados: number; erros: number }> {
  if (!providerAtivo()) return { verificados: 0, atualizados: 0, erros: 0 }
  const { data } = await sb.from('shipments_tracking')
    .select('id, tracking_number, awb, carrier_id, carrier_code_api, ship24_tracker_id, estado, estado_manual, entrega_efetiva')
    .eq('auto_tracking_enabled', true)
    .is('deleted_at', null)
    .eq('origem_anulada', false)
    .not('ship24_tracker_id', 'is', null)
    .not('estado', 'in', '("entregue","devolvido")')
  const envios = (data as EnvioRow[]) ?? []

  let verificados = 0, atualizados = 0, erros = 0
  for (const e of envios) {
    if (!e.ship24_tracker_id) continue
    const r = await obterResultados(e.ship24_tracker_id)
    verificados++
    if (!r.ok) { erros++; await sleep(RATE_MS); continue }
    const res = await aplicarResultado(sb, e, r.dados, 'cron')
    if (res.novos > 0 || res.estadoMudou) atualizados++
    await sleep(RATE_MS)
  }
  return { verificados, atualizados, erros }
}

// ─── Corrida completa do cron ─────────────────────────────────────────────────
export async function correrCron(sb: SupabaseClient): Promise<{
  ok: boolean
  registo: { criados: number; semQuota: number; erros: number }
  reconc: { verificados: number; atualizados: number; erros: number }
  erro?: string
}> {
  const integ = await lerIntegracao(sb)
  if (!providerAtivo() || !integ.ativo) {
    return { ok: true, registo: { criados: 0, semQuota: 0, erros: 0 }, reconc: { verificados: 0, atualizados: 0, erros: 0 } }
  }
  try {
    const registo = await registarEnviosPendentes(sb)
    const reconc = await reconciliar(sb)
    const houveErro = registo.erros > 0 || reconc.erros > 0
    await sb.from('tracking_integracao').update({
      ultimo_cron_em: new Date().toISOString(),
      ultimo_cron_ok: !houveErro,
      ultimo_cron_erro: houveErro ? `registo: ${registo.erros} erros · reconc: ${reconc.erros} erros` : null,
      falhas_consecutivas: houveErro ? integ.falhas_consecutivas + 1 : 0,
    }).eq('id', 1)
    return { ok: !houveErro, registo, reconc }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Erro desconhecido no cron.'
    await sb.from('tracking_integracao').update({
      ultimo_cron_em: new Date().toISOString(),
      ultimo_cron_ok: false,
      ultimo_cron_erro: erro,
      falhas_consecutivas: integ.falhas_consecutivas + 1,
    }).eq('id', 1)
    return { ok: false, registo: { criados: 0, semQuota: 0, erros: 0 }, reconc: { verificados: 0, atualizados: 0, erros: 0 }, erro }
  }
}

// ─── Resolver o envio a partir do payload de webhook ─────────────────────────
export async function resolverEnvio(
  sb: SupabaseClient,
  ref: { clientTrackerId: string | null; trackerId: string | null; trackingNumber: string | null },
): Promise<EnvioRow | null> {
  const cols = 'id, tracking_number, awb, carrier_id, carrier_code_api, ship24_tracker_id, estado, estado_manual, entrega_efetiva'
  if (ref.clientTrackerId) {
    const { data } = await sb.from('shipments_tracking').select(cols).eq('id', ref.clientTrackerId).maybeSingle()
    if (data) return data as EnvioRow
  }
  if (ref.trackerId) {
    const { data } = await sb.from('shipments_tracking').select(cols).eq('ship24_tracker_id', ref.trackerId).maybeSingle()
    if (data) return data as EnvioRow
  }
  if (ref.trackingNumber) {
    const n = ref.trackingNumber.trim()
    const { data } = await sb.from('shipments_tracking').select(cols)
      .or(`tracking_number.eq.${n},awb.eq.${n}`).is('deleted_at', null).maybeSingle()
    if (data) return data as EnvioRow
  }
  return null
}

export async function marcarWebhookRecebido(sb: SupabaseClient): Promise<void> {
  await sb.from('tracking_integracao').update({ ultimo_webhook_em: new Date().toISOString() }).eq('id', 1)
}
