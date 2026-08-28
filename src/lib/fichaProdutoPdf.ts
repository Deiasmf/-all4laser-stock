// Gerador do PDF da FICHA DE PRODUTO (virada para o cliente).
// Identidade All4laser (logótipo/rodapé de docTemplate), foto de capa + galeria,
// identificação, estado, handpieces, acessórios, especificações e contactos.
// Multi-idioma: PT / EN / ES / FR.

import { carregarLogo, aplicarCabecalhoRodape, MARGEM, TOPO_CONTEUDO, RODAPE_ALTURA } from './docTemplate'
import { EMPRESA } from './empresa'

export type IdiomaFicha = 'pt' | 'en' | 'es' | 'fr'

export type FichaProdutoDados = {
  idioma: IdiomaFicha
  marca: string | null
  modelo: string | null
  ano: string | null
  serialCompleto: string | null
  incluirSnCompleto: boolean
  condicao: string | null
  condicaoDescricao: string | null
  voltagem: string | null
  frequencia: string | null
  dimensoes: string | null
  pesoKg: number | null
  softwareVersao: string | null
  handpieces: { nome: string; contador_pulsos: number | null; data_leitura: string | null }[]
  acessorios: string[]
  // Secção "Condições" (todos opcionais; se nenhum, a secção não aparece).
  preco: number | null            // valor, só se o utilizador escolher incluir
  moeda: string                   // moeda do valor (EUR por defeito)
  garantia: string | null         // texto curto (ex.: "6 meses"), só se incluído
  shippingTraining: boolean       // linha "Envio e formação incluídos"
  fotos: string[]                 // URLs (capa primeiro)
}

// Contactos client-facing da ficha (fonte única em src/lib/empresa.ts).
const CONTACTOS = `${EMPRESA.email}  ·  ${EMPRESA.telefoneComercial}  ·  ${EMPRESA.website}`

const T: Record<IdiomaFicha, Record<string, string>> = {
  pt: { titulo: 'Ficha de Produto', identificacao: 'Identificação', marca: 'Marca', modelo: 'Modelo', ano: 'Ano', serial: 'Nº de série', estado: 'Estado', condicao: 'Condição', descricao: 'Descrição do estado', handpieces: 'Peças de mão / contadores', hpNome: 'Peça de mão', hpContador: 'Contador (pulsos)', hpLeitura: 'Data da leitura', acessorios: 'Acessórios incluídos', especificacoes: 'Especificações', voltagem: 'Voltagem', frequencia: 'Frequência', dimensoes: 'Dimensões', peso: 'Peso', software: 'Software / versão', preco: 'Valor', condicoes: 'Condições', garantia: 'Garantia', shippingIncluido: 'Envio e formação incluídos', contactos: 'Contactos', nota: 'Informação sujeita a confirmação. Fotografias do equipamento real.', sem: '—' },
  en: { titulo: 'Product Sheet', identificacao: 'Identification', marca: 'Brand', modelo: 'Model', ano: 'Year', serial: 'Serial number', estado: 'Condition', condicao: 'Condition', descricao: 'Condition notes', handpieces: 'Handpieces / counters', hpNome: 'Handpiece', hpContador: 'Counter (pulses)', hpLeitura: 'Reading date', acessorios: 'Included accessories', especificacoes: 'Specifications', voltagem: 'Voltage', frequencia: 'Frequency', dimensoes: 'Dimensions', peso: 'Weight', software: 'Software / version', preco: 'Price', condicoes: 'Conditions', garantia: 'Warranty', shippingIncluido: 'Shipping and training included', contactos: 'Contact', nota: 'Information subject to confirmation. Photographs of the actual equipment.', sem: '—' },
  es: { titulo: 'Ficha de Producto', identificacao: 'Identificación', marca: 'Marca', modelo: 'Modelo', ano: 'Año', serial: 'Nº de serie', estado: 'Estado', condicao: 'Condición', descricao: 'Descripción del estado', handpieces: 'Piezas de mano / contadores', hpNome: 'Pieza de mano', hpContador: 'Contador (pulsos)', hpLeitura: 'Fecha de lectura', acessorios: 'Accesorios incluidos', especificacoes: 'Especificaciones', voltagem: 'Voltaje', frequencia: 'Frecuencia', dimensoes: 'Dimensiones', peso: 'Peso', software: 'Software / versión', preco: 'Valor', condicoes: 'Condiciones', garantia: 'Garantía', shippingIncluido: 'Envío y formación incluidos', contactos: 'Contacto', nota: 'Información sujeta a confirmación. Fotografías del equipo real.', sem: '—' },
  fr: { titulo: 'Fiche Produit', identificacao: 'Identification', marca: 'Marque', modelo: 'Modèle', ano: 'Année', serial: 'Nº de série', estado: 'État', condicao: 'État', descricao: "Description de l'état", handpieces: 'Pièces à main / compteurs', hpNome: 'Pièce à main', hpContador: 'Compteur (impulsions)', hpLeitura: 'Date de lecture', acessorios: 'Accessoires inclus', especificacoes: 'Spécifications', voltagem: 'Tension', frequencia: 'Fréquence', dimensoes: 'Dimensions', peso: 'Poids', software: 'Logiciel / version', preco: 'Valeur', condicoes: 'Conditions', garantia: 'Garantie', shippingIncluido: 'Expédition et formation incluses', contactos: 'Contact', nota: "Informations sous réserve de confirmation. Photographies de l'équipement réel.", sem: '—' },
}

