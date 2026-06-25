// Lembretes de pagamento ao cliente para envios expedidos e não pagos.
// Corre 1x/dia (GitHub Action). Reenvia a cada 7 dias desde a expedição.
// Lê a BD via psql ($SUPABASE_DB_URL) e envia email pelo SendGrid.
import { execFileSync } from 'node:child_process'

const DB = process.env.SUPABASE_DB_URL
const KEY = process.env.SENDGRID_API_KEY
const FROM = process.env.EMAIL_FROM || 'All4laser <noreply@all4laser.com>'

const DADOS_BANCARIOS = `
  <p><strong>Dados para pagamento:</strong><br/>
  All4laser, Lda.<br/>
  Banco BPI<br/>
  IBAN: PT50 0010 0000 41011650001 65<br/>
  Por favor indique o número do envio na referência.</p>`

if (!DB) { console.error('Falta SUPABASE_DB_URL'); process.exit(1) }

// Expedidos, não pagos, com dias múltiplos de 7 (>=7) desde a expedição.
const SQL = `
select coalesce(json_agg(x), '[]') from (
  select e.numero, e.cliente_nome, e.cliente_email, e.valor_a_faturar,
    floor(extract(epoch from now() - e.expedido_em) / 86400)::int as dias
  from public.envios_pecas e
  where e.pago = false and e.estado = 'expedido'
    and e.expedido_em is not null
    and e.cliente_email is not null
    and floor(extract(epoch from now() - e.expedido_em) / 86400)::int > 0
    and floor(extract(epoch from now() - e.expedido_em) / 86400)::int % 7 = 0
) x;`

function consultar() {
  const out = execFileSync('psql', [DB, '-t', '-A', '-c', SQL], { encoding: 'utf8' })
  return JSON.parse(out.trim() || '[]')
}

function euro(v) {
  return v == null ? '—' : Number(v).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

async function enviar(e) {
  const html = `
    <h2>Lembrete de pagamento — All4laser</h2>
    <p>Olá ${e.cliente_nome ?? ''},</p>
    <p>O envio <strong>${e.numero}</strong> foi expedido há ${e.dias} dias e o pagamento de
    <strong>${euro(e.valor_a_faturar)}</strong> encontra-se pendente.</p>
    ${DADOS_BANCARIOS}
    <p>Se já efetuou o pagamento, por favor ignore este email.<br/>Obrigado,<br/>All4laser</p>`
  const body = {
    personalizations: [{ to: [{ email: e.cliente_email }] }],
    from: parseFrom(FROM),
    subject: `All4laser — pagamento pendente do envio ${e.numero}`,
    content: [{ type: 'text/html', value: html }],
  }
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) console.error(`Falha email ${e.numero}: ${r.status} ${await r.text()}`)
  else console.log(`Lembrete de pagamento (${e.dias}d) enviado: ${e.numero}`)
}

function parseFrom(s) {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { email: m[2].trim(), name: m[1] || undefined } : { email: s.trim() }
}

const envios = consultar()
console.log(`${envios.length} lembrete(s) de pagamento.`)
if (!KEY) { console.error('Falta SENDGRID_API_KEY — nada enviado.'); process.exit(envios.length ? 1 : 0) }
for (const e of envios) await enviar(e)
