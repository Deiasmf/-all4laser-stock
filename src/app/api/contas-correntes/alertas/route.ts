import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Job diário: alertas das Contas Correntes por email interno. Lê a view
// v_cc_alertas (service role → RLS bypass) e, se houver alertas, envia um resumo
// aos utilizadores admin/financeiro. Protegido por CRON_SECRET. ?dryrun=1 só conta.

export const runtime = 'nodejs'
export const maxDuration = 60

type Alerta = {
  conta_id: string; conta_nome: string; tipo: string; severidade: string
  mensagem: string; valor: number | null; moeda: string
}

const LABEL: Record<string, string> = {
  prestacao_atrasada: 'Prestação atrasada', venda_por_receber: 'Venda por receber',
  maquina_parada: 'Máquina parada no parceiro', reconciliacao_atraso: 'Reconciliação em atraso',
  saldo_acima_limite: 'Saldo acima do limite',
}

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }
  const sb = db()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const { data, error } = await sb.from('v_cc_alertas').select('*')
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
  const alertas = (data ?? []) as Alerta[]

  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'
  if (dryrun) return Response.json({ ok: true, dryrun: true, alertas: alertas.length })
  if (alertas.length === 0) return Response.json({ ok: true, alertas: 0, motivo: 'Sem alertas hoje.' })

  // Destinatários internos: admin + financeiro.
  const { data: perfis } = await sb.from('profiles').select('email').in('role', ['admin', 'financeiro'])
  const emails = ((perfis ?? []) as { email: string | null }[]).map((p) => p.email).filter((e): e is string => !!e)
  if (emails.length === 0) return Response.json({ ok: true, alertas: alertas.length, motivo: 'Sem destinatários (admin/financeiro).' })

  // Agrupa por conta.
  const porConta = new Map<string, Alerta[]>()
  for (const a of alertas) {
    const arr = porConta.get(a.conta_nome) ?? []
    arr.push(a); porConta.set(a.conta_nome, arr)
  }
  const seccoes = [...porConta.entries()].map(([conta, as]) => `
    <div style="margin-bottom:14px">
      <div style="font-weight:700;color:#111">${conta}</div>
      <ul style="margin:6px 0;padding-left:18px">
        ${as.map((a) => `<li style="margin:3px 0"><strong style="color:${a.severidade === 'alta' ? '#B91C1C' : '#B45309'}">${LABEL[a.tipo] ?? a.tipo}</strong> — ${a.mensagem}</li>`).join('')}
      </ul>
    </div>`).join('')

  const html = `<div style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.5">
    <p>Resumo diário de alertas das Contas Correntes — <strong>${alertas.length}</strong> alerta(s):</p>
    ${seccoes}
    <p style="color:#888;font-size:12px;margin-top:16px">Gerado automaticamente. Vê o detalhe em Contas Correntes · Cashflow.</p>
  </div>`

  const r = await enviarEmail({ para: emails, assunto: `Contas Correntes — ${alertas.length} alerta(s)`, html })
  return Response.json({ ok: r.ok, alertas: alertas.length, emailEnviado: r.ok, destinatarios: emails.length, motivoEmail: r.ok ? null : r.motivo ?? null })
}
