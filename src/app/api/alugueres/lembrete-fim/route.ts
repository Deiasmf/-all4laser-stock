import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Lembrete de fim de aluguer mensal: avisa a Andreia por email quando um aluguer
// mensal (recorrente) está perto de terminar — ~30 dias antes da data de fim
// prevista, ou, se for aberto, ~60 dias antes de esgotar o horizonte de 12 meses
// (projeção). Corre por GitHub Actions (plano Hobby da Vercel limita crons),
// protegido por CRON_SECRET. ?dryrun=1 lista sem enviar nem marcar.

export const runtime = 'nodejs'
export const maxDuration = 60

const DESTINO = 'andreia.fernandes@all4laser.com'
const JANELA_COM_FIM = 30   // dias antes da data de fim prevista
const JANELA_ABERTO = 60    // dias antes de esgotar o horizonte de 12 meses

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}
function addMeses(iso: string, n: number): string {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}
function fmt(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

type AluguerRow = {
  id: string; cliente_nome: string | null; serial_number: string | null; modelo: string | null
  valor: number | null; data_entrega: string | null; data_fim_prevista: string | null
  lembrete_fim_enviado_em: string | null
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
  const hoje = new Date()

  const { data, error } = await sb
    .from('alugueres')
    .select('id, cliente_nome, serial_number, modelo, valor, data_entrega, data_fim_prevista, lembrete_fim_enviado_em')
    .eq('mensal', true)
    .is('data_recolha', null)
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })

  // Decide quais estão "a terminar" e ainda não foram avisados neste ciclo.
  const devidos: { row: AluguerRow; alvo: string; dias: number }[] = []
  for (const row of (data ?? []) as AluguerRow[]) {
    const temFim = !!row.data_fim_prevista
    const alvo = row.data_fim_prevista ?? (row.data_entrega ? addMeses(row.data_entrega, 12) : null)
    if (!alvo) continue
    const janela = temFim ? JANELA_COM_FIM : JANELA_ABERTO
    const dias = diasEntre(new Date(alvo), hoje)
    if (dias > janela) continue   // ainda longe
    // Re-arma: salta se já avisado dentro do ciclo deste alvo (~45 dias antes).
    if (row.lembrete_fim_enviado_em) {
      const avisado = new Date(row.lembrete_fim_enviado_em)
      if (diasEntre(new Date(alvo), avisado) <= janela + 15) continue
    }
    devidos.push({ row, alvo, dias })
  }

  if (dryrun) {
    return Response.json({ ok: true, dryrun: true, a_terminar: devidos.length, itens: devidos.map((d) => ({ cliente: d.row.cliente_nome, serial: d.row.serial_number, alvo: d.alvo, dias: d.dias })) })
  }
  if (devidos.length === 0) return Response.json({ ok: true, a_terminar: 0 })

  devidos.sort((a, b) => a.dias - b.dias)
  const linhas = devidos.map((d) => {
    const eq = [d.row.modelo, d.row.serial_number].filter(Boolean).join(' · ') || 'Equipamento'
    const quando = d.dias < 0 ? `terminou há ${-d.dias} dia(s)` : d.dias === 0 ? 'termina hoje' : `termina em ${d.dias} dia(s)`
    const aberto = d.row.data_fim_prevista ? '' : ' (aberto — horizonte 12 meses)'
    return `<li><strong>${d.row.cliente_nome ?? 'Cliente'}</strong> — ${eq} · ${d.row.valor ? d.row.valor + ' €/mês' : ''} · ${quando} (${fmt(d.alvo)})${aberto}</li>`
  }).join('')
  const html = `
    <p>Olá Andreia,</p>
    <p>Os seguintes alugueres mensais estão a terminar:</p>
    <ul>${linhas}</ul>
    <p>Confirma se vais <strong>renovar</strong> (atualizar a data de fim) ou <strong>recolher</strong> o equipamento, na Lista de Alugueres.</p>
    <p style="color:#888;font-size:12px">Aviso automático · All4laser</p>`

  const r = await enviarEmail({ para: DESTINO, assunto: `Alugueres a terminar (${devidos.length})`, html })
  if (!r.ok) return Response.json({ ok: false, erro: r.motivo ?? 'Falha no envio.' }, { status: 500 })

  const agora = new Date().toISOString()
  await sb.from('alugueres').update({ lembrete_fim_enviado_em: agora }).in('id', devidos.map((d) => d.row.id))
  return Response.json({ ok: true, avisados: devidos.length })
}
