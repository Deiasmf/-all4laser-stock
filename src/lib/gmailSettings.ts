// Lê a assinatura configurada na conta Gmail (comercial@) via Gmail API
// (users.settings.sendAs.get). Usa a mesma Service Account + Domain-Wide
// Delegation do envio, mas com o scope de LEITURA das definições.
//
// Passo extra no Google Workspace (uma vez): em Admin > Segurança > Delegação
// em todo o domínio, acrescentar ao Client ID da Service Account o scope
//   https://www.googleapis.com/auth/gmail.settings.basic
// (o envio continua a usar gmail.send; este é só para ler a assinatura).
import crypto from 'node:crypto'

const SUBJECT_DEFAULT = 'comercial@all4laser.com'
const SCOPE = 'https://www.googleapis.com/auth/gmail.settings.basic'

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
  } catch { return { erro: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' } }
}
async function obterToken(sa: ServiceAccount, subject: string): Promise<string> {
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const cab = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({ iss: sa.client_email, sub: subject, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }))
  const assinado = `${cab}.${corpo}`
  const assinatura = base64url(crypto.createSign('RSA-SHA256').update(assinado).sign(sa.private_key))
  const r = await fetch(tokenUri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${assinado}.${assinatura}` }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`auth ${r.status}: ${j.error_description ?? j.error ?? 'falha'} (verifica o scope gmail.settings.basic na delegação)`)
  return j.access_token as string
}

// Devolve o HTML da assinatura da conta (sendAs principal = a própria conta).
export async function obterAssinaturaGmail(remetente?: string): Promise<{ ok: boolean; signature?: string; erro?: string }> {
  const { sa, erro } = carregarSA()
  if (!sa) return { ok: false, erro }
  const conta = (remetente && remetente.trim()) || process.env.GOOGLE_GMAIL_SUBJECT || SUBJECT_DEFAULT
  try {
    const token = await obterToken(sa, conta)
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(conta)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await r.json()
    if (!r.ok) return { ok: false, erro: `Gmail ${r.status}: ${j?.error?.message ?? 'falha a ler a assinatura'}` }
    return { ok: true, signature: (j.signature as string) || '' }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao contactar o Gmail.' }
  }
}
