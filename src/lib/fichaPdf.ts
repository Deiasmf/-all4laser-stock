// Gerador de PDF reutilizável para documentos/fichas da All4laser.
// Recebe uma especificação (título + secções de rótulo/valor + tabelas) e
// devolve um Blob. Reutiliza o cabeçalho/rodapé com logótipo de docTemplate.

import { carregarLogo, aplicarCabecalhoRodape, MARGEM, TOPO_CONTEUDO, RODAPE_ALTURA } from './docTemplate'

export type LinhaFicha = { rotulo: string; valor: string | number | boolean | null | undefined }
export type SeccaoFicha = { titulo: string; linhas: LinhaFicha[] }
export type TabelaFicha = {
  titulo?: string
  colunas: string[]
  larguras?: number[] // proporções relativas; se omitido, colunas iguais
  linhas: (string | number | null | undefined)[][]
}
export type DocumentoPdf = {
  titulo: string
  subtitulo?: string
  seccoes?: SeccaoFicha[]
  tabelas?: TabelaFicha[]
  nota?: string
}

const NAVY: [number, number, number] = [13, 11, 43]
const CINZA: [number, number, number] = [110, 116, 128]

function valorTexto(v: LinhaFicha['valor']): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

export async function gerarPdfDocumento(d: DocumentoPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const larguraUtil = larguraPagina - MARGEM * 2
  let y = TOPO_CONTEUDO

  function garantirEspaco(h: number) {
    if (y + h > alturaPagina - RODAPE_ALTURA) {
      doc.addPage()
      y = TOPO_CONTEUDO
    }
  }

  function seccao(nome: string) {
    garantirEspaco(34)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...NAVY)
    doc.text(nome, MARGEM, y)
    y += 6
    doc.setDrawColor(220, 222, 226)
    doc.line(MARGEM, y, larguraPagina - MARGEM, y)
    y += 14
  }

  function linha(rotulo: string, valor: string) {
    const xValor = MARGEM + 150
    const txt = doc.splitTextToSize(valor || '—', larguraUtil - 150) as string[]
    const alt = Math.max(14, txt.length * 12)
    garantirEspaco(alt)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...CINZA)
    doc.text(rotulo, MARGEM, y + 9)
    doc.setTextColor(...NAVY)
    doc.text(txt, xValor, y + 9)
    y += alt
  }

  // ── Título ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...NAVY)
  doc.text(d.titulo, MARGEM, y)
  y += 20
  if (d.subtitulo) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(...CINZA)
    doc.text(d.subtitulo, MARGEM, y)
    y += 16
  }
  y += 8

  // ── Secções (rótulo/valor) — omite linhas vazias e secções sem dados ──
  for (const s of d.seccoes ?? []) {
    const preenchidas = s.linhas.filter((l) => valorTexto(l.valor).trim() !== '')
    if (preenchidas.length === 0) continue
    seccao(s.titulo)
    for (const l of preenchidas) linha(l.rotulo, valorTexto(l.valor))
    y += 10
  }

  // ── Tabelas ──
  for (const t of d.tabelas ?? []) {
    if (!t.linhas.length) continue
    if (t.titulo) seccao(t.titulo)
    const base = t.larguras ?? t.colunas.map(() => 1)
    const soma = base.reduce((a, b) => a + b, 0)
    const larguras = base.map((w) => (w / soma) * larguraUtil)

    // Cabeçalho da tabela
    garantirEspaco(20)
    doc.setFillColor(238, 241, 246)
    doc.rect(MARGEM, y, larguraUtil, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    let x = MARGEM
    for (let i = 0; i < t.colunas.length; i++) {
      doc.text(String(t.colunas[i]), x + 4, y + 12)
      x += larguras[i]
    }
    y += 18

    // Linhas
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...NAVY)
    for (const row of t.linhas) {
      const celulas = t.colunas.map((_, i) =>
        doc.splitTextToSize(row[i] == null ? '' : String(row[i]), larguras[i] - 8) as string[]
      )
      const nLinhas = Math.max(1, ...celulas.map((c) => c.length))
      const altLinha = nLinhas * 11 + 6
      garantirEspaco(altLinha)
      x = MARGEM
      for (let i = 0; i < celulas.length; i++) {
        doc.text(celulas[i], x + 4, y + 11)
        x += larguras[i]
      }
      doc.setDrawColor(230, 232, 236)
      doc.line(MARGEM, y + altLinha, MARGEM + larguraUtil, y + altLinha)
      y += altLinha
    }
    y += 10
  }

  // ── Nota final ──
  if (d.nota) {
    const txt = doc.splitTextToSize(d.nota, larguraUtil) as string[]
    garantirEspaco(txt.length * 12 + 10)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...CINZA)
    doc.text(txt, MARGEM, y)
    y += txt.length * 12
  }

  const logo = await carregarLogo()
  aplicarCabecalhoRodape(doc, logo)
  return doc.output('blob')
}

export async function descarregarPdf(blob: Blob, ficheiro: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ficheiro.toLowerCase().endsWith('.pdf') ? ficheiro : `${ficheiro}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
