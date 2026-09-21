import { createClient } from '@supabase/supabase-js'

// Sincronização diária das tarefas de follow-up das leads (cron, GitHub Actions).
//   GET → protegida por CRON_SECRET. Chama a RPC leads_followup_cron(), que:
//         - reabre follow-ups concluídos/arquivados à mão enquanto a lead
//           continua em Contactada/Proposta enviada (o "adiar" é respeitado);
//         - mantém título/prazo; conclui os de leads ganhas/perdidas.
//   ?dryrun=1 → só conta quantas seriam reabertas, sem alterar nada.

export const runtime = 'nodejs'
export const maxDuration = 120

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
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'

  if (dryrun) {
    // Conta, sem alterar, os follow-ups que seriam reabertos (lead ativa + tarefa concluída/arquivada).
    const { count } = await db
      .from('user_tasks')
      .select('id, leads!inner(estado), user_task_assignees!inner(estado, arquivada_em)', { count: 'exact', head: true })
      .eq('tipo', 'lead_followup')
      .in('leads.estado', ['contactada', 'proposta_enviada'])
    return Response.json({ ok: true, dryrun: true, candidatos_aprox: count ?? 0 })
  }

  const { data, error } = await db.rpc('leads_followup_cron')
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
  const r = (Array.isArray(data) ? data[0] : data) as { processadas: number; reabertas: number } | null
  return Response.json({ ok: true, processadas: r?.processadas ?? 0, reabertas: r?.reabertas ?? 0 })
}