const NAVY: [number, number, number] = [13, 11, 43]
const CINZA: [number, number, number] = [110, 116, 128]

function serialParcial(sn: string | null, completo: boolean, semTxt: string): string {
  if (!sn) return semTxt
  if (completo) return sn
  const fim = sn.slice(-4)
  return `••••${fim}`
}

function fmtData(d: string | null): string {
  if (!d) return ''
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

// Carrega uma imagem (URL pública) como data URL + dimensões, para o jsPDF.
async function carregarImagem(url: string): Promise<{ dataUrl: string; fmt: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string | null>((resolve) => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
    if (!dataUrl) return null
    let w = 0, h = 0
    try { const bm = await createImageBitmap(blob); w = bm.width; h = bm.height; bm.close?.() } catch { /* ignora */ }
    const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : dataUrl.startsWith('data:image/webp') ? 'WEBP' : 'JPEG'
    return { dataUrl, fmt, w, h }
  } catch {
    return null
  }
}

export async function gerarPdfFichaProduto(d: FichaProdutoDados): Promise<Blob> {
  const t = T[d.idioma] ?? T.pt
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const larguraUtil = larguraPagina - MARGEM * 2
  const fundo = alturaPagina - RODAPE_ALTURA - 16
  let y = TOPO_CONTEUDO

  function garantirEspaco(h: number) {
    if (y + h > fundo) { doc.addPage(); y = TOPO_CONTEUDO }
  }
  function tituloSeccao(txt: string) {
    garantirEspaco(28)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY)
    doc.text(txt, MARGEM, y); y += 6
    doc.setDrawColor(220, 222, 226); doc.line(MARGEM, y, larguraPagina - MARGEM, y); y += 14
  }
  function linha(rot: string, val: string) {
    garantirEspaco(18)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...CINZA)
    doc.text(rot, MARGEM, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY)
    doc.text(val || t.sem, MARGEM + 150, y)
    y += 16
  }

  // ── Título ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NAVY)
  doc.text(t.titulo, MARGEM, y); y += 22
  doc.setFontSize(13); doc.setTextColor(...NAVY)
  const nome = [d.marca, d.modelo].filter(Boolean).join(' ') || t.sem
  doc.text(nome, MARGEM, y); y += 20

  // ── Fotos: capa grande + galeria em grelha ──
  const imgs = (await Promise.all(d.fotos.slice(0, 9).map(carregarImagem))).filter(Boolean) as { dataUrl: string; fmt: string; w: number; h: number }[]
  function desenharImagem(img: { dataUrl: string; fmt: string; w: number; h: number }, x: number, yy: number, maxW: number, maxH: number) {
    const rácio = img.w && img.h ? Math.min(maxW / img.w, maxH / img.h) : maxW / maxH
    const w = img.w ? img.w * rácio : maxW
    const h = img.h ? img.h * rácio : maxH
    try { doc.addImage(img.dataUrl, img.fmt, x, yy, w, h) } catch { /* ignora imagem inválida */ }
    return h
  }
  if (imgs.length > 0) {
    const capa = imgs[0]
    const capaMaxH = 210
    garantirEspaco(capaMaxH + 10)
    const hCapa = desenharImagem(capa, MARGEM, y, larguraUtil, capaMaxH)
    y += hCapa + 10
    const resto = imgs.slice(1)
    if (resto.length > 0) {
      const cols = 4
      const gap = 8
      const cellW = (larguraUtil - gap * (cols - 1)) / cols
      const cellH = cellW * 0.75
      for (let i = 0; i < resto.length; i++) {
        const col = i % cols
        if (col === 0) garantirEspaco(cellH + gap)
        const x = MARGEM + col * (cellW + gap)
        desenharImagem(resto[i], x, y, cellW, cellH)
        if (col === cols - 1) y += cellH + gap
      }
      if (resto.length % cols !== 0) y += cellH + gap
    }
    y += 6
  }

  // ── Identificação ──
  tituloSeccao(t.identificacao)
  linha(t.marca, d.marca || t.sem)
  linha(t.modelo, d.modelo || t.sem)
  linha(t.ano, d.ano || t.sem)
  linha(t.serial, serialParcial(d.serialCompleto, d.incluirSnCompleto, t.sem))

  // ── Estado ──
  if (d.condicao || d.condicaoDescricao) {
    tituloSeccao(t.estado)
    if (d.condicao) linha(t.condicao, d.condicao)
    if (d.condicaoDescricao) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY)
      const linhas = doc.splitTextToSize(d.condicaoDescricao, larguraUtil)
      garantirEspaco(linhas.length * 13 + 4)
      doc.text(linhas, MARGEM, y); y += linhas.length * 13 + 6
    }
  }

  // ── Handpieces (tabela) ──
  if (d.handpieces.length > 0) {
    tituloSeccao(t.handpieces)
    const c1 = MARGEM, c2 = MARGEM + larguraUtil * 0.5, c3 = MARGEM + larguraUtil * 0.78
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...CINZA)
    garantirEspaco(16)
    doc.text(t.hpNome, c1, y); doc.text(t.hpContador, c2, y); doc.text(t.hpLeitura, c3, y); y += 6
    doc.setDrawColor(230, 232, 236); doc.line(MARGEM, y, larguraPagina - MARGEM, y); y += 12
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY)
    for (const h of d.handpieces) {
      garantirEspaco(16)
      doc.text(h.nome || t.sem, c1, y)
      doc.text(h.contador_pulsos != null ? h.contador_pulsos.toLocaleString('pt-PT') : t.sem, c2, y)
      doc.text(fmtData(h.data_leitura) || t.sem, c3, y)
      y += 15
    }
    y += 4
  }

  // ── Acessórios ──
  if (d.acessorios.length > 0) {
    tituloSeccao(t.acessorios)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY)
    for (const a of d.acessorios) {
      const linhas = doc.splitTextToSize(`•  ${a}`, larguraUtil)
      garantirEspaco(linhas.length * 13)
      doc.text(linhas, MARGEM, y); y += linhas.length * 13
    }
    y += 6
  }

  // ── Especificações ──
  const temSpecs = d.voltagem || d.frequencia || d.dimensoes || d.pesoKg != null || d.softwareVersao
  if (temSpecs) {
    tituloSeccao(t.especificacoes)
    if (d.voltagem) linha(t.voltagem, d.voltagem)
    if (d.frequencia) linha(t.frequencia, d.frequencia)
    if (d.dimensoes) linha(t.dimensoes, d.dimensoes)
    if (d.pesoKg != null) linha(t.peso, `${d.pesoKg} kg`)
    if (d.softwareVersao) linha(t.software, d.softwareVersao)
  }

  // ── Condições (valor / garantia / envio+formação — só o que estiver ativo) ──
  const temCondicoes = d.preco != null || (d.garantia && d.garantia.trim()) || d.shippingTraining
  if (temCondicoes) {
    tituloSeccao(t.condicoes)
    if (d.preco != null) {
      const moeda = (d.moeda || 'EUR').toUpperCase()
      let valorTxt: string
      try { valorTxt = d.preco.toLocaleString('pt-PT', { style: 'currency', currency: moeda }) }
      catch { valorTxt = `${d.preco.toLocaleString('pt-PT')} ${moeda}` }
      linha(t.preco, valorTxt)
    }
    if (d.garantia && d.garantia.trim()) linha(t.garantia, d.garantia.trim())
    if (d.shippingTraining) {
      garantirEspaco(16)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY)
      doc.text(`✓  ${t.shippingIncluido}`, MARGEM, y); y += 16
    }
  }

  // ── Contactos + nota legal ──
  tituloSeccao(t.contactos)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY)
  garantirEspaco(16); doc.text(CONTACTOS, MARGEM, y); y += 16
  doc.setFontSize(8); doc.setTextColor(...CINZA)
  const notaLinhas = doc.splitTextToSize(t.nota, larguraUtil)
  garantirEspaco(notaLinhas.length * 11)
  doc.text(notaLinhas, MARGEM, y); y += notaLinhas.length * 11

  // Cabeçalho/rodapé em todas as páginas
  const logo = await carregarLogo()
  aplicarCabecalhoRodape(doc, logo)

  return doc.output('blob')
}
