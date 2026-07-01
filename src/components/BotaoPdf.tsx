'use client'

import { useState } from 'react'
import { gerarPdfDocumento, descarregarPdf } from '@/lib/fichaPdf'
import type { DocumentoPdf } from '@/lib/fichaPdf'

// Botão reutilizável para exportar um documento/ficha em PDF.
// `documento` é uma função que devolve a especificação do PDF (avaliada ao clicar).
export default function BotaoPdf({
  ficheiro,
  documento,
  label = '📄 Exportar PDF',
  style,
}: {
  ficheiro: string
  documento: () => DocumentoPdf
  label?: string
  style?: React.CSSProperties
}) {
  const [aGerar, setAGerar] = useState(false)

  async function gerar() {
    if (aGerar) return
    setAGerar(true)
    try {
      const blob = await gerarPdfDocumento(documento())
      await descarregarPdf(blob, ficheiro)
    } finally {
      setAGerar(false)
    }
  }

  return (
    <button
      type="button"
      onClick={gerar}
      disabled={aGerar}
      title="Exportar este documento em PDF"
      style={{
        background: '#fff',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontWeight: 600,
        cursor: aGerar ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {aGerar ? 'A gerar...' : label}
    </button>
  )
}
