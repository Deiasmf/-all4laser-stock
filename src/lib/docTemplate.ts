// Template partilhado para os documentos PDF da All4laser:
// cabeçalho com o logótipo e rodapé com as informações da empresa,
// aplicados a todas as páginas. Reutilizável por qualquer documento.

import type { jsPDF } from 'jspdf'
import { EMPRESA } from './empresa'

export type DadosEmpresa = {
  nome: string
  morada?: string
  nif?: string
  telefone?: string
  email?: string
  website?: string
}

// Informações da empresa no rodapé dos documentos gerais (packing lists, etc.).
// Fonte única em src/lib/empresa.ts — usa a linha fixa do escritório.
export const DADOS_EMPRESA: DadosEmpresa = {
  nome: EMPRESA.nome,
  morada: EMPRESA.morada,
  nif: EMPRESA.nif,
  telefone: EMPRESA.telefoneGeral,
  email: EMPRESA.email,
  website: EMPRESA.website,
}

// Caminho do logótipo na pasta /public
const LOGO_PATH = '/All4Laser-LOGO.jpg'

// Geometria partilhada (em pontos, formato A4)
export const MARGEM = 40
export const TOPO_CONTEUDO = 100 // y onde o conteúdo começa (abaixo do logótipo)
export const RODAPE_ALTURA = 50 // espaço reservado em baixo para o rodapé

const NAVY: [number, number, number] = [13, 11, 43]
const CINZA: [number, number, number] = [110, 116, 128]

// Carrega o logótipo como data URL (evita problemas de CORS no canvas do jsPDF).
export async function carregarLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_PATH)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

type RGB = [number, number, number]

// Desenha uma barra com degradê horizontal (aproximado por fatias verticais).
function barraDegrade(doc: jsPDF, x: number, y: number, w: number, h: number, c1: RGB, c2: RGB) {
  const n = 64
  const sw = w / n
  for (let i = 0; i < n; i++) {
    const tt = n > 1 ? i / (n - 1) : 0
    doc.setFillColor(
      Math.round(c1[0] + (c2[0] - c1[0]) * tt),
      Math.round(c1[1] + (c2[1] - c1[1]) * tt),
      Math.round(c1[2] + (c2[2] - c1[2]) * tt),
    )
    doc.rect(x + i * sw, y, sw + 0.6, h, 'F') // +0.6 evita fendas entre fatias
  }
}

// Carimba o logótipo (topo) e o rodapé (info da empresa + nº de página) em
// TODAS as páginas. Chamar no fim, depois de todo o conteúdo estar desenhado.
// opts.degrade [c1, c2]: barra de degradê no topo e no rodapé (identidade da marca).
export function aplicarCabecalhoRodape(
  doc: jsPDF,
  logo: string | null,
  dados: DadosEmpresa = DADOS_EMPRESA,
  opts: { degrade?: [RGB, RGB] } = {}
) {
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const total = doc.getNumberOfPages()

  // Logótipo ~2:1 (mantém proporção do ficheiro original)
  const logoLarg = 124
  const logoAlt = 62
  const logoTopo = 24

  const geradoEm = new Date().toLocaleString('pt-PT')
  const linhaContacto1 = [dados.morada, dados.nif && `NIF ${dados.nif}`].filter(Boolean).join('  ·  ')
  const linhaContacto2 = [dados.telefone, dados.email, dados.website].filter(Boolean).join('  ·  ')

  for (let p = 1; p <= total; p++) {
    doc.setPage(p)

    // ── Cabeçalho: logótipo + linha separadora ──
    if (logo) {
      try {
        doc.addImage(logo, 'JPEG', MARGEM, logoTopo, logoLarg, logoAlt)
      } catch {
        // logótipo inválido — segue sem imagem
      }
    }
    const hy = logoTopo + logoAlt + 8
    doc.setDrawColor(220, 222, 226)
    doc.line(MARGEM, hy, larguraPagina - MARGEM, hy)
    // Barra de degradê no topo (identidade da marca).
    if (opts.degrade) barraDegrade(doc, 0, 0, larguraPagina, 7, opts.degrade[0], opts.degrade[1])

    // ── Rodapé: linha separadora + info da empresa + nº de página ──
    const baseRodape = alturaPagina - RODAPE_ALTURA + 12
    doc.setDrawColor(220, 222, 226)
    doc.line(MARGEM, baseRodape - 10, larguraPagina - MARGEM, baseRodape - 10)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text(dados.nome, MARGEM, baseRodape)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...CINZA)
    let yLinha = baseRodape + 10
    if (linhaContacto1) { doc.text(linhaContacto1, MARGEM, yLinha); yLinha += 9 }
    if (linhaContacto2) { doc.text(linhaContacto2, MARGEM, yLinha) }

    // Coluna direita: data de geração e nº de página
    doc.setTextColor(...CINZA)
    doc.text(`Gerado em ${geradoEm}`, larguraPagina - MARGEM, baseRodape, { align: 'right' })
    doc.text(`Página ${p} de ${total}`, larguraPagina - MARGEM, baseRodape + 10, { align: 'right' })

    // Barra de degradê no rodapé (igual ao topo).
    if (opts.degrade) barraDegrade(doc, 0, alturaPagina - 7, larguraPagina, 7, opts.degrade[0], opts.degrade[1])
  }
}
