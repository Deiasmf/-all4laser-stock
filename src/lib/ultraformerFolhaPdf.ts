import { carregarLogo } from './docTemplate'
import type { RegistoUltraformer } from './ultraformerRegistos'

// ─────────────────────────────────────────────────────────────────────────────
// PDF da "FOLHA DE REGISTO DE CONSUMO — ULTRAFORMER III" (aluguer entrega/recolha),
// fiel ao documento em papel: cabeçalho com logo, 5 secções (identificação do
// aluguer, clínica/cliente, equipamento, registo dos pulsos, tomada de
// conhecimento) e rodapé. Gera um Blob (jsPDF), para anexar ao aluguer / enviar.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number]
const ROXO: RGB = [150, 45, 200]
const AZUL: RGB = [37, 99, 235]
const NAVY: RGB = [30, 27, 60]
const CINZA: RGB = [110, 116, 128]
const BORDA: RGB = [214, 217, 223]
const FUNDO_CAB: RGB = [243, 244, 246]

// As 7 aplicações da folha (ordem fixa, como no papel).
const APLICACOES: { area: 'rosto' | 'corpo'; mm: number; label: string }[] = [
  { area: 'rosto', mm: 1.5, label: 'Rosto - 1,5 mm' },
  { area: 'rosto', mm: 2.0, label: 'Rosto - 2,0 mm' },
  { area: 'rosto', mm: 3.0, label: 'Rosto - 3,0 mm' },
  { area: 'rosto', mm: 4.5, label: 'Rosto - 4,5 mm' },
  { area: 'corpo', mm: 6.0, label: 'Corpo - 6,0 mm' },
  { area: 'corpo', mm: 9.0, label: 'Corpo - 9,0 mm' },
  { area: 'corpo', mm: 13.0, label: 'Corpo - 13,0 mm' },
]

function dataPt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-PT')
}
function horaPt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}
function num(n: number | null | undefined): string {
  return n == null ? '' : String(n)
}

