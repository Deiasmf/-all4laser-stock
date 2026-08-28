import { supabase } from './supabase'
import { obterProduto, listarHandpieces, listarAcessorios, obterConfigFicha, obterDescricaoModelo } from './fichaProduto'
import { gerarPdfFichaProduto, type IdiomaFicha } from './fichaProdutoPdf'
import { traduzirTextos } from './traducao'

// Tradução (já revista) dos campos de texto livre, para não voltar a traduzir.
export type TraducaoFicha = { condicao?: string | null; condicaoDescricao?: string | null; acessorios?: string[] }

// Prepara os campos de texto livre + tradução (para rever antes de gerar).
export async function prepararTraducaoFicha(equipamentoId: string, idioma: IdiomaFicha) {
  const [produto, acess] = await Promise.all([obterProduto(equipamentoId), listarAcessorios(equipamentoId)])
  const condicao = produto?.condicao ?? ''
  const condicaoDescricao = produto?.condicao_descricao ?? ''
  const acessorios = acess.map((a) => a.descricao)
  const trad = await traduzirTextos([condicao, condicaoDescricao, ...acessorios], idioma)
  return {
    condicao: { orig: condicao, trad: trad[0] ?? condicao },
    condicaoDescricao: { orig: condicaoDescricao, trad: trad[1] ?? condicaoDescricao },
    acessorios: acessorios.map((a, i) => ({ orig: a, trad: trad[2 + i] ?? a })),
  }
}

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
  traducao?: TraducaoFicha       // tradução já revista (evita retraduzir)
}): Promise<{ blob: Blob; nomeFicheiro: string }> {
  const { equipamentoId, idioma, marca, modelo, ano, serialNumber, precoVenda, incluirPreco, incluirSnCompleto } = params
  const [produto, handpieces, acess, mediaR, cfg, descModelo] = await Promise.all([
    obterProduto(equipamentoId),
    listarHandpieces(equipamentoId),
    listarAcessorios(equipamentoId),
    supabase.from('media').select('url, capa, ordem, tipo, created_at')
      .eq('equipamento_id', equipamentoId).or('tipo.is.null,tipo.eq.foto'),
    obterConfigFicha(),
    obterDescricaoModelo(marca, modelo),
  ])
  const aboutTexto = (idioma === 'pt' ? cfg.about_pt : cfg.about_en) ?? cfg.about_pt ?? null
  const descricaoModelo = descModelo
    ? ((idioma === 'pt' ? descModelo.descricao_pt : descModelo.descricao_en) ?? descModelo.descricao_pt ?? null)
    : null
  const fotos = ((mediaR.data as { url: string; capa: boolean | null; ordem: number | null; created_at: string }[]) ?? [])
    .sort((a, b) => (Number(b.capa) - Number(a.capa)) || ((a.ordem ?? 0) - (b.ordem ?? 0)) || a.created_at.localeCompare(b.created_at))
    .map((m) => m.url)

  // Campos de texto livre: em EN/ES/FR traduzem-se (tradução revista, se dada;
  // senão automática com cache). Em PT ficam como estão.
  let condicao = produto?.condicao ?? null
  let condicaoDescricao = produto?.condicao_descricao ?? null
  let acessorios = acess.map((a) => a.descricao)
  if (idioma !== 'pt') {
    if (params.traducao) {
      condicao = params.traducao.condicao ?? condicao
      condicaoDescricao = params.traducao.condicaoDescricao ?? condicaoDescricao
      acessorios = params.traducao.acessorios ?? acessorios
    } else {
      const trad = await traduzirTextos([condicao ?? '', condicaoDescricao ?? '', ...acessorios], idioma)
      condicao = trad[0]?.trim() ? trad[0] : condicao
      condicaoDescricao = trad[1]?.trim() ? trad[1] : condicaoDescricao
      acessorios = trad.slice(2)
    }
  }

  const blob = await gerarPdfFichaProduto({
    idioma, marca, modelo, ano,
    serialCompleto: serialNumber, incluirSnCompleto,
    condicao,
    condicaoDescricao,
    voltagem: produto?.voltagem ?? null,
    frequencia: produto?.frequencia ?? null,
    dimensoes: produto?.dimensoes ?? null,
    pesoKg: produto?.peso_kg ?? null,
    softwareVersao: produto?.software_versao ?? null,
    handpieces: handpieces.map((h) => ({ nome: h.nome, contador_pulsos: h.contador_pulsos, data_leitura: h.data_leitura })),
    acessorios,
    preco: incluirPreco ? precoVenda : null,
    moeda: params.moeda || 'EUR',
    garantia: params.garantia?.trim() ? params.garantia.trim() : null,
    shippingTraining: !!params.shippingTraining,
    descricaoModelo,
    aboutTexto,
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
