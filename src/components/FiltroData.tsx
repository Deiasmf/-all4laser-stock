'use client'

import { useEffect, useRef, useState } from 'react'

// Filtro por intervalo de datas (De–Até). Mesmo aspeto do FiltroMulti.
export default function FiltroData({
  label,
  de,
  ate,
  onChange,
}: {
  label: string
  de: string
  ate: string
  onChange: (de: string, ate: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const ativo = !!(de || ate)
  const fmt = (d: string) => (d ? d.split('-').reverse().join('/') : '')
  const texto = ativo ? `${label}: ${fmt(de) || '…'} – ${fmt(ate) || '…'}` : label

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAberto((a) => !a)} style={{ ...botao, ...(ativo ? botaoAtivo : null) }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
        <span style={{ opacity: 0.6, fontSize: 11 }}>▾</span>
      </button>

      {aberto && (
        <div style={painel}>
          <label style={campo}>
            <span style={lbl}>De</span>
            <input type="date" value={de} onChange={(e) => onChange(e.target.value, ate)} style={input} />
          </label>
          <label style={campo}>
            <span style={lbl}>Até</span>
            <input type="date" value={ate} onChange={(e) => onChange(de, e.target.value)} style={input} />
          </label>
          {ativo && (
            <button type="button" onClick={() => onChange('', '')} style={limpar}>Limpar</button>
          )}
        </div>
      )}
    </div>
  )
}

const botao: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 240,
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--foreground)', fontWeight: 600,
  cursor: 'pointer', fontSize: 14,
}
const botaoAtivo: React.CSSProperties = {
  borderColor: 'var(--primary)', color: 'var(--primary-dark)', background: 'var(--accent-bg)',
}
const painel: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60,
  width: 220, maxWidth: '85vw', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 10, padding: 12,
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 10,
}
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--muted)' }
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, width: '100%',
}
const limpar: React.CSSProperties = {
  alignSelf: 'flex-start', background: 'transparent', color: 'var(--primary)',
  border: '1px solid var(--primary)', borderRadius: 8, padding: '5px 12px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