export async function gerarFolhaUltraformerPdf(
  registo: RegistoUltraformer,
  assinaturaDataUrl?: string | null,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const CW = W - 2 * M
  const logo = await carregarLogo()

  // ── Cabeçalho ──
  if (logo) { try { doc.addImage(logo, 'JPEG', M, 28, 150, 46) } catch {} }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15); doc.setTextColor(...NAVY)
  doc.text('FOLHA DE REGISTO DE CONSUMO', W - M, 44, { align: 'right' })
  doc.setFontSize(14); doc.setTextColor(...ROXO)
  doc.text('ULTRAFORMER III', W - M, 62, { align: 'right' })
  doc.setFontSize(9); doc.setTextColor(...AZUL)
  doc.text('ALUGUER - ENTREGA E RECOLHA', W - M, 76, { align: 'right' })

  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...CINZA)
  doc.text('Preencher e validar na presença do responsável da clínica nos momentos de entrega e recolha.', W / 2, 100, { align: 'center' })

  let y = 116

  // Barra de secção roxa com o número em quadrado azul.
  function secHeader(titulo: string, n: number) {
    const h = 20
    doc.setFillColor(...ROXO); doc.rect(M, y, CW, h, 'F')
    doc.setFillColor(...AZUL); doc.rect(M, y, 26, h, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255)
    doc.text(String(n), M + 13, y + 14, { align: 'center' })
    doc.text(titulo, M + 36, y + 14)
    y += h
  }
  function caixa(h: number) {
    doc.setDrawColor(...BORDA); doc.setLineWidth(0.7)
    doc.rect(M, y, CW, h); y += h
  }
  // Campo "Rótulo valor" com linha por baixo do valor.
  function campo(x: number, yy: number, rotulo: string, valor: string, larg: number) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY)
    doc.text(rotulo, x, yy)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY)
    doc.text(valor, x, yy + 16)
    doc.setDrawColor(...BORDA); doc.setLineWidth(0.6)
    doc.line(x, yy + 20, x + larg, yy + 20)
  }

  // ── 1. Identificação do aluguer ──
  secHeader('IDENTIFICAÇÃO DO ALUGUER', 1)
  const topo1 = y
  caixa(74)
  const col = CW / 4
  campo(M + 10, topo1 + 24, 'Data de entrega', dataPt(registo.data_entrega), col - 20)
  campo(M + 10 + col, topo1 + 24, 'Hora entrega', horaPt(registo.data_entrega), col - 20)
  campo(M + 10 + 2 * col, topo1 + 24, 'Data de recolha', dataPt(registo.data_recolha), col - 20)
  campo(M + 10 + 3 * col, topo1 + 24, 'Hora recolha', horaPt(registo.data_recolha), col - 20)
  campo(M + 10, topo1 + 60, 'N.º de dias', num(registo.dias_aluguer), 160)
  y += 10

  // ── 2. Clínica / Cliente ──
  secHeader('CLÍNICA / CLIENTE', 2)
  const topo2 = y
  caixa(34)
  campo(M + 10, topo2 + 22, 'Nome da clínica', registo.cliente_nome ?? '', CW - 40)
  y += 10

  // ── 3. Equipamento ──
  secHeader('EQUIPAMENTO', 3)
  const topo3 = y
  caixa(52)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY)
  doc.text('Equipamento', M + 10, topo3 + 24)
  doc.setFont('helvetica', 'normal')
  doc.text('Classys Ultraformer III', M + 76, topo3 + 24)
  campo(M + 10 + CW / 3, topo3 + 24, 'N.º de série', registo.serial_number ?? '', CW / 3 - 30)
  campo(M + 10 + (2 * CW) / 3, topo3 + 24, 'Responsável All4laser', registo.responsavel_recolha_nome ?? registo.responsavel_entrega_nome ?? '', CW / 3 - 30)
  y += 10

  // ── 4. Registo dos pulsos ──
  secHeader('REGISTO DOS PULSOS', 4)
  const cols = [130, 115, 95, 90, CW - (130 + 115 + 95 + 90)]
  const cx: number[] = [M]
  for (const w of cols) cx.push(cx[cx.length - 1] + w)
  const cabTitulos = ['Aplicação', 'Identificação / N.º série', 'Pulsos na entrega', 'Pulsos na recolha', 'Pulsos utilizados']

  // Cabeçalho da tabela
  const hCab = 26
  doc.setFillColor(...FUNDO_CAB); doc.rect(M, y, CW, hCab, 'F')
  doc.setDrawColor(...BORDA); doc.setLineWidth(0.6); doc.rect(M, y, CW, hCab)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY)
  for (let i = 0; i < cabTitulos.length; i++) {
    const cxCentro = cx[i] + cols[i] / 2
    doc.text(cabTitulos[i], cxCentro, y + (i === 1 ? 12 : 16), { align: 'center', maxWidth: cols[i] - 8 })
  }
  y += hCab

  // Linhas
  const linhas = registo.linhas ?? []
  const hLin = 22
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const ap of APLICACOES) {
    const l = linhas.find((x) => x.area === ap.area && Math.abs(Number(x.profundidade_mm) - ap.mm) < 0.01) ?? null
    const usados = l ? (l.pulsos_corrigido ?? l.pulsos_utilizados) : null
    doc.setDrawColor(...BORDA); doc.rect(M, y, CW, hLin)
    for (let i = 1; i < cx.length - 1; i++) doc.line(cx[i], y, cx[i], y + hLin)
    doc.setTextColor(...NAVY)
    doc.text(ap.label, cx[0] + 8, y + 14)
    doc.setTextColor(...CINZA)
    doc.text(l?.serial_number ?? '', cx[1] + cols[1] / 2, y + 14, { align: 'center' })
    doc.setTextColor(...NAVY)
    doc.text(l ? num(l.contador_entrega) : '', cx[2] + cols[2] / 2, y + 14, { align: 'center' })
    doc.text(l ? num(l.contador_recolha) : '', cx[3] + cols[3] / 2, y + 14, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.text(usados != null ? num(usados) : '', cx[4] + cols[4] / 2, y + 14, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    y += hLin
  }

  // Totais
  const hTot = 30
  const t3 = CW / 3
  doc.setDrawColor(...BORDA); doc.rect(M, y, CW, hTot)
  doc.line(M + t3, y, M + t3, y + hTot); doc.line(M + 2 * t3, y, M + 2 * t3, y + hTot)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.setTextColor(...ROXO); doc.text('TOTAL PULSOS ROSTO', M + t3 / 2, y + 12, { align: 'center' })
  doc.setTextColor(...AZUL); doc.text('TOTAL PULSOS CORPO', M + t3 + t3 / 2, y + 12, { align: 'center' })
  doc.setTextColor(...NAVY); doc.text('TOTAL GERAL UTILIZADO', M + 2 * t3 + t3 / 2, y + 12, { align: 'center' })
  doc.setFontSize(11); doc.setTextColor(...NAVY)
  doc.text(num(registo.total_pulsos_rosto), M + t3 / 2, y + 26, { align: 'center' })
  doc.text(num(registo.total_pulsos_corpo), M + t3 + t3 / 2, y + 26, { align: 'center' })
  doc.text(num(registo.total_pulsos_geral), M + 2 * t3 + t3 / 2, y + 26, { align: 'center' })
  y += hTot + 12

  // ── 5. Tomada de conhecimento da clínica ──
  secHeader('TOMADA DE CONHECIMENTO DA CLÍNICA', 5)
  const topo5 = y
  caixa(74)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY)
  doc.text('Declaro que tomei conhecimento dos registos acima apresentados.', M + 10, topo5 + 18)
  doc.setFont('helvetica', 'bold')
  doc.text('Assinatura da clínica:', M + 10, topo5 + 48)
  if (assinaturaDataUrl) {
    try { doc.addImage(assinaturaDataUrl, 'PNG', M + 120, topo5 + 26, 150, 40) } catch {}
  }
  doc.setDrawColor(...BORDA); doc.line(M + 120, topo5 + 52, M + 300, topo5 + 52)
  const respClinica = registo.clinica_resp_recolha ?? registo.clinica_resp_entrega ?? ''
  if (respClinica) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text(respClinica, M + 120, topo5 + 64) }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY)
  doc.text(`Data: ${dataPt(registo.data_recolha) || dataPt(registo.data_entrega)}`, M + 330, topo5 + 48)

  // Observações
  const obs = [registo.obs_entrega, registo.obs_recolha].filter(Boolean).join(' · ')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY)
  doc.text('OBSERVAÇÕES / OCORRÊNCIAS', M, y + 16)
  doc.setDrawColor(...BORDA); doc.rect(M, y + 22, CW, 30)
  if (obs) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...NAVY); doc.text(obs, M + 8, y + 40, { maxWidth: CW - 16 }) }

  // ── Rodapé ──
  doc.setDrawColor(...BORDA); doc.setLineWidth(0.6)
  doc.line(M, H - 40, W - M, H - 40)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY)
  doc.text('ALL4LASER | Documento de controlo de aluguer - Ultraformer III', M, H - 28)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...AZUL)
  doc.text('www.all4laser.com', W - M, H - 28, { align: 'right' })

  return doc.output('blob')
}
