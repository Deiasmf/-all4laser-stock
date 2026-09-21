import { createClient } from '@supabase/supabase-js'
import { correrLembretes } from '@/lib/pedidosFaturaServer'

// Cron: lembretes de pedidos de fatura parados há mais de N horas úteis
// (configurável). Protegida por CRON_SECRET. ?dryrun=1 calcula sem enviar.
export const runtime = 'nodejs'
export const maxDuration = 120

function autorizado(req: Request): boolean {
  const s = process.env.CRON_SECRET
  if (!s) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${s}`) return true
  return new URL(req.url).searchParams.get('secret') === s
}

export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'
  const r = await correrLembretes(db, dryrun)
  return Response.json({ ok: true, dryrun, ...r })
}
