import QRCode from 'qrcode'

// Uma etiqueta = um QR (link para a ficha) + texto identificador.
export type EtiquetaItem = {
  url: string // o que o QR codifica (link absoluto para a ficha)
  titulo: string // linha principal, a negrito
  sub1?: string // ex.: "S/N: 12345" ou "Candela · Peças PRO"
  sub2?: string // ex.: "2021" ou "Ref: ABC-123"
}

// Cada página A4 leva 6 etiquetas. Acima deste total pedimos confirmação.
const POR_PAGINA = 6
const AVISO_ACIMA_DE = 60

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function etiquetaHtml(it: EtiquetaItem & { qr: string }): string {
  return `
    <div class="etiqueta">
      ${it.qr ? `<img class="qr" src="${it.qr}" alt="QR" />` : '<div class="qr"></div>'}
      <div class="titulo">${escaparHtml(it.titulo)}</div>
      ${it.sub1 ? `<div class="sub">${escaparHtml(it.sub1)}</div>` : ''}
      ${it.sub2 ? `<div class="sub">${escaparHtml(it.sub2)}</div>` : ''}
      <div class="rodape">All4laser</div>
    </div>`
}

/**
 * Gera uma folha A4 com 6 etiquetas por página (2 colunas × 3 linhas),
 * cada uma com QR Code e texto, e abre a janela de impressão.
 */
export async function imprimirEtiquetas(itens: EtiquetaItem[]): Promise<void> {
  if (itens.length === 0) {
    alert('Não há nada para imprimir com os filtros atuais.')
    return
  }

  const paginas = Math.ceil(itens.length / POR_PAGINA)
  if (itens.length > AVISO_ACIMA_DE) {
    if (!confirm(`Vais imprimir ${itens.length} etiquetas (${paginas} páginas A4). Continuar?`)) return
  }

  // Gerar o QR (data URL) de cada etiqueta
  const comQr = await Promise.all(
    itens.map(async (it) => ({
      ...it,
      qr: await QRCode.toDataURL(it.url, { width: 300, margin: 0 }).catch(() => ''),
    }))
  )

  // Agrupar de 6 em 6 — cada grupo é uma página A4 com quebra garantida
  const paginasHtml: string[] = []
  for (let i = 0; i < comQr.length; i += POR_PAGINA) {
    const celulas = comQr.slice(i, i + POR_PAGINA).map(etiquetaHtml).join('')
    paginasHtml.push(`<div class="pagina"><div class="grelha">${celulas}</div></div>`)
  }

  const win = window.open('', '_blank', 'width=820,height=1100')
  if (!win) {
    alert('O navegador bloqueou a janela de impressão. Permite pop-ups para este site e tenta de novo.')
    return
  }

  win.document.write(`<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <title>Etiquetas QR — All4laser</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f1f5f9; }

      /* Barra de topo — não sai na impressão */
      .barra {
        position: sticky; top: 0; z-index: 10;
        display: flex; gap: 12px; align-items: center;
        padding: 12px 16px; background: #0f172a; color: #fff;
      }
      .barra button {
        font-size: 15px; font-weight: 700; padding: 8px 16px;
        border: 0; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer;
      }
      .barra span { font-size: 14px; opacity: .85; }

      /* Cada .pagina = uma folha A4 */
      .pagina { width: 210mm; min-height: 297mm; margin: 8px auto; padding: 8mm; background: #fff; }
      .grelha {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-auto-rows: 88mm;
        gap: 6mm;
      }
      .etiqueta {
        border: 1px dashed #bbb; border-radius: 4px; padding: 5mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; overflow: hidden;
      }
      .qr { width: 42mm; height: 42mm; }
      .titulo { font-size: 14pt; font-weight: 700; margin-top: 3mm; line-height: 1.15; }
      .sub { font-size: 10.5pt; color: #444; margin-top: 1mm; }
      .rodape { font-size: 9pt; color: #888; margin-top: 2mm; letter-spacing: .5px; }

      @page { size: A4; margin: 0; }
      @media print {
        body { background: #fff; }
        .barra { display: none; }
        .pagina { margin: 0; box-shadow: none; break-after: page; }
        .pagina:last-child { break-after: auto; }
      }
    </style>
  </head>
  <body>
    <div class="barra">
      <button onclick="window.print()">🖨 Imprimir</button>
      <span>${itens.length} etiqueta(s) · ${paginas} página(s) A4 · 6 por página</span>
    </div>
    ${paginasHtml.join('\n')}
    <script>window.onload = function(){ setTimeout(function(){ window.print() }, 300) }</script>
  </body>
</html>`)
  win.document.close()
}
