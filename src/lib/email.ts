// Envio de email transacional da app.
//
// Ordem de preferência (para os emails "voltarem a funcionar" sem depender dos
// créditos do SendGrid, que esgotam):
//   1) GMAIL via Service Account (Domain-Wide Delegation) — SEM limite de
//      créditos (~2000 envios/dia). É o mesmo canal já usado por fichas,
//      freight, cotações e pedidos-fatura (src/lib/gmailSend.ts).
//   2) SENDGRID (fallback) — só se o Gmail não estiver configurado ou falhar,
//      e apenas quando SENDGRID_API_KEY existir.
//
// A assinatura de enviarEmail() é a mesma de sempre, por isso nenhuma das
// rotas que a chamam precisa de mudar. O remetente:
//   - Gmail: personifica uma conta REAL @all4laser.com (GOOGLE_GMAIL_SUBJECT ou
//     comercial@all4laser.com; endereços tipo noreply@ não são caixas reais e
//     não servem para DWD, por isso caem no default).
//   - SendGrid: usa EMAIL_FROM ("Nome <email@dominio>") como antes.

import { enviarGmail } from './gmailSend'

type Anexo = { filename: string; contentBase64: string; type?: string }

export type ResultadoEmail = {
  ok: boolean
  configurado: boolean
  motivo?: string
}

export async function enviarEmail(opts: {
  para: string | string[]
  assunto: string
  html: string
  de?: string
  anexos?: Anexo[]
}): Promise<ResultadoEmail> {
  const destinatarios = (Array.isArray(opts.para) ? opts.para : [opts.para])
    .map((e) => e.trim())
    .filter(Boolean)
  if (destinatarios.length === 0) {
    return { ok: false, configurado: true, motivo: 'Sem destinatários.' }
  }

  const temGmail = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const temSendgrid = !!process.env.SENDGRID_API_KEY
  if (!temGmail && !temSendgrid) {
    return { ok: false, configurado: false, motivo: 'O envio de email ainda não está configurado.' }
  }

  // 1) Gmail primeiro (sem limite de créditos).
  if (temGmail) {
    const g = await enviarGmail({
      para: destinatarios,
      assunto: opts.assunto,
      corpoHtml: opts.html,
      corpoTexto: htmlParaTexto(opts.html),
      remetente: resolverRemetenteGmail(opts.de),
      anexos: opts.anexos?.map((a) => ({
        filename: a.filename,
        contentBase64: a.contentBase64,
        mimeType: a.type,
      })),
    })
    if (g.ok) return { ok: true, configurado: true }
    // Gmail falhou: se não houver SendGrid, devolve o motivo do Gmail.
    if (!temSendgrid) {
      return { ok: false, configurado: true, motivo: `O envio por Gmail falhou. ${g.erro ?? ''}`.trim() }
    }
    // Caso contrário, continua para o SendGrid como alternativa.
  }

  // 2) SendGrid (fallback).
  return enviarPorSendgrid(destinatarios, opts)
}

async function enviarPorSendgrid(
  destinatarios: string[],
  opts: { assunto: string; html: string; de?: string; anexos?: Anexo[] },
): Promise<ResultadoEmail> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) {
    return { ok: false, configurado: false, motivo: 'O envio de email ainda não está configurado.' }
  }

  const de = opts.de ?? process.env.EMAIL_FROM ?? 'All4laser <noreply@all4laser.com>'
  const remetente = parseRemetente(de)

  const body: Record<string, unknown> = {
    personalizations: [{ to: destinatarios.map((email) => ({ email })) }],
    from: remetente.name ? { email: remetente.email, name: remetente.name } : { email: remetente.email },
    subject: opts.assunto,
    content: [{ type: 'text/html', value: opts.html }],
  }
  if (opts.anexos?.length) {
    body.attachments = opts.anexos.map((a) => ({
      content: a.contentBase64,
      filename: a.filename,
      type: a.type ?? 'application/octet-stream',
      disposition: 'attachment',
    }))
  }

  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // O SendGrid responde 202 (Accepted) quando aceita o envio.
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      return { ok: false, configurado: true, motivo: `O envio falhou no SendGrid. ${detalhe}`.trim() }
    }
    return { ok: true, configurado: true }
  } catch {
    return { ok: false, configurado: true, motivo: 'Erro de rede ao enviar o email.' }
  }
}

// Escolhe a conta @all4laser.com a personificar no Gmail. Se vier um `de` com
// uma conta real do domínio (que não seja noreply/no-reply), usa-a; caso
// contrário usa GOOGLE_GMAIL_SUBJECT ou comercial@all4laser.com.
function resolverRemetenteGmail(de?: string): string {
  const fallback = process.env.GOOGLE_GMAIL_SUBJECT || 'comercial@all4laser.com'
  if (!de) return fallback
  const email = parseRemetente(de).email.toLowerCase()
  if (!email.endsWith('@all4laser.com')) return fallback
  if (/^(noreply|no-reply|nao-responder|nao_responder)@/.test(email)) return fallback
  return email
}

// Converte HTML simples em texto, para a parte text/plain do email (Gmail).
function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

// Aceita "Nome <email@dominio>" ou apenas "email@dominio".
function parseRemetente(s: string): { email: string; name?: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1] || undefined, email: m[2].trim() }
  return { email: s.trim() }
}
