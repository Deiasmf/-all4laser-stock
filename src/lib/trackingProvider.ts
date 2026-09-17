// ─────────────────────────────────────────────────────────────────────────────
// Adaptador de tracking automático — Ship24 (https://docs.ship24.com).
//
// ESTE É O ÚNICO PONTO DA APP QUE CONHECE O SHIP24. Todo o resto (automação,
// webhook, cron, UI) fala com a interface normalizada abaixo. Trocar de
// fornecedor no futuro (17track, GoComet) = escrever outro adaptador que
// cumpra esta mesma interface, sem mudar mais nada.
//
// Configuração (Vercel → Environment Variables):
//   SHIP24_API_KEY       chave da API (apik_…), usada como Bearer.
//   SHIP24_WEBHOOK_SECRET segredo do webhook (validação em /api/webhooks/ship24).
//
// Endpoints usados (confirmados na doc, base https://api.ship24.com):
//   POST  /trackers                       criar tracker → devolve trackerId
//   GET   /trackers/{trackerId}/results   resultados/eventos de um tracker
//   PATCH /trackers/{trackerId}           { isSubscribed:false } = parar de seguir
//   GET   /couriers                       lista de courierCode do Ship24
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoNormalizado = 'registado' | 'em_transito' | 'entregue' | 'problema' | 'devolvido'

// Evento normalizado (independente do fornecedor).
export type TrackingEvento = {
  eventId: string | null
  statusMilestone: string | null   // milestone cru do fornecedor (guardar em last_status_milestone)
  statusCategory: string | null
  estado: EstadoNormalizado        // mapeado para o nosso domínio
  descricao: string | null         // texto cru do evento
  local: string | null
  courierCode: string | null
  ocorridoEm: string | null        // ISO
}

// Resultado normalizado de um tracker (usado pela automação/cron/webhook).
export type TrackingResultado = {
  disponivel: boolean              // false se o fornecedor não estiver configurado
  trackerId: string | null
  estado: EstadoNormalizado
  milestone: string | null
  eventos: TrackingEvento[]        // ordenados do mais antigo para o mais recente
  ultimo: TrackingEvento | null
  entregue: boolean
  entregaEfetiva: string | null    // date (YYYY-MM-DD) quando entregue
}

// Interface antiga (mantida por compatibilidade com o README e chamadas simples).
export type TrackingStatus = {
  disponivel: boolean
  estado?: EstadoNormalizado
  descricaoBruta?: string
  atualizadoEm?: string
}

export type Courier = { courierCode: string; courierName: string; website?: string | null }

export type ResultadoAdaptador<T> = { ok: true; dados: T } | { ok: false; erro: string; status?: number }

const BASE = 'https://api.ship24.com'

function apiKey(): string | null {
  const k = process.env.SHIP24_API_KEY
  return k && k.trim() ? k.trim() : null
}

// True quando o adaptador está configurado (há API key). O resto da app usa
// isto para saber se pode registar/consultar; sem chave, tudo fica manual.
export function providerAtivo(): boolean {
  return apiKey() !== null
}

export const PROVIDER_NOME = 'ship24'

async function req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<ResultadoAdaptador<T>> {
  const key = apiKey()
  if (!key) return { ok: false, erro: 'SHIP24_API_KEY não configurada.' }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    const resp = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    const texto = await resp.text()
    const json = texto ? JSON.parse(texto) : {}
    if (!resp.ok) {
      const msg = json?.errors?.[0]?.message || json?.message || `HTTP ${resp.status}`
      return { ok: false, erro: String(msg), status: resp.status }
    }
    return { ok: true, dados: json as T }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro de rede ao contactar o Ship24.' }
  }
}

// ─── Mapeamento de estados (Ship24 → domínio) ────────────────────────────────
// statusMilestone do Ship24: info_received, in_transit, out_for_delivery,
// failed_attempt, available_for_pickup, exception, delivered.
const RE_DEVOLUCAO = /return(ed|ing)?|devolv|retornad|retour|rücksend|renvoy/i

export function mapearEstado(milestone: string | null | undefined, textoCru: string | null | undefined): EstadoNormalizado {
  const m = (milestone ?? '').toLowerCase()
  const t = textoCru ?? ''
  if (RE_DEVOLUCAO.test(t)) return 'devolvido'
  switch (m) {
    case 'delivered': return 'entregue'
    case 'exception':
    case 'failed_attempt': return 'problema'
    case 'in_transit':
    case 'out_for_delivery':
    case 'available_for_pickup': return 'em_transito'
    case 'info_received': return 'registado'
    default: return 'registado'
  }
}

// ─── Parsing dos payloads Ship24 (results e webhook têm a mesma forma) ────────
type Ship24Event = {
  eventId?: string
  status?: string
  occurrenceDatetime?: string
  datetime?: string
  location?: string
  courierCode?: string
  statusCategory?: string
  statusMilestone?: string
}
type Ship24Tracking = {
  tracker?: { trackerId?: string; trackingNumber?: string; clientTrackerId?: string }
  shipment?: { statusMilestone?: string; statusCategory?: string; delivery?: { estimatedDeliveryDate?: string } }
  events?: Ship24Event[]
}

function normalizarEvento(ev: Ship24Event): TrackingEvento {
  const ocorrido = ev.occurrenceDatetime || ev.datetime || null
  return {
    eventId: ev.eventId ?? null,
    statusMilestone: ev.statusMilestone ?? null,
    statusCategory: ev.statusCategory ?? null,
    estado: mapearEstado(ev.statusMilestone, ev.status),
    descricao: ev.status ?? null,
    local: ev.location ?? null,
    courierCode: ev.courierCode ?? null,
    ocorridoEm: ocorrido,
  }
}

