// Envio de email via SendGrid. Centraliza o acesso ao provedor para que as
// rotas não precisem de saber os detalhes da API. Só envia se a
// SENDGRID_API_KEY estiver configurada; caso contrário devolve
// { configurado: false } com um motivo claro para a interface mostrar.
//
// O remetente vem de EMAIL_FROM (formato "Nome <email@dominio>") e o domínio
// tem de estar autenticado no SendGrid (Domain Authentication).

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
  const key = process.env.SENDGRID_API_KEY
  if (!key) {
    return { ok: false, configurado: false, motivo: 'O envio de email ainda não está configurado.' }
  }

  const destinatarios = (Array.isArray(opts.para) ? opts.para : [opts.para])
    .map((e) => e.trim())
    .filter(Boolean)
  if (destinatarios.length === 0) {
    return { ok: false, configurado: true, motivo: 'Sem destinatários.' }
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

// Aceita "Nome <email@dominio>" ou apenas "email@dominio".
function parseRemetente(s: string): { email: string; name?: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1] || undefined, email: m[2].trim() }
  return { email: s.trim() }
}
