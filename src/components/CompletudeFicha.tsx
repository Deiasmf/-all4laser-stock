'use client'

import { useEffect, useState } from 'react'
import { obterCompletude, type Completude } from '@/lib/fichaProduto'

// Indicador de completude da ficha de produto: % + o que falta.
// Verde = 100%, amarelo = parcial, vermelho = nada preenchido.
export default function CompletudeFicha({ equipamentoId, refreshKey = 0 }: {
  equipamentoId: string
  refreshKey?: number
}) {
  const [c, setC] = useState<Completude | null>(null)

  useEffect(() => {
    let ativo = true
    obterCompletude(equipamentoId).then((r) => { if (ativo) setC(r) })
    return () => { ativo = false }
  }, [equipamentoId, refreshKey])

  if (!c) return null
  const cor = c.pct === 100 ? verde : c.feitos > 0 ? amarelo : vermelho

  return (
    <div style={{ ...s.barra, borderColor: cor.borda, background: cor.bg }}>
      <div style={s.topo}>
        <span style={{ ...s.pct, color: cor.texto }}>
          Ficha de produto: {c.pct}% completa
        </span>
        {c.leituraDesatualizada && <span style={s.desat}>⚠ contador com leitura desatualizada</span>}
      </div>
      <div style={s.trilho}>
        <div style={{ ...s.progresso, width: `${c.pct}%`, background: cor.texto }} />
      </div>
      {c.faltam.length > 0 && (
        <div style={s.faltam}>Faltam: {c.faltam.join(' · ')}</div>
      )}
    </div>
  )
}

const verde = { borda: '#A7F3D0', bg: '#ECFDF5', texto: '#065F46' }
const amarelo = { borda: '#FDE68A', bg: '#FFFBEB', texto: '#92400E' }
const vermelho = { borda: '#FECACA', bg: '#FEF2F2', texto: '#B91C1C' }

const s: Record<string, React.CSSProperties> = {
  barra: { border: '1px solid', borderRadius: 12, padding: '10px 14px', marginTop: 12 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pct: { fontWeight: 700, fontSize: 14 },
  desat: { color: '#B91C1C', fontWeight: 700, fontSize: 12.5 },
  trilho: { height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden', margin: '8px 0' },
  progresso: { height: '100%', borderRadius: 999 },
  faltam: { fontSize: 12.5, color: 'var(--muted)' },
}
