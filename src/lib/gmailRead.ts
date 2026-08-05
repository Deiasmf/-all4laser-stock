// Leitura de emails via Gmail API com a Service Account (Domain-Wide Delegation),
// personificando a caixa onde chegam as leads. Segue o mesmo modelo do envio
// (src/lib/gmailSend.ts) — assina o JWT com o crypto do Node, sem o package
// `googleapis`. Só corre no servidor.
//
// Scope necessário na delegação de domínio: gmail.modify (ler + etiquetar).
// Variáveis (no servidor / Vercel):
//   GOOGLE_SERVICE_ACCOUNT_JSON  -> JSON da service account (já existe)
//   GOOGLE_LEADS_MAILBOX         -> caixa a ler (default andreia.fernandes@all4laser.com)
import crypto from 'node:crypto'

const MAILBOX_DEFAULT = 'andreia.fernandes@all4laser.com'
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string }

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function carregarSA(): { sa?: ServiceAccount; erro?: string } {
  const jsonSA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!jsonSA) return { erro: 'Gmail não configurado (falta GOOGLE_SERVICE_ACCOUNT_JSON).' }
  try {
    const sa = JSON.parse(jsonSA) as ServiceAccount
    if (!sa.client_email || !sa.private_key) return { erro: 'Service Account sem client_email/private_key.' }
    return { sa }
  } catch {
    return { erro: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' }
  }
}

export function caixaLeads(): string {
  return process.env.GOOGLE_LEADS_MAILBOX || MAILBOX_DEFAULT
}

let _tokenCache: { token: string; expira: number } | null = null

async function obterAccessToken(sa: ServiceAccount, subject: string): Promise<string> {
  if (_tokenCache && _tokenCache.expira > Date.now() + 60_000) return _tokenCache.token
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({
    iss: sa.client_email, sub: subject, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600,
  }))
  const assinado = `${cabecalho}.${corpo}`
  const assinatura = base64url(crypto.createSign('RSA-SHA256').update(assinado).sign(sa.private_key))
  const jwt = `${assinado}.${assinatura}`
  const r = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`auth ${r.status}: ${j.error_description ?? j.error ?? JSON.stringify(j)}`)
  _tokenCache = { token: j.access_token as string, expira: Date.now() + 3600_000 }
  return j.access_token as string
}

// ─── Estruturas ─────────────────────────────────────────────────────────────
export type EmailLead = {
  id: string
  threadId: string
  remetente: string
  assunto: string
  data: string          // ISO
  corpo: string         // texto simples
}

type GmailPart = {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}
type GmailMessage = {
  id: string
  threadId: string
  internalDate?: string
  payload?: GmailPart & { headers?: { name: string; value: string }[] }
}

function extrairTexto(payload: GmailMessage['payload']): string {
  if (!payload) return ''
  // Procura recursivamente o primeiro text/plain; senão cai para text/html sem tags.
  let html = ''
  const visitar = (p: GmailPart): string | null => {
    if (p.mimeType === 'text/plain' && p.body?.data) return decodeB64Url(p.body.data)
    if (p.mimeType === 'text/html' && p.body?.data && !html) html = decodeB64Url(p.body.data)
    for (const sub of p.parts ?? []) { const t = visitar(sub); if (t) return t }
    return null
  }
  const texto = visitar(payload)
  if (texto) return texto
  if (html) return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n')
  return ''
}

// ─── Operações ──────────────────────────────────────────────────────────────
// Lista ids de mensagens que batem numa query Gmail (ex.: from:... -label:...).
export async function procurarMensagens(query: string, max = 25): Promise<string[]> {
  const { sa, erro } = carregarSA()
  if (!sa) throw new Error(erro)
  const token = await obterAccessToken(sa, caixaLeads())
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', String(max))
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const j = await r.json()
  if (!r.ok) throw new Error(`Gmail list ${r.status}: ${j?.error?.message ?? JSON.stringify(j)}`)
  return ((j.messages ?? []) as { id: string }[]).map((m) => m.id)
}

export async function obterEmail(id: string): Promise<EmailLead> {
  const { sa, erro } = carregarSA()
  if (!sa) throw new Error(erro)
  const token = await obterAccessToken(sa, caixaLeads())
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const j = (await r.json()) as GmailMessage
  if (!r.ok) throw new Error(`Gmail get ${(j as unknown as { error?: { message?: string } })?.error?.message ?? id}`)
  const headers = j.payload?.headers ?? []
  const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? ''
  return {
    id: j.id,
    threadId: j.threadId,
    remetente: h('From'),
    assunto: h('Subject'),
    data: j.internalDate ? new Date(Number(j.internalDate)).toISOString() : new Date().toISOString(),
    corpo: extrairTexto(j.payload).trim(),
  }
}

// Garante que existe uma etiqueta com este nome; devolve o id.
export async function garantirEtiqueta(nome: string): Promise<string> {
  const { sa, erro } = carregarSA()
  if (!sa) throw new Error(erro)
  const token = await obterAccessToken(sa, caixaLeads())
  const lr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const lj = await lr.json()
  if (!lr.ok) throw new Error(`Gmail labels ${lr.status}: ${lj?.error?.message ?? ''}`)
  const existente = ((lj.labels ?? []) as { id: string; name: string }[]).find((l) => l.name === nome)
  if (existente) return existente.id
  const cr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  })
  const cj = await cr.json()
  if (!cr.ok) throw new Error(`Gmail create label ${cr.status}: ${cj?.error?.message ?? ''}`)
  return cj.id as string
}

// Aplica uma etiqueta a uma mensagem (marca como processada).
export async function aplicarEtiqueta(messageId: string, labelId: string): Promise<void> {
  const { sa, erro } = carregarSA()
  if (!sa) throw new Error(erro)
  const token = await obterAccessToken(sa, caixaLeads())
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  })
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Gmail modify ${r.status}: ${(j as { error?: { message?: string } })?.error?.message ?? ''}`) }
}
