import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Notificações dos alugueres internacionais, por email individual por evento.
// Pensado para um cron diário (Vercel Cron) — protegido por CRON_SECRET.
// Também corre à mão com ?secret=... para testar. Evita repetir eventos já
// enviados através da tabela alugueres_notificacoes (chave única por evento).
//
// Eventos:
//   • Pagamento em atraso >30 dias: um email por contrato a listar os meses
//     em atraso ainda não avisados.
//   • Fim de contrato a 60 / 30 / 15 dias: um email por contrato por limiar.

type Aluguer = {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  serial_number: string | null
  marca: string | null
  modelo: string | null
  data_entrega: string | null
  data_recolha: string | null
  valor: number | null
  created_at: string
}
type Fat = { aluguer_id: string; mes: string; pago: boolean; nao_faturar: boolean }

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

// Dias entre hoje (00:00) e uma data 'YYYY-MM-DD'. Positivo = futuro.
function diasAte(iso: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const alvo = new Date(y, m - 1, d); alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

function nomeMes(ym: string): string {
  const [a, m] = ym.split('-').map(Number)
  if (!a || !m) return ym
  return new Date(a, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}
function fmtData(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}
function euro(v: number | null): string {
  return `${(v ?? 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

const LIMIARES_FIM = [60, 30, 15]

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Dados: alugueres internacionais + faturação + notificações já enviadas.
  const { data: als } = await sb.from('alugueres').select('*').eq('nacional', false)
  const alugueres = (als as Aluguer[]) ?? []
  if (alugueres.length === 0) return Response.json({ ok: true, enviados: 0, motivo: 'Sem alugueres internacionais.' })

  const ids = alugueres.map((a) => a.id)
  const { data: fats } = await sb.from('alugueres_faturacao_mensal').select('aluguer_id, mes, pago, nao_faturar').in('aluguer_id', ids)
  const fatMap = new Map<string, Fat>()
  for (const f of (fats as Fat[]) ?? []) fatMap.set(`${f.aluguer_id}|${f.mes}`, f)

  const { data: nots } = await sb.from('alugueres_notificacoes').select('chave')
  const enviadas = new Set(((nots as { chave: string }[]) ?? []).map((n) => n.chave))

  // Destinatários: emails de perfis admin/financeiro.
  const { data: perfis } = await sb.from('profiles').select('email').in('role', ['admin', 'financeiro'])
  const destinatarios = ((perfis as { email: string | null }[]) ?? []).map((p) => p.email).filter((e): e is string => !!e)
  if (destinatarios.length === 0) return Response.json({ ok: false, erro: 'Sem destinatários.' }, { status: 400 })

  // Agrupar em contratos (cliente + serial + lote de criação).
  const grupos = new Map<string, Aluguer[]>()
  for (const a of alugueres) {
    const k = `${a.cliente_id ?? a.cliente_nome ?? ''}|${a.serial_number ?? ''}|${a.created_at}`
    const arr = grupos.get(k); if (arr) arr.push(a); else grupos.set(k, [a])
  }

  const novasChaves: string[] = []
  let enviados = 0
  const erros: string[] = []

  async function enviar(assunto: string, html: string, chaves: string[]) {
    const r = await enviarEmail({ para: destinatarios, assunto, html })
    if (!r.configurado) { erros.push('email não configurado'); return false }
    if (!r.ok) { erros.push(r.motivo ?? 'falha no envio'); return false }
    novasChaves.push(...chaves)
    enviados++
    return true
  }

  for (const [, meses] of grupos) {
    const ord = [...meses].sort((x, y) => (x.data_entrega ?? '').localeCompare(y.data_entrega ?? ''))
    const primeiro = ord[0]
    const ultimo = ord[ord.length - 1]
    const cliente = primeiro.cliente_nome ?? '—'
    const equip = [primeiro.marca, primeiro.modelo].filter(Boolean).join(' ') || '—'
    const serial = primeiro.serial_number ?? '—'

    // ── 1) Pagamentos em atraso (>30 dias) ainda não avisados ────────────────
    const atrasados = ord.filter((a) => {
      const em = (a.data_entrega ?? '').slice(0, 7)
      const f = fatMap.get(`${a.id}|${em}`)
      const porPagar = !f || (!f.pago && !f.nao_faturar)
      const atraso = a.data_entrega ? diasAte(a.data_entrega) < -30 : false
      return porPagar && atraso && !enviadas.has(`pag|${a.id}|${em}`)
    })
    if (atrasados.length > 0) {
      const linhas = atrasados.map((a) => {
        const em = (a.data_entrega ?? '').slice(0, 7)
        const dias = a.data_entrega ? -diasAte(a.data_entrega) : 0
        return `<tr><td style="padding:5px 10px;border-bottom:1px solid #eee;text-transform:capitalize">${nomeMes(em)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #eee">${euro(a.valor)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #eee">há ${dias} dias</td></tr>`
      }).join('')
      const html = `<div style="font-family:Arial,sans-serif;color:#222">
        <h2 style="color:#B91C1C">Pagamentos em atraso (contrato internacional)</h2>
        <p><strong>${cliente}</strong> · ${equip} · ${serial}</p>
        <table style="border-collapse:collapse;font-size:14px">
          <thead><tr style="background:#f4f4f4;text-align:left"><th style="padding:5px 10px">Mês</th><th style="padding:5px 10px">Valor</th><th style="padding:5px 10px">Atraso</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:18px">All4laser · Alugueres → Internacional.</p></div>`
      await enviar(`All4laser — Pagamentos em atraso: ${cliente} (${serial})`, html,
        atrasados.map((a) => `pag|${a.id}|${(a.data_entrega ?? '').slice(0, 7)}`))
    }

    // ── 2) Fim de contrato a 60 / 30 / 15 dias ───────────────────────────────
    const terminado = !!ultimo.data_recolha
    const fim = ultimo.data_entrega ? ultimo.data_entrega.slice(0, 10) : null
    if (!terminado && fim) {
      const dias = diasAte(fim)
      if (dias >= 0) {
        for (const T of LIMIARES_FIM) {
          const chave = `fim${T}|${ultimo.id}`
          if (dias <= T && !enviadas.has(chave)) {
            const html = `<div style="font-family:Arial,sans-serif;color:#222">
              <h2 style="color:#92400E">Contrato a terminar em ${dias} dia(s)</h2>
              <p>O contrato internacional abaixo termina a <strong>${fmtData(fim)}</strong> (faltam ${dias} dias).</p>
              <table style="border-collapse:collapse;font-size:14px">
                <tr><td style="padding:4px 10px;color:#666">Cliente</td><td style="padding:4px 10px"><strong>${cliente}</strong></td></tr>
                <tr><td style="padding:4px 10px;color:#666">Equipamento</td><td style="padding:4px 10px">${equip} · ${serial}</td></tr>
                <tr><td style="padding:4px 10px;color:#666">Valor mensal</td><td style="padding:4px 10px">${euro(primeiro.valor)}</td></tr>
              </table>
              <p style="font-size:13px">Ações possíveis: finalizar, renovar ou avançar para venda — em Alugueres → Internacional.</p>
              <p style="color:#888;font-size:12px;margin-top:14px">All4laser · gerado automaticamente.</p></div>`
            await enviar(`All4laser — Contrato a terminar (${dias} dias): ${cliente} (${serial})`, html, [chave])
            break // um email por contrato por corrida (o limiar mais próximo)
          }
        }
      }
    }
  }

  if (novasChaves.length > 0) {
    await sb.from('alugueres_notificacoes').insert(novasChaves.map((chave) => ({ chave })))
  }

  return Response.json({ ok: true, enviados, novos_eventos: novasChaves.length, erros: erros.length ? erros : undefined })
}
