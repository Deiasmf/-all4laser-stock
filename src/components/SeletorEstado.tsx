'use client'

import { useState } from 'react'
import { estadoInfo, SLUG_AGUARDA, type EstadoInfo } from '@/lib/minhaArea'

// Seletor do estado de uma tarefa (o meu estado, como destinatário).
// Mostra os estados vindos da BD com a sua cor. No estado "Aguarda informação"
// abre um campo para indicar o que/de quem se aguarda.
export default function SeletorEstado({
  estados, valor, aguardaOQue, onMudar,
}: {
  estados: EstadoInfo[]
  valor: string
  aguardaOQue: string | null
  onMudar: (estado: string, aguardaOQue: string | null) => void | Promise<void>
}) {
  const [texto, setTexto] = useState(aguardaOQue ?? '')
  const [aEditar, setAEditar] = useState(false)
  const info = estadoInfo(valor, estados)

  async function escolher(slug: string) {
    if (slug === valor) return
    if (slug === SLUG_AGUARDA) {
      setAEditar(true)
      await onMudar(slug, texto.trim() || null)   // guarda já; o texto pode ser afinado a seguir
    } else {
      setAEditar(false)
      await onMudar(slug, null)
    }
  }
  async function guardarTexto() {
    setAEditar(false)
    await onMudar(SLUG_AGUARDA, texto.trim() || null)
  }

  return (
    <div style={s.wrap}>
      <select
        value={valor}
        onChange={(e) => escolher(e.target.value)}
        style={{ ...s.select, color: info.cor, background: info.bg }}
        title="Mudar estado"
      >
        {estados.map((e) => <option key={e.slug} value={e.slug}>{e.label}</option>)}
      </select>

      {valor === SLUG_AGUARDA && !aEditar && (
        <button style={s.aguardaChip} onClick={() => { setTexto(aguardaOQue ?? ''); setAEditar(true) }} title="Editar o que se aguarda">
          ⏳ {aguardaOQue || 'a aguardar o quê?'}
        </button>
      )}
      {valor === SLUG_AGUARDA && aEditar && (
        <span style={s.editLinha}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') guardarTexto() }}
            placeholder="A aguardar o quê / de quem?"
            style={s.input}
            autoFocus
          />
          <button style={s.btnOk} onClick={guardarTexto}>OK</button>
        </span>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  select: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit', appearance: 'none' },
  aguardaChip: { background: '#E0E7FF', color: '#3730A3', border: '1px solid #C7D2FE', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  editLinha: { display: 'flex', gap: 6, alignItems: 'center' },
  input: { padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 12.5, width: 190, boxSizing: 'border-box' },
  btnOk: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 11px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 },
}
