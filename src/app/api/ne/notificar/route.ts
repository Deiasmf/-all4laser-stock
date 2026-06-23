// Envia o email de mudança de fase de uma Nota de Encomenda aos responsáveis
// da fase seguinte. Só envia se o email estiver configurado (SENDGRID_API_KEY);
// caso contrário responde ok sem enviar. As notificações in-app (comunicados)
// são criadas no cliente e não dependem disto.

import { enviarEmail } from '@/lib/email'

export async function POST(req: Request) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }

  const para = Array.isArray(corpo.para) ? (corpo.para as unknown[]).map(String).filter(Boolean) : []
  const faseLabel = String(corpo.faseLabel ?? 'próxima fase')
  const numero = String(corpo.numero ?? '')
  const equipamento = String(corpo.equipamento ?? '—')
  const cliente = String(corpo.cliente ?? '—')
  const pagina = String(corpo.pagina ?? '/')

  if (para.length === 0) return Response.json({ ok: true, enviado: false })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.all4laser.com'
  const link = `${base}${pagina}`

  const html = `
    <h2>Nota de Encomenda ${numero} — ${faseLabel}</h2>
    <p>Há um equipamento pronto para a fase: <strong>${faseLabel}</strong>.</p>
    <p><strong>Equipamento:</strong> ${equipamento}</p>
    <p><strong>Cliente:</strong> ${cliente}</p>
    <p><a href="${link}">Abrir na plataforma</a></p>
  `

  const resultado = await enviarEmail({ para, assunto: `NE ${numero} — ${faseLabel}`, html })
  return Response.json({ ok: resultado.ok || !resultado.configurado, enviado: resultado.ok })
}
