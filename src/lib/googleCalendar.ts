// Criação de eventos no Google Calendar via Service Account — apenas no servidor.
// Não usa o package `googleapis` (pesado): assina o JWT com o crypto do Node e
// chama a REST API com fetch. Segue o mesmo modelo do Drive (drive-upload.mjs):
// a Service Account autentica-se com GOOGLE_SERVICE_ACCOUNT_JSON e o recurso
// (o calendário) tem de estar PARTILHADO com o email da Service Account.
//
// Variáveis (no servidor / Vercel):
//   GOOGLE_SERVICE_ACCOUNT_JSON  -> JSON completo da service account (string)
//   GOOGLE_CALENDAR_ID           -> id do calendário (default: email da Andreia)
import crypto from 'node:crypto'

const CALENDAR_ID_DEFAULT = 'andreia.fernandes@all4laser.com'

// Utilizador que a Service Account personifica (Domain-Wide Delegation).
// Tem de conseguir editar os calendários dos equipamentos. Assim não é preciso
// partilhar cada calendário com a SA. Configurável por GOOGLE_IMPERSONATE_SUBJECT.
const IMPERSONATE_DEFAULT = 'andreia.fernandes@all4laser.com'

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string }

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Cache do token entre chamadas (evita re-assinar a cada calendário lido).
let _tokenCache: { token: string; expira: number } | null = null

// Cria (ou reutiliza) um access token da Service Account (fluxo JWT-bearer do Google).
async function obterAccessToken(sa: ServiceAccount): Promise<string> {
  if (_tokenCache && _tokenCache.expira > Date.now() + 60_000) return _tokenCache.token
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const subject = process.env.GOOGLE_IMPERSONATE_SUBJECT || IMPERSONATE_DEFAULT
  const now = Math.floor(Date.now() / 1000)
  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: subject, // personificação via Domain-Wide Delegation
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }))
  const assinado = `${cabecalho}.${corpo}`
  const assinatura = base64url(crypto.createSign('RSA-SHA256').update(assinado).sign(sa.private_key))
  const jwt = `${assinado}.${assinatura}`

  const r = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`auth ${r.status}: ${j.error_description ?? j.error ?? JSON.stringify(j)}`)
  _tokenCache = { token: j.access_token as string, expira: Date.now() + 3600_000 }
  return j.access_token as string
}

export type EventoAgenda = { titulo: string; inicio: string; fim: string; diaInteiro: boolean }

// Lista os eventos de um calendário num intervalo [timeMin, timeMax] (ISO).
export async function listarEventos(
  calendarId: string, timeMin: string, timeMax: string,
): Promise<{ ok: boolean; erro?: string; eventos?: EventoAgenda[] }> {
  const { sa, erro } = carregarSA()
  if (!sa) return { ok: false, erro }
  try {
    const token = await obterAccessToken(sa)
    const eventos: EventoAgenda[] = []
    let pageToken: string | undefined
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
      url.searchParams.set('timeMin', timeMin)
      url.searchParams.set('timeMax', timeMax)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '2500')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      if (!r.ok) return { ok: false, erro: `Calendar ${r.status}: ${j?.error?.message ?? JSON.stringify(j)}` }
      for (const it of (j.items ?? [])) {
        const inicio = it.start?.date ?? it.start?.dateTime
        const fim = it.end?.date ?? it.end?.dateTime
        if (!inicio || !fim) continue // ignora eventos sem data (ex.: cancelados)
        eventos.push({ titulo: (it.summary ?? '').trim(), inicio, fim, diaInteiro: !!it.start?.date })
      }
      pageToken = j.nextPageToken
    } while (pageToken)
    return { ok: true, eventos }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler eventos do Google Calendar.' }
  }
}

function carregarSA(): { sa?: ServiceAccount; erro?: string } {
  const jsonSA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!jsonSA) return { erro: 'Google não configurado (falta GOOGLE_SERVICE_ACCOUNT_JSON).' }
  try {
    const sa = JSON.parse(jsonSA) as ServiceAccount
    if (!sa.client_email || !sa.private_key) return { erro: 'Service Account sem client_email/private_key.' }
    return { sa }
  } catch {
    return { erro: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' }
  }
}

// Lista os calendários a que a conta personificada tem acesso (id + nome).
export async function listarCalendarios(): Promise<{ ok: boolean; erro?: string; calendarios?: { id: string; nome: string }[] }> {
  const { sa, erro } = carregarSA()
  if (!sa) return { ok: false, erro }
  try {
    const token = await obterAccessToken(sa)
    const calendarios: { id: string; nome: string }[] = []
    let pageToken: string | undefined
    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList')
      url.searchParams.set('maxResults', '250')
      url.searchParams.set('showHidden', 'true')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      if (!r.ok) return { ok: false, erro: `Calendar ${r.status}: ${j?.error?.message ?? JSON.stringify(j)}` }
      for (const item of (j.items ?? [])) calendarios.push({ id: item.id, nome: item.summaryOverride ?? item.summary ?? item.id })
      pageToken = j.nextPageToken
    } while (pageToken)
    calendarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    return { ok: true, calendarios }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao contactar o Google Calendar.' }
  }
}

// Soma 1 dia a uma data 'YYYY-MM-DD' (eventos de dia inteiro no Google têm fim exclusivo).
function diaSeguinte(data: string): string {
  const [y, m, d] = data.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export type NovoEventoReserva = {
  numero: string | null
  modelo: string | null
  clienteNome: string | null
  clienteTelefone: string | null
  modalidade: string | null
  dataInicio: string // 'YYYY-MM-DD'
  dataFim: string    // 'YYYY-MM-DD'
}

// Cria o evento da reserva no Google Calendar. Best-effort: nunca lança — devolve o resultado.
// `calendarioEscolhido` (opcional): id do calendário escolhido pelo staff; se vazio, usa o geral.
export async function criarEventoReserva(
  r: NovoEventoReserva,
  calendarioEscolhido?: string,
): Promise<{ ok: boolean; erro?: string; eventoId?: string }> {
  const jsonSA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const calendarId =
    (calendarioEscolhido && calendarioEscolhido.trim()) ||
    process.env.GOOGLE_CALENDAR_ID ||
    CALENDAR_ID_DEFAULT
  if (!jsonSA) return { ok: false, erro: 'Google Calendar não configurado (falta GOOGLE_SERVICE_ACCOUNT_JSON).' }

  let sa: ServiceAccount
  try {
    sa = JSON.parse(jsonSA)
  } catch {
    return { ok: false, erro: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' }
  }
  if (!sa.client_email || !sa.private_key) {
    return { ok: false, erro: 'GOOGLE_SERVICE_ACCOUNT_JSON sem client_email/private_key.' }
  }

  try {
    const token = await obterAccessToken(sa)
    const evento = {
      summary: `${r.modelo ?? 'Equipamento'} — ${r.clienteNome ?? 'Cliente'}`,
      description:
        `Reserva ${r.numero ?? ''}\n` +
        `Cliente: ${r.clienteNome ?? '—'}\n` +
        `Telefone: ${r.clienteTelefone ?? '—'}\n` +
        `Modalidade: ${r.modalidade ?? '—'}`,
      start: { date: r.dataInicio },
      end: { date: diaSeguinte(r.dataFim) }, // fim exclusivo
    }
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(evento),
      },
    )
    const j = await res.json()
    if (!res.ok) {
      const msg = j?.error?.message ?? JSON.stringify(j)
      return { ok: false, erro: `Calendar ${res.status}: ${msg}` }
    }
    return { ok: true, eventoId: j.id }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao contactar o Google Calendar.' }
  }
}
