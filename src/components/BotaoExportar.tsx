'use client'

import { exportarCSV } from '@/lib/exportar'
import type { ColunaExport } from '@/lib/exportar'

// Botão reutilizável para exportar uma lista para Excel (CSV que o Excel abre).
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
  const semDados = linhas.length === 0
  return (
    <button
      type="button"
      onClick={() => exportarCSV(nome, colunas, linhas)}
      disabled={semDados}
      title={semDados ? 'Sem dados para exportar' : `Exportar ${linhas.length} linha(s) para Excel`}
      style={{
        background: '#fff',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontWeight: 600,
        cursor: semDados ? 'not-allowed' : 'pointer',
        opacity: semDados ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      📊 Exportar Excel
    </button>
  )
}
