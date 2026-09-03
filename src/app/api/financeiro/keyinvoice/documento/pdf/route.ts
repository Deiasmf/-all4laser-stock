import { exigirFinanceiro } from '@/lib/financeiroApiAuth'
import { obterDocumentoPdfBase64, parseKiDocId } from '@/lib/keyinvoiceApi'

// PDF de uma fatura do Keyinvoice, já descodificado (application/pdf) para
// pré-visualização no painel de detalhe. O browser busca-o com fetch + token e
// mostra-o via blob URL (o iframe não envia o header de sessão sozinho).

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const auth = await exigirFinanceiro(req)
  if (!auth.ok) return auth.resposta

  const id = new URL(req.url).searchParams.get('id') ?? ''
  const ref = parseKiDocId(id)
  if (!ref) return Response.json({ ok: false, erro: 'PDF indisponível para este documento.' }, { status: 400 })

  let base64: string
  try {
    base64 = await obterDocumentoPdfBase64(ref.docType, ref.docNum, ref.docSeries)
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha a obter o PDF.' }, { status: 502 })
  }
  if (!base64) return Response.json({ ok: false, erro: 'Sem PDF para este documento.' }, { status: 404 })

  const bytes = Buffer.from(base64, 'base64')
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${ref.docType}-${ref.docSeries}-${ref.docNum}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
