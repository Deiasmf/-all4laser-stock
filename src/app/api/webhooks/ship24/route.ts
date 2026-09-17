import { parsearWebhook } from '@/lib/trackingProvider'
import { dbService, resolverEnvio, aplicarResultado, marcarWebhookRecebido } from '@/lib/trackingAuto'

// Webhook do Ship24: recebe atualizações de tracking e aplica-as aos envios.
//   Autenticidade: o Ship24 envia `Authorization: Bearer <Webhook Secret>` em
//   cada pedido — validamos contra SHIP24_WEBHOOK_SECRET. Pedidos não validados
//   são rejeitados (401).
//   Idempotência: cada evento traz eventId; aplicarResultado não duplica.
// Configurar o URL no dashboard do Ship24:
//   https://app.all4laser.com/api/webhooks/ship24

export const runtime = 'nodejs'
export const maxDuration = 60

function autorizado(req: Request): boolean {
  const segredo = process.env.SHIP24_WEBHOOK_SECRET
  if (!segredo) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${segredo}`
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Webhook não autorizado.' }, { status: 401 })
  }
  const sb = dbService()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  let body: unknown
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'Corpo inválido.' }, { status: 400 }) }

  const trackings = parsearWebhook(body)
  let aplicados = 0, novos = 0, semEnvio = 0
  for (const t of trackings) {
    const envio = await resolverEnvio(sb, { clientTrackerId: t.clientTrackerId, trackerId: t.trackerId, trackingNumber: t.trackingNumber })
    if (!envio) { semEnvio++; continue }
    const r = await aplicarResultado(sb, envio, t.resultado, 'webhook')
    aplicados++; novos += r.novos
  }
  await marcarWebhookRecebido(sb)

  // Sempre 2xx quando autenticado (o Ship24 reenvia se não for 2xx).
  return Response.json({ ok: true, trackings: trackings.length, aplicados, novos, semEnvio })
}
