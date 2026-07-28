// Notifica (por email) o admin/financeiro de que um contrato internacional foi
// sinalizado para avançar para venda. Não mexe no inventário — só avisa.
// Segue o padrão das outras rotas de email (SendGrid via helper).

import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

export async function POST(req: Request) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ ok: false, enviado: false, motivo: 'JSON inválido' }, { status: 400 })
  }

  const clienteNome = String(corpo.clienteNome ?? '—')
  const equipamento = String(corpo.equipamento ?? '—')
  const serial = String(corpo.serial ?? '—')
  const fim = String(corpo.fim ?? '—')
  const porNome = String(corpo.porNome ?? '')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, enviado: false, motivo: 'Servidor mal configurado.' }, { status: 500 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: perfis } = await sb.from('profiles').select('email').in('role', ['admin', 'financeiro'])
  const destinatarios = ((perfis as { email: string | null }[]) ?? []).map((p) => p.email).filter((e): e is string => !!e)
  if (destinatarios.length === 0) return Response.json({ ok: false, enviado: false, motivo: 'Sem destinatários.' }, { status: 400 })

  const html = `<div style="font-family:Arial,sans-serif;color:#222">
    <h2 style="color:#0d0b2b">Contrato a avançar para venda</h2>
    <p>O contrato internacional abaixo foi sinalizado para <strong>avançar para venda</strong>${porNome ? ` por ${porNome}` : ''}.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 10px;color:#666">Cliente</td><td style="padding:4px 10px"><strong>${clienteNome}</strong></td></tr>
      <tr><td style="padding:4px 10px;color:#666">Equipamento</td><td style="padding:4px 10px">${equipamento}</td></tr>
      <tr><td style="padding:4px 10px;color:#666">Serial</td><td style="padding:4px 10px">${serial}</td></tr>
      <tr><td style="padding:4px 10px;color:#666">Fim do contrato</td><td style="padding:4px 10px">${fim}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:18px">All4laser · Alugueres → Internacional.</p>
  </div>`

  const r = await enviarEmail({
    para: destinatarios,
    assunto: `All4laser — Avançar para venda: ${clienteNome} (${serial})`,
    html,
  })
  if (!r.configurado) return Response.json({ ok: false, enviado: false, motivo: r.motivo })
  if (!r.ok) return Response.json({ ok: false, enviado: false, motivo: r.motivo }, { status: 502 })
  return Response.json({ ok: true, enviado: true, destinatarios: destinatarios.length })
}
