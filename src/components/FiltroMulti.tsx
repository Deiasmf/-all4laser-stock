'use client'

import { useEffect, useRef, useState } from 'react'

// Filtro de seleção múltipla: botão que abre um painel com checkboxes.
// Funciona bem em telemóvel (toque) e fecha ao clicar fora.
export default function FiltroMulti({
  label,
  opcoes,
  selecionados,
  onChange,
}: {
  label: string
  opcoes: string[]
  selecionados: string[]
  onChange: (next: string[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [procura, setProcura] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  function alternar(v: string) {
    if (selecionados.includes(v)) onChange(selecionados.filter((x) => x !== v))
    else onChange([...selecionados, v])
  }

  const n = selecionados.length
  const texto = n === 0 ? label : `${label} (${n})`
  const filtradas = procura
    ? opcoes.filter((o) => o.toLowerCase().includes(procura.toLowerCase()))
    : opcoes

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAberto((a) => !a)} style={{ ...botao, ...(n > 0 ? botaoAtivo : null) }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
        <span style={{ opacity: 0.6, fontSize: 11 }}>▾</span>
      </button>

      {aberto && (
        <div style={painel}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              autoFocus
              placeholder="Procurar..."
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              style={inputProcura}
            />
            {n > 0 && (
              <button type="button" onClick={() => onChange([])} style={limpar}>Limpar</button>
            )}
          </div>
          <div style={lista}>
            {filtradas.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: 6 }}>Sem opções</div>
            ) : (
              filtradas.map((o) => (
                <label key={o} style={item}>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(o)}
                    onChange={() => alternar(o)}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const botao: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 200,
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--foreground)', fontWeight: 600,
  cursor: 'pointer', fontSize: 14,
}
const botaoAtivo: React.CSSProperties = {
  borderColor: 'var(--primary)', color: 'var(--primary-dark)', background: 'var(--accent-bg)',
}
const painel: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60,
  width: 260, maxWidth: '85vw', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 10, padding: 10,
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
}
const inputProcura: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 14,
}
const limpar: React.CSSProperties = {
  background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)',
  borderRadius: 8, padding: '0 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}
const lista: React.CSSProperties = {
  maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
}
const item: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 6px',
  fontSize: 14, cursor: 'pointer', borderRadius: 6,
}
