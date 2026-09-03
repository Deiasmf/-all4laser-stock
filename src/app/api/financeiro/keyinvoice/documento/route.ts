import { exigirFinanceiro } from '@/lib/financeiroApiAuth'
import { obterDocumento, parseKiDocId, type DocLinha } from '@/lib/keyinvoiceApi'

// Detalhe de uma fatura sincronizada do Keyinvoice: linhas (descrição/qtd/valor)
// para catalogar com contexto. Grava também a descrição concatenada em
// financeiro_movimentos.descricao (as regras de categorização por descrição e a
// pesquisa por conteúdo passam a ter dados). A chave da API fica no servidor.

export const runtime = 'nodejs'
export const maxDuration = 60

// Descrição legível de uma linha (nome do produto).
function descricaoLinha(l: DocLinha): string {
  return String(l.ProductName ?? l.IdProduct ?? '').trim()
}

export async function GET(req: Request) {
  const auth = await exigirFinanceiro(req)
  if (!auth.ok) return auth.resposta

  const id = new URL(req.url).searchParams.get('id') ?? ''
  const ref = parseKiDocId(id)
  if (!ref) {
    return Response.json({ ok: false, erro: 'Documento sem detalhe disponível (não é do Keyinvoice).' }, { status: 400 })
  }

  let doc
  try {
    doc = await obterDocumento(ref.docType, ref.docNum, ref.docSeries)
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha a obter o documento.' }, { status: 502 })
  }

  const linhas = (doc.Lines ?? []).map((l) => ({
    descricao: descricaoLinha(l),
    idProduto: l.IdProduct ?? null,
    qtd: Number(l.Qty ?? 0) || 0,
    precoUnit: Number(l.UnitPrice ?? 0) || 0,
    desconto: Number(l.Discount ?? 0) || 0,
    iva: Number(l.TaxValue ?? 0) || 0,
    valor: Number(l.NetValue ?? 0) || 0,
  }))

  // Descrição concatenada das linhas + líquido sem IVA → persiste no movimento
  // (idempotente). O líquido é a base das comissões técnicas.
  const descricao = linhas.map((l) => l.descricao).filter(Boolean).join(' | ') || null
  const liquido = Number(doc.NetTotal)
  const patch: Record<string, unknown> = {}
  if (descricao) patch.descricao = descricao
  if (!isNaN(liquido)) patch.valor_liquido = liquido
  if (Object.keys(patch).length > 0) {
    await auth.sb.from('financeiro_movimentos').update(patch).eq('keyinvoice_doc_id', id)
  }

  return Response.json({ ok: true, linhas, descricao, valor_liquido: isNaN(liquido) ? null : liquido })
}
