// Envio de SMS via Twilio (REST API, sem dependências) — apenas no servidor.
// O TWILIO_AUTH_TOKEN nunca pode ir para o browser; usar só em route handlers.
// Variáveis: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER_ID (default "All4laser").

export async function enviarSms(para: string, corpo: string): Promise<{ ok: boolean; erro?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const sender = process.env.TWILIO_SENDER_ID || 'All4laser'
  if (!sid || !token) return { ok: false, erro: 'Twilio não configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).' }
  if (!para) return { ok: false, erro: 'Número de destino em falta.' }

  const corpoForm = new URLSearchParams({ To: para, From: sender, Body: corpo })
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corpoForm,
    })
    if (!r.ok) return { ok: false, erro: `Twilio ${r.status}: ${await r.text()}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao contactar a Twilio.' }
  }
}
