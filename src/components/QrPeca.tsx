'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import styles from './qrEquipamento.module.css'
import type { Peca } from '@/types/peca'

export default function QrPeca({ peca }: { peca: Peca }) {
  const [dataUrl, setDataUrl] = useState<string>('')

  useEffect(() => {
    // Link absoluto que abre esta peça no stock (funciona no domínio publicado)
    const url = `${window.location.origin}/logistico/pecas?peca=${peca.id}`
    QRCode.toDataURL(url, { width: 400, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [peca.id])

  function imprimir() {
    if (!dataUrl) return
    const sub = [peca.marca, peca.grupo].filter(Boolean).join(' · ')
    const win = window.open('', '_blank', 'width=400,height=540')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>QR ${peca.nome}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 24px; }
            img { width: 280px; height: 280px; }
            h2 { margin: 12px 0 4px; font-size: 18px; }
            p { margin: 2px 0; color: #444; font-size: 14px; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="QR" />
          <h2>${peca.nome}</h2>
          ${sub ? `<p>${sub}</p>` : ''}
          ${peca.referencia ? `<p>Ref: ${peca.referencia}</p>` : ''}
          <p>All4laser</p>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className={styles.seccao}>
      {/* QR gerado como data URL — next/image não acrescenta valor aqui */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dataUrl && <img className={styles.qrImg} src={dataUrl} alt="QR Code da peça" />}
      <div className={styles.info}>
        <div className={styles.titulo}>QR Code</div>
        <div className={styles.texto}>
          Imprime e cola na peça/prateleira. Ao fazer scan, abre esta peça no stock.
        </div>
        <button className={styles.botao} onClick={imprimir} disabled={!dataUrl}>
          🖨 Imprimir QR
        </button>
      </div>
    </div>
  )
}
