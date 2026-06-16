// Template partilhado para os documentos PDF da All4laser:
// cabeçalho com o logótipo e rodapé com as informações da empresa,
// aplicados a todas as páginas. Reutilizável por qualquer documento.

import type { jsPDF } from 'jspdf'

export type DadosEmpresa = {
  nome: string
  morada?: string
  nif?: string
  telefone?: string
  email?: string
  website?: string
}

// ── Informações da empresa (editar aqui para atualizar todos os documentos) ──
// Preenche os campos em falta (morada, NIF, telefone, etc.) e aparecem
// automaticamente no rodapé de todos os PDF.
export const DADOS_EMPRESA: DadosEmpresa = {
  nome: 'All4laser International Group',
  morada: 'Parque Industrial Via Nova, Rua dos Caniços 31/33, 2625-253 Vialonga, Portugal',
  nif: 'PT508 562 287',
  telefone: '+351 21 757 69 15',
  email: 'comercial@all4laser.com',
  website: 'www.all4laser.com',
}

// Caminho do logótipo na pasta /public
const LOGO_PATH = '/All4Laser-LOGO.jpg'

// Geometria partilhada (em pontos, formato A4)
export const MARGEM = 40
export const TOPO_CONTEUDO = 96 // y onde o conteúdo começa (abaixo do logótipo)
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

// Carimba o logótipo (topo) e o rodapé (info da empresa + nº de página) em
// TODAS as páginas. Chamar no fim, depois de todo o conteúdo estar desenhado.
export function aplicarCabecalhoRodape(
  doc: jsPDF,
  logo: string | null,
  dados: DadosEmpresa = DADOS_EMPRESA
) {
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const total = doc.getNumberOfPages()

  // Logótipo ~2:1 (mantém proporção do ficheiro original)
  const logoLarg = 110
  const logoAlt = 55
  const logoTopo = 26

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
    doc.setDrawColor(220, 222, 226)
    doc.line(MARGEM, logoTopo + logoAlt + 8, larguraPagina - MARGEM, logoTopo + logoAlt + 8)

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
  }
}
