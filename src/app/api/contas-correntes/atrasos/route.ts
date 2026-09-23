import { createClient } from '@supabase/supabase-js'

// Job diário das Contas Correntes: marca como atrasadas as prestações vencidas e
// ainda pendentes (função SQL cc_marcar_atrasos). Corre por GitHub Actions (o
// plano Hobby da Vercel limita os crons), protegido por CRON_SECRET.
//   GET → corrida automática. Ex.: ?dryrun=1 só conta, sem marcar.
// A função é SECURITY DEFINER e, em contexto de serviço (sem auth.uid()), corre
// sem exigir is_staff().

export const runtime = 'nodejs'
export const maxDuration = 60

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'
  if (dryrun) {
    const { count, error } = await sb
      .from('cc_prestacoes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendente')
      .lt('data_vencimento', new Date().toISOString().slice(0, 10))
    if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
    return Response.json({ ok: true, dryrun: true, por_marcar: count ?? 0 })
  }

  const { data, error } = await sb.rpc('cc_marcar_atrasos')
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
  return Response.json({ ok: true, marcadas: Number(data ?? 0) })
}
