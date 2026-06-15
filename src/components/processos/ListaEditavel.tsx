'use client'

// Editor de uma lista ordenada de textos, com adicionar/remover e reordenar (↑/↓).
export default function ListaEditavel({
  titulo,
  itens,
  onChange,
  placeholder,
  numerada = false,
}: {
  titulo: string
  itens: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  numerada?: boolean
}) {
  function alterar(i: number, valor: string) {
    const next = [...itens]
    next[i] = valor
    onChange(next)
  }
  function remover(i: number) {
    onChange(itens.filter((_, idx) => idx !== i))
  }
  function mover(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= itens.length) return
    const next = [...itens]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function adicionar() {
    onChange([...itens, ''])
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={lbl}>{titulo}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {numerada && <span style={num}>{i + 1}</span>}
            <input
              value={item}
              placeholder={placeholder}
              onChange={(e) => alterar(i, e.target.value)}
              style={input}
            />
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} style={btnIcon} title="Subir">↑</button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === itens.length - 1} style={btnIcon} title="Descer">↓</button>
            <button type="button" onClick={() => remover(i)} style={{ ...btnIcon, color: 'var(--danger)' }} title="Remover">✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={adicionar} style={btnAdd}>+ Adicionar</button>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }
const input: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 8, background: '#fff', color: 'var(--foreground)',
}
const num: React.CSSProperties = {
  flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-bg)',
  color: 'var(--primary-dark)', fontSize: 12, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const btnIcon: React.CSSProperties = {
  flexShrink: 0, width: 34, height: 34, border: '1px solid var(--border)', background: '#fff',
  borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
}
const btnAdd: React.CSSProperties = {
  marginTop: 8, background: 'var(--surface)', color: 'var(--primary)',
  border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer',
}
