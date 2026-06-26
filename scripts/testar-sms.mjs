// Teste manual de envio de SMS via Twilio.
// Uso:  node --env-file=.env.local scripts/testar-sms.mjs +351912345678 "mensagem opcional"
// Se não passares número, usa o primeiro de SMS_DEST.
import { enviarSms, smsConfigurado, numerosDe } from './sms.mjs'

const para = process.argv[2] || numerosDe('SMS_DEST')[0]
const corpo = process.argv[3] || 'All4laser: teste de envio de SMS ✔'

if (!smsConfigurado()) {
  console.error('Twilio não configurado. Confirma TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no .env.local.')
  process.exit(1)
}
if (!para) {
  console.error('Falta o número. Passa-o como argumento (E.164, ex: +3519...) ou define SMS_DEST.')
  process.exit(1)
}

console.log(`A enviar SMS de teste para ${para}...`)
const ok = await enviarSms(para, corpo)
process.exit(ok ? 0 : 1)
