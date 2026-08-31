import { enviarEmail } from '@/lib/email'

// Envia por email uma tabela do Financeiro já exportada no cliente (Excel/PDF),
// como anexo. O ficheiro chega em base64 para evitar re-gerar no servidor.

type Corpo = {
  para?: string
  assunto?: string
  mensagem?: string
  filename?: string
  contentBase64?: string
  type?: string
}

export async function POST(req: Request) {
  let corpo: Corpo
  try {
    corpo = (await req.json()) as Corpo
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }

  const para = (corpo.para ?? '').trim()
  const assunto = (corpo.assunto ?? '').trim() || 'Tabela — All4laser'
  const filename = (corpo.filename ?? 'tabela').trim()
  const contentBase64 = corpo.contentBase64 ?? ''
  const type = corpo.type ?? 'application/octet-stream'

  if (!para) return Response.json({ ok: false, erro: 'Indica o email do destinatário.' }, { status: 400 })
  if (!contentBase64) return Response.json({ ok: false, erro: 'Sem ficheiro para enviar.' }, { status: 400 })

  const mensagemHtml = (corpo.mensagem ?? '').trim()
    ? `<p>${(corpo.mensagem ?? '').trim().replace(/\n/g, '<br/>')}</p>`
    : '<p>Em anexo segue a tabela.</p>'

  const html = `
    ${mensagemHtml}
    <p>Com os melhores cumprimentos,<br/>All4laser</p>
  `

  const r = await enviarEmail({
    para,
    assunto,
    html,
    anexos: [{ filename, contentBase64, type }],
  })

  if (!r.ok) return Response.json({ ok: false, erro: r.motivo ?? 'Falha no envio.' }, { status: 502 })
  return Response.json({ ok: true })
}
