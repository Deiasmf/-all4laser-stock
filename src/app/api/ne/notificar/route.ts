// Envia o email de mudança de fase de uma Nota de Encomenda aos responsáveis
// da fase seguinte. Só envia se o Resend estiver configurado (RESEND_API_KEY);
// caso contrário responde ok sem enviar. As notificações in-app (comunicados)
// são criadas no cliente e não dependem disto.

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

  const key = process.env.RESEND_API_KEY
  if (!key) return Response.json({ ok: true, enviado: false }) // email desligado até a chave existir

  const from = process.env.RESEND_FROM ?? 'All4laser <noreply@all4laser.com>'
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.all4laser.com'
  const link = `${base}${pagina}`

  const html = `
    <h2>Nota de Encomenda ${numero} — ${faseLabel}</h2>
    <p>Há um equipamento pronto para a fase: <strong>${faseLabel}</strong>.</p>
    <p><strong>Equipamento:</strong> ${equipamento}</p>
    <p><strong>Cliente:</strong> ${cliente}</p>
    <p><a href="${link}">Abrir na plataforma</a></p>
  `

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: para, subject: `NE ${numero} — ${faseLabel}`, html }),
    })
    return Response.json({ ok: r.ok, enviado: r.ok })
  } catch {
    return Response.json({ ok: false, enviado: false }, { status: 500 })
  }
}
