// Envia a fatura de um aluguer ao cliente, por email, com o ficheiro em anexo.
// Usa o helper de email (SendGrid). Só envia se o email estiver configurado
// (SENDGRID_API_KEY); caso contrário responde sem enviar, com um motivo claro
// para a interface mostrar.

import { enviarEmail } from '@/lib/email'

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

  // Buscar o ficheiro da fatura e converter para base64 (anexo)
  let conteudoBase64: string
  try {
    const res = await fetch(faturaUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    conteudoBase64 = buf.toString('base64')
  } catch {
    return Response.json({ ok: false, enviado: false, motivo: 'Não foi possível obter o ficheiro da fatura.' }, { status: 502 })
  }

  const tipo = faturaNome.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'

  const html = `
    <p>Estimado(a) ${clienteNome},</p>
    <p>Segue em anexo a fatura referente ao aluguer.</p>
    <p>Com os melhores cumprimentos,<br/>All4laser</p>
  `

  const resultado = await enviarEmail({
    para,
    assunto: 'Fatura — All4laser',
    html,
    anexos: [{ filename: faturaNome, contentBase64: conteudoBase64, type: tipo }],
  })

  if (!resultado.configurado) {
    // Email ainda não configurado (SendGrid) — não marca como enviada.
    return Response.json({ ok: false, enviado: false, motivo: resultado.motivo })
  }
  if (!resultado.ok) {
    return Response.json({ ok: false, enviado: false, motivo: resultado.motivo }, { status: 502 })
  }
  return Response.json({ ok: true, enviado: true })
}
