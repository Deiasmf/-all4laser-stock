import { supabase } from './supabase'
import { obterProduto, listarHandpieces, listarAcessorios } from './fichaProduto'
import { gerarPdfFichaProduto, type IdiomaFicha } from './fichaProdutoPdf'

// Reúne os dados atuais do equipamento e gera o PDF da ficha de produto.
// Partilhado pelo "Gerar" (download) e pelo "Enviar" (anexo do email).
export async function gerarFichaBlob(params: {
  equipamentoId: string
  idioma: IdiomaFicha
  marca: string | null
  modelo: string | null
  ano: string | null
  serialNumber: string | null
  precoVenda: number | null
  incluirPreco: boolean
  incluirSnCompleto: boolean
  moeda?: string
  garantia?: string | null       // texto (null/vazio = não incluir)
  shippingTraining?: boolean
}): Promise<{ blob: Blob; nomeFicheiro: string }> {
  const { equipamentoId, idioma, marca, modelo, ano, serialNumber, precoVenda, incluirPreco, incluirSnCompleto } = params
  const [produto, handpieces, acess, mediaR] = await Promise.all([
    obterProduto(equipamentoId),
    listarHandpieces(equipamentoId),
    listarAcessorios(equipamentoId),
    supabase.from('media').select('url, capa, ordem, tipo, created_at')
      .eq('equipamento_id', equipamentoId).or('tipo.is.null,tipo.eq.foto'),
  ])
  const fotos = ((mediaR.data as { url: string; capa: boolean | null; ordem: number | null; created_at: string }[]) ?? [])
    .sort((a, b) => (Number(b.capa) - Number(a.capa)) || ((a.ordem ?? 0) - (b.ordem ?? 0)) || a.created_at.localeCompare(b.created_at))
    .map((m) => m.url)

  const blob = await gerarPdfFichaProduto({
    idioma, marca, modelo, ano,
    serialCompleto: serialNumber, incluirSnCompleto,
    condicao: produto?.condicao ?? null,
    condicaoDescricao: produto?.condicao_descricao ?? null,
    voltagem: produto?.voltagem ?? null,
    frequencia: produto?.frequencia ?? null,
    dimensoes: produto?.dimensoes ?? null,
    pesoKg: produto?.peso_kg ?? null,
    softwareVersao: produto?.software_versao ?? null,
    handpieces: handpieces.map((h) => ({ nome: h.nome, contador_pulsos: h.contador_pulsos, data_leitura: h.data_leitura })),
    acessorios: acess.map((a) => a.descricao),
    preco: incluirPreco ? precoVenda : null,
    moeda: params.moeda || 'EUR',
    garantia: params.garantia?.trim() ? params.garantia.trim() : null,
    shippingTraining: !!params.shippingTraining,
    fotos,
  })
  const nomeFicheiro = `All4laser - ${[marca, modelo, ano].filter(Boolean).join(' ')} - Ref ${equipamentoId.slice(0, 8)}`
  return { blob, nomeFicheiro }
}

// Converte um Blob de PDF em base64 puro (sem o prefixo data:).
export async function blobParaBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : '')
    fr.onerror = () => reject(new Error('Falha a ler o PDF.'))
    fr.readAsDataURL(blob)
  })
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}
