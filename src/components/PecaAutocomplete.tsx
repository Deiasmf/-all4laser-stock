'use client'

import { useEffect, useState } from 'react'
import { pesquisarPecas, type PecaOpc } from '@/lib/compras'
import { capasDePecas } from '@/lib/pecasMedia'

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
  const [capas, setCapas] = useState<Map<string, string>>(new Map())
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await pesquisarPecas(valor)
      setRes(r)
      setCapas(await capasDePecas(r.map((p) => p.id)))
    }, 250)
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
              {capas.get(p.id)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={capas.get(p.id)} alt="" style={thumb} />
                : <span style={thumbVazio}>📦</span>}
              <span style={{ minWidth: 0 }}>{p.nome}{p.marca ? ` · ${p.marca}` : ''} · stock {p.quantidade}</span>
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
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--a4l-border)', cursor: 'pointer', font: 'inherit',
  color: 'var(--a4l-text-mid)', fontSize: 13,
}
const thumb: React.CSSProperties = { width: 30, height: 30, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--a4l-border)', flexShrink: 0 }
const thumbVazio: React.CSSProperties = { width: 30, height: 30, borderRadius: 5, border: '1px solid var(--a4l-border)', background: '#f4f5f7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }
