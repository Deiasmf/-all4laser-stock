'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import styles from './qrEquipamento.module.css'

type Props = {
  equipamentoId: string
  modelo: string | null
  marca: string | null
  serial: string | null
}

export default function QrEquipamento({ equipamentoId, modelo, marca, serial }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('')

  useEffect(() => {
    // Link absoluto para a ficha (funciona no domínio onde a app estiver publicada)
    const url = `${window.location.origin}/equipamentos/${equipamentoId}`
    QRCode.toDataURL(url, { width: 400, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [equipamentoId])

  function imprimir() {
    if (!dataUrl) return
    const titulo = [marca, modelo].filter(Boolean).join(' ') || 'Equipamento'
    const win = window.open('', '_blank', 'width=400,height=520')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>QR ${titulo}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 24px; }
            img { width: 280px; height: 280px; }
            h2 { margin: 12px 0 4px; font-size: 18px; }
            p { margin: 2px 0; color: #444; font-size: 14px; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="QR" />
          <h2>${titulo}</h2>
          <p>Serial: ${serial ?? '—'}</p>
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
      {dataUrl && <img className={styles.qrImg} src={dataUrl} alt="QR Code do equipamento" />}
      <div className={styles.info}>
        <div className={styles.titulo}>QR Code</div>
        <div className={styles.texto}>
          Imprime e cola na máquina. Ao fazer scan, abre esta ficha — para consultar ou registar a saída.
        </div>
        <button className={styles.botao} onClick={imprimir} disabled={!dataUrl}>
          🖨 Imprimir QR
        </button>
      </div>
    </div>
  )
}
