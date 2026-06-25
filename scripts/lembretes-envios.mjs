// Lembretes de envios de peças em aberto (24h e 48h).
// Corre de hora a hora (GitHub Action). Lê a BD via psql ($SUPABASE_DB_URL) e
// envia email pela API do SendGrid ($SENDGRID_API_KEY / $EMAIL_FROM).
import { execFileSync } from 'node:child_process'

const DB = process.env.SUPABASE_DB_URL
const KEY = process.env.SENDGRID_API_KEY
const FROM = process.env.EMAIL_FROM || 'All4laser <noreply@all4laser.com>'
const APP = (process.env.APP_URL || 'https://app.all4laser.com').replace(/\/$/, '')
const DEST = ['sara.evaristo@all4laser.com', 'rafael.santana@all4laser.com', 'andreia.fernandes@all4laser.com']

if (!DB) { console.error('Falta SUPABASE_DB_URL'); process.exit(1) }

// Janela de 1h: apanha cada envio uma vez no marco das 24h e outra no das 48h.
const SQL = `
select coalesce(json_agg(x), '[]') from (
  select e.id, e.numero, e.cliente_nome,
    case when now() - e.created_at >= interval '48 hour' then '48h' else '24h' end as marco,
    coalesce(string_agg(i.peca_nome || ' (x' || i.quantidade || ')', ', '), '—') as itens
  from public.envios_pecas e
  left join public.envios_pecas_itens i on i.envio_id = e.id
  where e.estado = 'aberto'
    and (
      (now() - e.created_at >= interval '24 hour' and now() - e.created_at < interval '25 hour')
      or (now() - e.created_at >= interval '48 hour' and now() - e.created_at < interval '49 hour')
    )
  group by e.id
) x;`

function consultar() {
  const out = execFileSync('psql', [DB, '-t', '-A', '-c', SQL], { encoding: 'utf8' })
  return JSON.parse(out.trim() || '[]')
}

async function enviar(envio) {
  const link = `${APP}/logistico/envios-pecas/${envio.id}`
  const html = `
    <h2>Envio de peças ${envio.marco} em aberto</h2>
    <p><strong>${envio.numero}</strong> — ${envio.cliente_nome ?? '—'}</p>
    <p><strong>Itens:</strong> ${envio.itens}</p>
    <p>Está em aberto há ${envio.marco}. <a href="${link}">Abrir na app</a></p>`
  const body = {
    personalizations: [{ to: DEST.map((email) => ({ email })) }],
    from: parseFrom(FROM),
    subject: `Envio ${envio.numero} em aberto há ${envio.marco}`,
    content: [{ type: 'text/html', value: html }],
  }
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) console.error(`Falha email ${envio.numero}: ${r.status} ${await r.text()}`)
  else console.log(`Lembrete ${envio.marco} enviado: ${envio.numero}`)
}

function parseFrom(s) {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { email: m[2].trim(), name: m[1] || undefined } : { email: s.trim() }
}

const envios = consultar()
console.log(`${envios.length} envio(s) a lembrar.`)
if (!KEY) { console.error('Falta SENDGRID_API_KEY — nada enviado.'); process.exit(envios.length ? 1 : 0) }
for (const e of envios) await enviar(e)
