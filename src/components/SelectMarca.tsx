'use client'

// Dropdown de marca com pesquisa, alimentado pela tabela `marcas`. Permite criar
// marca nova ("+ Nova marca") mas com deteção de semelhança (não deixa criar
// "Candella" havendo "Candela") — oferece usar a existente.
import { useEffect, useRef, useState } from 'react'
import { listarMarcas, marcasSemelhantes, criarMarca, type Marca, type MarcaSemelhante } from '@/lib/marcas'

const norm = (s: string) => s.trim().toLowerCase()

export default function SelectMarca({ valor, onChange, disabled, style }: {
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [texto, setTexto] = useState(valor)
  const [aberto, setAberto] = useState(false)
  const [semelhantes, setSemelhantes] = useState<MarcaSemelhante[] | null>(null)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { listarMarcas().then(setMarcas) }, [])
  useEffect(() => { setTexto(valor) }, [valor])
  useEffect(() => {
    function fora(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const opcoes = marcas.filter((m) => (texto.trim() ? norm(m.nome).includes(norm(texto)) : true)).slice(0, 12)
  const matchExato = marcas.some((m) => norm(m.nome) === norm(texto))

  function escolher(nome: string) { setTexto(nome); onChange(nome); setAberto(false); setSemelhantes(null) }

  async function tentarNova() {
    const n = texto.trim()
    if (!n) return
    setATrabalhar(true); setSemelhantes(null)
    const sem = await marcasSemelhantes(n)
    if (sem.length) { setSemelhantes(sem); setATrabalhar(false); return } // já existe parecida
    const r = await criarMarca(n)
    setATrabalhar(false)
    if (r.error) { escolher(n); return } // p.ex. duplicado — usa o texto tal e qual
    setMarcas(await listarMarcas())
    escolher(r.nome ?? n)
  }

  async function criarMesmoAssim() {
    const n = texto.trim(); if (!n) return
    setATrabalhar(true)
    const r = await criarMarca(n)
    setATrabalhar(false); setSemelhantes(null)
    if (!r.error) setMarcas(await listarMarcas())
    escolher(r.nome ?? n)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        style={style}
        value={texto}
        disabled={disabled}
        placeholder="Escolher marca…"
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setSemelhantes(null); onChange(e.target.value) }}
      />
      {aberto && !disabled && (opcoes.length > 0 || (texto.trim() && !matchExato)) && (
        <div style={st.dropdown}>
          {opcoes.map((m) => (
            <button type="button" key={m.id} style={st.opt} onClick={() => escolher(m.nome)}>{m.nome}</button>
          ))}
          {texto.trim() && !matchExato && (
            <button type="button" style={{ ...st.opt, ...st.optNova }} disabled={aTrabalhar} onClick={tentarNova}>
              {aTrabalhar ? 'A verificar…' : `➕ Nova marca «${texto.trim()}»`}
            </button>
          )}
        </div>
      )}
      {semelhantes && (
        <div style={st.aviso}>
          <div style={st.avisoTit}>⚠️ Já existe uma marca parecida — usa a existente:</div>
          {semelhantes.map((m) => (
            <button type="button" key={m.id} style={st.avisoBtn} onClick={() => escolher(m.nome)}>Usar «{m.nome}»</button>
          ))}
          <button type="button" style={st.criarAssim} disabled={aTrabalhar} onClick={criarMesmoAssim}>
            É mesmo uma marca diferente — criar «{texto.trim()}»
          </button>
        </div>
      )}
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  dropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 30, maxHeight: 240, overflowY: 'auto' },
  opt: { display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '9px 12px', fontSize: 13.5, cursor: 'pointer', font: 'inherit' },
  optNova: { color: 'var(--primary)', fontWeight: 700 },
  aviso: { marginTop: 6, background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  avisoTit: { fontSize: 12.5, fontWeight: 700, color: '#92400E' },
  avisoBtn: { alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  criarAssim: { alignSelf: 'flex-start', background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', color: 'var(--muted)' },
}
