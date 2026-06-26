// Serviço de envio de SMS via Twilio (Alphanumeric Sender ID "All4laser").
// Usado pelos lembretes automáticos. SMS unidirecional — o destinatário não responde.
// Variáveis: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SENDER_ID (default "All4laser").
import twilio from 'twilio'

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const SENDER = process.env.TWILIO_SENDER_ID || 'All4laser'

let cliente = null
function getCliente() {
  if (!SID || !TOKEN) return null
  if (!cliente) cliente = twilio(SID, TOKEN)
  return cliente
}

// True se as credenciais Twilio estão presentes.
export function smsConfigurado() {
  return Boolean(getCliente())
}

// Lê uma lista de números E.164 a partir de uma env.
// Tolera vírgula, ponto-e-vírgula, barra, espaços ou quebras de linha como separador.
export function numerosDe(envVar = 'SMS_DEST') {
  return (process.env[envVar] || '')
    .split(/[\s,;/]+/)
    .map((n) => n.trim())
    .filter(Boolean)
}

// Envia um SMS. Devolve true se a Twilio aceitou a mensagem.
export async function enviarSms(para, corpo) {
  const c = getCliente()
  if (!c) {
    console.error('Twilio não configurado (falta TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN).')
    return false
  }
  try {
    const msg = await c.messages.create({ from: SENDER, to: para, body: corpo })
    console.log(`SMS enviado para ${para}: ${msg.sid}`)
    return true
  } catch (err) {
    console.error(`Falha SMS para ${para}: ${err?.message ?? err}`)
    return false
  }
}
