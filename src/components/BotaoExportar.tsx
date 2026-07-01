'use client'

import { useState } from 'react'
import { exportarExcel } from '@/lib/exportar'
import type { ColunaExport } from '@/lib/exportar'

// Botão reutilizável para exportar uma lista para Excel (.xlsx).
export default function BotaoExportar<T>({
  nome,
  colunas,
  linhas,
  style,
}: {
  nome: string
  colunas: ColunaExport<T>[]
  linhas: T[]
  style?: React.CSSProperties
}) {
  const [aExportar, setAExportar] = useState(false)
  const semDados = linhas.length === 0

  async function exportar() {
    if (semDados || aExportar) return
    setAExportar(true)
    try {
      await exportarExcel(nome, colunas, linhas)
    } finally {
      setAExportar(false)
    }
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={semDados || aExportar}
      title={semDados ? 'Sem dados para exportar' : `Exportar ${linhas.length} linha(s) para Excel`}
      style={{
        background: '#fff',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontWeight: 600,
        cursor: semDados || aExportar ? 'not-allowed' : 'pointer',
        opacity: semDados ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {aExportar ? 'A exportar...' : '📊 Exportar Excel'}
    </button>
  )
}
