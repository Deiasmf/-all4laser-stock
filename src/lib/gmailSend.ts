// Envio de email via Gmail API com a Service Account (Domain-Wide Delegation),
// personificando comercial@all4laser.com. Segue o mesmo modelo do Calendar
// (src/lib/googleCalendar.ts): assina o JWT com o crypto do Node e chama a REST
// API com fetch — sem o package `googleapis`. Só corre no servidor.
//
// Variáveis (no servidor / Vercel):
//   GOOGLE_SERVICE_ACCOUNT_JSON  -> JSON completo da service account (string)
//   GOOGLE_GMAIL_SUBJECT         -> utilizador a personificar (default comercial@all4laser.com)
//
// Passos extra necessários no Google Workspace (uma vez):
//   1. Ativar a Gmail API no projeto Google Cloud.
//   2. Em Admin > Segurança > Delegação em todo o domínio, adicionar o scope
//      https://www.googleapis.com/auth/gmail.send ao Client ID da Service Account.
//   3. comercial@all4laser.com tem de ser uma conta real do domínio.
import crypto from 'node:crypto'

const GMAIL_SUBJECT_DEFAULT = 'comercial@all4laser.com'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string }

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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

// Cache de token por remetente personificado (cada pedido pode sair de uma
// conta diferente; o token é específico do subject).
const _tokenCache = new Map<string, { token: string; expira: number }>()

async function obterAccessToken(sa: ServiceAccount, subject: string): Promise<string> {
  const emCache = _tokenCache.get(subject)
  if (emCache && emCache.expira > Date.now() + 60_000) return emCache.token
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: subject, // personificação via Domain-Wide Delegation
    scope: GMAIL_SCOPE,
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`auth ${r.status}: ${j.error_description ?? j.error ?? JSON.stringify(j)}`)
  _tokenCache.set(subject, { token: j.access_token as string, expira: Date.now() + 3600_000 })
  return j.access_token as string
}

// Codifica o assunto (RFC 2047) para suportar acentos.
function encodeAssunto(assunto: string): string {
  // Se for tudo ASCII, não é preciso codificar.
  if (/^[\x00-\x7F]*$/.test(assunto)) return assunto
  return `=?UTF-8?B?${Buffer.from(assunto, 'utf8').toString('base64')}?=`
}

function construirMime(opts: { de: string; para: string[]; assunto: string; corpoTexto: string }): string {
  const linhas = [
    `From: ${opts.de}`,
    `To: ${opts.para.join(', ')}`,
    `Subject: ${encodeAssunto(opts.assunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.corpoTexto, 'utf8').toString('base64'),
  ]
  return linhas.join('\r\n')
}

export type ResultadoGmail = {
  ok: boolean
  configurado: boolean
  messageId?: string
  threadId?: string
  erro?: string
}

// Envia UM email (a um ou mais endereços do MESMO destinatário/empresa).
// `remetente` é a conta @all4laser.com que envia (personificada via DWD);
// por omissão usa GOOGLE_GMAIL_SUBJECT ou comercial@all4laser.com.
export async function enviarGmail(opts: {
  para: string[]
  assunto: string
  corpoTexto: string
  remetente?: string
}): Promise<ResultadoGmail> {
  const { sa, erro } = carregarSA()
  if (!sa) return { ok: false, configurado: false, erro }

  const para = opts.para.map((e) => e.trim()).filter(Boolean)
  if (para.length === 0) return { ok: false, configurado: true, erro: 'Sem destinatários.' }

  const remetente = (opts.remetente && opts.remetente.trim())
    || process.env.GOOGLE_GMAIL_SUBJECT || GMAIL_SUBJECT_DEFAULT
  const de = `All4laser <${remetente}>`
  try {
    const token = await obterAccessToken(sa, remetente)
    const raw = base64url(construirMime({ de, para, assunto: opts.assunto, corpoTexto: opts.corpoTexto }))
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
    const j = await r.json()
    if (!r.ok) {
      const msg = j?.error?.message ?? JSON.stringify(j)
      return { ok: false, configurado: true, erro: `Gmail ${r.status}: ${msg}` }
    }
    return { ok: true, configurado: true, messageId: j.id, threadId: j.threadId }
  } catch (e) {
    return { ok: false, configurado: true, erro: e instanceof Error ? e.message : 'Falha ao contactar o Gmail.' }
  }
}
