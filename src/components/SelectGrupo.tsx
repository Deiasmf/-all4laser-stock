'use client'

// Dropdown de grupo de peça (modelo/grupo compatível), alimentado por grupos_pecas.
// Permite criar grupo novo; se já existir um igual (normalizado), reutiliza-o.
import { useEffect, useRef, useState } from 'react'
import { listarGruposPecas, criarGrupoPeca, normGrupo, type GrupoPeca } from '@/lib/gruposPecas'

export default function SelectGrupo({ valor, onChange, disabled, style }: {
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const [grupos, setGrupos] = useState<GrupoPeca[]>([])
  const [texto, setTexto] = useState(valor)
  const [aberto, setAberto] = useState(false)
  const [aCriar, setACriar] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { listarGruposPecas().then(setGrupos) }, [])
  useEffect(() => { setTexto(valor) }, [valor])
  useEffect(() => {
    function fora(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const opcoes = grupos.filter((g) => (texto.trim() ? g.nome.toLowerCase().includes(texto.trim().toLowerCase()) : true)).slice(0, 12)
  const matchExato = grupos.some((g) => normGrupo(g.nome) === normGrupo(texto))

  function escolher(nome: string) { setTexto(nome); onChange(nome); setAberto(false) }

  async function criarNovo() {
    const n = texto.trim(); if (!n) return
    // Se já existir um grupo igual (normalizado), reutiliza-o.
    const existente = grupos.find((g) => normGrupo(g.nome) === normGrupo(n))
    if (existente) { escolher(existente.nome); return }
    setACriar(true)
    const r = await criarGrupoPeca(n)
    setACriar(false)
    if (r.error) { escolher(n); return }
    setGrupos(await listarGruposPecas())
    escolher(r.nome ?? n)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={style}
        value={texto}
        disabled={disabled}
        placeholder="Escolher grupo…"
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); onChange(e.target.value) }}
      />
      {aberto && !disabled && (opcoes.length > 0 || (texto.trim() && !matchExato)) && (
        <div style={st.dropdown}>
          {opcoes.map((g) => (
            <button type="button" key={g.id} style={st.opt} onClick={() => escolher(g.nome)}>{g.nome}</button>
          ))}
          {texto.trim() && !matchExato && (
            <button type="button" style={{ ...st.opt, ...st.optNovo }} disabled={aCriar} onClick={criarNovo}>
              {aCriar ? 'A criar…' : `➕ Novo grupo «${texto.trim()}»`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  dropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 30, maxHeight: 240, overflowY: 'auto' },
  opt: { display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '9px 12px', fontSize: 13.5, cursor: 'pointer', font: 'inherit' },
  optNovo: { color: 'var(--primary)', fontWeight: 700 },
}