// Constrói o resultado normalizado a partir de UM objeto tracking do Ship24.
export function normalizarTracking(tr: Ship24Tracking): TrackingResultado {
  const eventosBrutos = Array.isArray(tr.events) ? tr.events : []
  const eventos = eventosBrutos
    .map(normalizarEvento)
    .sort((a, b) => (a.ocorridoEm ?? '').localeCompare(b.ocorridoEm ?? ''))
  const ultimo = eventos.length ? eventos[eventos.length - 1] : null
  const milestone = tr.shipment?.statusMilestone ?? ultimo?.statusMilestone ?? null
  const estado = mapearEstado(milestone, ultimo?.descricao)
  const entregue = estado === 'entregue'
  const entregaEfetiva = entregue ? (ultimo?.ocorridoEm ? ultimo.ocorridoEm.slice(0, 10) : null) : null
  return {
    disponivel: true,
    trackerId: tr.tracker?.trackerId ?? null,
    estado,
    milestone,
    eventos,
    ultimo,
    entregue,
    entregaEfetiva,
  }
}

// Extrai todos os trackings de um payload de webhook (pode trazer vários).
// Aceita { data: { trackings } } ou { trackings } (defensivo).
export function parsearWebhook(body: unknown): { clientTrackerId: string | null; trackerId: string | null; trackingNumber: string | null; resultado: TrackingResultado }[] {
  const raiz = (body ?? {}) as { data?: { trackings?: Ship24Tracking[] }; trackings?: Ship24Tracking[] }
  const trackings = raiz.data?.trackings ?? raiz.trackings ?? []
  return trackings.map((tr) => ({
    clientTrackerId: tr.tracker?.clientTrackerId ?? null,
    trackerId: tr.tracker?.trackerId ?? null,
    trackingNumber: tr.tracker?.trackingNumber ?? null,
    resultado: normalizarTracking(tr),
  }))
}

// ─── Operações da API ─────────────────────────────────────────────────────────

// Criar tracker. courierCode é opcional — sem ele, o Ship24 auto-deteta pelo nº.
// clientTrackerId liga o tracker ao nosso shipment (útil no webhook).
export async function criarTracker(input: {
  trackingNumber: string
  courierCode?: string | null
  clientTrackerId?: string | null
  destinationCountry?: string | null
  originCountry?: string | null
}): Promise<ResultadoAdaptador<{ trackerId: string }>> {
  const corpo: Record<string, unknown> = { trackingNumber: input.trackingNumber }
  if (input.courierCode) corpo.courierCode = [input.courierCode]
  if (input.clientTrackerId) corpo.clientTrackerId = input.clientTrackerId
  if (input.destinationCountry) corpo.destinationCountry = input.destinationCountry
  if (input.originCountry) corpo.originCountry = input.originCountry
  const r = await req<{ data?: { tracker?: { trackerId?: string } } }>('POST', '/trackers', corpo)
  if (!r.ok) return r
  const id = r.dados?.data?.tracker?.trackerId
  if (!id) return { ok: false, erro: 'Ship24 não devolveu trackerId.' }
  return { ok: true, dados: { trackerId: id } }
}

// Resultados/eventos de um tracker.
export async function obterResultados(trackerId: string): Promise<ResultadoAdaptador<TrackingResultado>> {
  const r = await req<{ data?: { trackings?: Ship24Tracking[] } }>('GET', `/trackers/${encodeURIComponent(trackerId)}/results`)
  if (!r.ok) return r
  const tr = r.dados?.data?.trackings?.[0]
  if (!tr) return { ok: true, dados: { disponivel: true, trackerId, estado: 'registado', milestone: null, eventos: [], ultimo: null, entregue: false, entregaEfetiva: null } }
  return { ok: true, dados: normalizarTracking(tr) }
}

// Parar de seguir (liberta quota). Ship24 não tem DELETE: unsubscribe.
export async function pararTracker(trackerId: string): Promise<ResultadoAdaptador<true>> {
  const r = await req<unknown>('PATCH', `/trackers/${encodeURIComponent(trackerId)}`, { isSubscribed: false })
  if (!r.ok) return r
  return { ok: true, dados: true }
}

// Lista de couriers do Ship24 (para confirmar/mapear os carrier_code_api).
export async function listarCouriers(): Promise<ResultadoAdaptador<Courier[]>> {
  const r = await req<{ data?: { couriers?: Courier[] }; couriers?: Courier[] }>('GET', '/couriers')
  if (!r.ok) return r
  const lista = r.dados?.data?.couriers ?? r.dados?.couriers ?? []
  return { ok: true, dados: lista }
}

// ─── Interface simples antiga (compat) ───────────────────────────────────────
// Consulta por número de tracking sem tracker guardado (procura direta).
export async function getTrackingStatus(numero: string, _carrierCodeApi: string | null): Promise<TrackingStatus> {
  void _carrierCodeApi
  if (!providerAtivo()) return { disponivel: false }
  const r = await req<{ data?: { trackings?: Ship24Tracking[] } }>('GET', `/trackers/search/${encodeURIComponent(numero)}/results`)
  if (!r.ok) return { disponivel: false }
  const tr = r.dados?.data?.trackings?.[0]
  if (!tr) return { disponivel: false }
  const norm = normalizarTracking(tr)
  return {
    disponivel: true,
    estado: norm.estado,
    descricaoBruta: norm.ultimo?.descricao ?? undefined,
    atualizadoEm: norm.ultimo?.ocorridoEm ?? undefined,
  }
}
