import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Resumo semanal de clientes inativos (não alugam há X dias) por email para o
// financeiro/comercial. Pensado para ser chamado por um cron (Vercel Cron,
// segunda de manhã) — protegido por CRON_SECRET. Também pode ser chamado à mão
// com ?secret=... para testar.

type Linha = {
  cliente_nome: string
  email: string | null
  telefone: string | null
  ultimo_fim: string
  modelo: string | null
  marca: string | null
  dias_inatividade: number
  silenciado_ate: string | null
}

const hoje = () => new Date().toISOString().slice(0, 10)

// Falha fechada: sem CRON_SECRET definido, a rota não corre (evita exposição).
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: s } = await sb.from('client_inactivity_settings').select('*').eq('id', 1).single()
  const diasAtencao = s?.dias_atencao ?? 30
  const diasCritico = s?.dias_critico ?? 45
  if (s && s.email_resumo_ativo === false) return Response.json({ ok: true, enviado: false, motivo: 'Resumo desativado nas definições.' })

  const { data: rows } = await sb.from('client_rental_inactivity').select('*').gte('dias_inatividade', diasAtencao)
  const linhas = ((rows as Linha[]) ?? []).filter((l) => !(l.silenciado_ate && l.silenciado_ate >= hoje()))
  const criticos = linhas.filter((l) => l.dias_inatividade >= diasCritico).sort((a, b) => b.dias_inatividade - a.dias_inatividade)
  const atencoes = linhas.filter((l) => l.dias_inatividade < diasCritico).sort((a, b) => b.dias_inatividade - a.dias_inatividade)

  if (linhas.length === 0) return Response.json({ ok: true, enviado: false, motivo: 'Sem clientes inativos.' })

  // Destinatários: definição manual, senão emails de perfis admin/financeiro.
  let destinatarios = (s?.email_destinatarios ?? '').split(',').map((e: string) => e.trim()).filter(Boolean)
  if (destinatarios.length === 0) {
    const { data: perfis } = await sb.from('profiles').select('email').in('role', ['admin', 'financeiro'])
    destinatarios = ((perfis as { email: string | null }[]) ?? []).map((p) => p.email).filter((e): e is string => !!e)
  }
  if (destinatarios.length === 0) return Response.json({ ok: false, erro: 'Sem destinatários.' }, { status: 400 })

  const html = montarHtml(criticos, atencoes, diasAtencao, diasCritico)
  const r = await enviarEmail({
    para: destinatarios,
    assunto: `All4laser — Clientes inativos: ${criticos.length} críticos, ${atencoes.length} em atenção`,
    html,
  })
  if (!r.configurado) return Response.json({ ok: false, enviado: false, erro: r.motivo }, { status: 200 })
  if (!r.ok) return Response.json({ ok: false, enviado: false, erro: r.motivo }, { status: 502 })
  return Response.json({ ok: true, enviado: true, criticos: criticos.length, atencao: atencoes.length, destinatarios: destinatarios.length })
}

function linhaHtml(l: Linha) {
  const eq = [l.marca, l.modelo].filter(Boolean).join(' ') || '—'
  const contacto = [l.telefone, l.email].filter(Boolean).join(' · ') || '—'
  const [a, m, d] = l.ultimo_fim.split('-')
  return `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #eee">${l.cliente_nome}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center"><strong>${l.dias_inatividade}</strong></td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee">${d}/${m}/${a}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee">${eq}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #eee">${contacto}</td>
  </tr>`
}

function tabela(titulo: string, cor: string, linhas: Linha[]): string {
  if (linhas.length === 0) return ''
  return `<h3 style="color:${cor};margin:18px 0 6px">${titulo} (${linhas.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f4f4f4;text-align:left">
        <th style="padding:6px 10px">Cliente</th><th style="padding:6px 10px">Dias</th>
        <th style="padding:6px 10px">Último aluguer</th><th style="padding:6px 10px">Equipamento</th>
        <th style="padding:6px 10px">Contacto</th>
      </tr></thead>
      <tbody>${linhas.map(linhaHtml).join('')}</tbody>
    </table>`
}

function montarHtml(criticos: Linha[], atencoes: Linha[], da: number, dc: number): string {
  return `<div style="font-family:Arial,sans-serif;color:#222">
    <h2 style="color:#0d0b2b">Clientes inativos — resumo semanal</h2>
    <p>Clientes com histórico de alugueres que não alugam há mais de ${da} dias.</p>
    ${tabela(`🔴 Crítico (≥${dc} dias)`, '#B91C1C', criticos)}
    ${tabela(`🟡 Atenção (≥${da} dias)`, '#92400E', atencoes)}
    <p style="color:#888;font-size:12px;margin-top:18px">All4laser · gerado automaticamente. Silencia ou arquiva clientes na plataforma (Alugueres → Clientes Inativos).</p>
  </div>`
}
