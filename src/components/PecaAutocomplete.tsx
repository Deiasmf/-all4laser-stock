'use client'

import { useEffect, useState } from 'react'
import { pesquisarPecas, type PecaOpc } from '@/lib/compras'

// Campo de texto com sugestões de peças do catálogo. Aceita texto livre (peças
// não catalogadas) — onTexto limpa a ligação; onEscolher liga a uma peça.
export default function PecaAutocomplete({
  valor, onTexto, onEscolher, placeholder,
}: {
  valor: string
  onTexto: (v: string) => void
  onEscolher: (p: PecaOpc) => void
  placeholder?: string
}) {
  const [res, setRes] = useState<PecaOpc[]>([])
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => setRes(await pesquisarPecas(valor)), 250)
    return () => clearTimeout(t)
  }, [valor])

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="a4l-input"
        value={valor}
        placeholder={placeholder ?? 'Peça (escolher do catálogo ou escrever)...'}
        onChange={(e) => { onTexto(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
      />
      {aberto && res.length > 0 && (
        <div style={dd}>
          {res.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onEscolher(p); setAberto(false) }}
              style={op}
            >
              {p.nome}{p.marca ? ` · ${p.marca}` : ''} · stock {p.quantidade}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const dd: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
  background: 'var(--a4l-card-bg, #fff)', border: '1px solid var(--a4l-border)', borderRadius: 8,
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
}
const op: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--a4l-border)', cursor: 'pointer', font: 'inherit',
  color: 'var(--a4l-text-mid)', fontSize: 13,
}
