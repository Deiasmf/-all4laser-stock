// Envia a fatura de um aluguer ao cliente, por email, com o ficheiro em anexo.
// Usa o Resend (mesmo padrão de /api/ne/notificar). Só envia se a
// RESEND_API_KEY estiver configurada; caso contrário responde sem enviar,
// com um motivo claro para a interface mostrar.

export async function POST(req: Request) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ ok: false, enviado: false, motivo: 'JSON inválido' }, { status: 400 })
  }

  const para = String(corpo.para ?? '').trim()
  const clienteNome = String(corpo.clienteNome ?? 'cliente')
  const faturaUrl = String(corpo.faturaUrl ?? '')
  const faturaNome = String(corpo.faturaNome ?? 'fatura')

  if (!para || !para.includes('@')) {
    return Response.json({ ok: false, enviado: false, motivo: 'Email do cliente inválido.' }, { status: 400 })
  }
  if (!faturaUrl) {
    return Response.json({ ok: false, enviado: false, motivo: 'Fatura sem ficheiro.' }, { status: 400 })
  }

  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Email ainda não configurado (Resend / verificação de domínio pendente)
    return Response.json({ ok: false, enviado: false, motivo: 'O envio de email ainda não está configurado (Resend).' })
  }

  const from = process.env.RESEND_FROM ?? 'All4laser <noreply@all4laser.com>'

  // Buscar o ficheiro da fatura e converter para base64 (anexo do Resend)
  let conteudoBase64: string
  try {
    const res = await fetch(faturaUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    conteudoBase64 = buf.toString('base64')
  } catch {
    return Response.json({ ok: false, enviado: false, motivo: 'Não foi possível obter o ficheiro da fatura.' }, { status: 502 })
  }

  const html = `
    <p>Estimado(a) ${clienteNome},</p>
    <p>Segue em anexo a fatura referente ao aluguer.</p>
    <p>Com os melhores cumprimentos,<br/>All4laser</p>
  `

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [para],
        subject: 'Fatura — All4laser',
        html,
        attachments: [{ filename: faturaNome, content: conteudoBase64 }],
      }),
    })
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      return Response.json({ ok: false, enviado: false, motivo: `O envio falhou no Resend. ${detalhe}`.trim() }, { status: 502 })
    }
    return Response.json({ ok: true, enviado: true })
  } catch {
    return Response.json({ ok: false, enviado: false, motivo: 'Erro de rede ao enviar o email.' }, { status: 500 })
  }
}
