import { dbService, correrCron } from '@/lib/trackingAuto'

// Cron de reconciliação do tracking (Vercel Cron, diário).
//   GET protegido por CRON_SECRET: regista os envios ativos ainda sem tracker e
//   confirma o estado dos já registados no Ship24 (apanha webhooks perdidos),
//   respeitando o rate limit da API. Atualiza o estado da integração.
// Corre só se a integração estiver ativa e houver SHIP24_API_KEY.

export const runtime = 'nodejs'
export const maxDuration = 300

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }
  const sb = dbService()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  const r = await correrCron(sb)
  return Response.json(r)
}
