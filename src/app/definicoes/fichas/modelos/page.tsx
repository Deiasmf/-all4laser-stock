'use client'

// Descrições standard por modelo: escritas uma vez, entram automaticamente na
// ficha de qualquer equipamento desse modelo. Inclui rascunho com AI (a rever).
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  listarDescricoesModelo, guardarDescricaoModelo, eliminarDescricaoModelo,
  type DescricaoModelo,
} from '@/lib/fichaProduto'

function Conteudo() {
  const { perfil } = useAuth()
  const sp = useSearchParams()
  const [lista, setLista] = useState<DescricaoModelo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [marca, setMarca] = useState(sp.get('marca') ?? '')
  const [modelo, setModelo] = useState(sp.get('modelo') ?? '')
  const [dPt, setDPt] = useState('')
  const [dEn, setDEn] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [aiOn, setAiOn] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const carregar = useCallback(async () => { setLista(await listarDescricoesModelo()); setCarregando(false) }, [])
  useEffect(() => { carregar() }, [carregar])

  function novo() { setEditId(null); setMarca(''); setModelo(''); setDPt(''); setDEn(''); setMsg(null) }
  function editar(d: DescricaoModelo) {
    setEditId(d.id); setMarca(d.marca ?? ''); setModelo(d.modelo)
    setDPt(d.descricao_pt ?? ''); setDEn(d.descricao_en ?? ''); setMsg(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function guardar() {
    if (!modelo.trim()) { setOk(false); setMsg('Indica o modelo.'); return }
    setAGuardar(true); setMsg(null)
    const { error } = await guardarDescricaoModelo({
      id: editId, marca, modelo, descricao_pt: dPt, descricao_en: dEn,
      autor: { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    })
    setAGuardar(false)
    if (error) { setOk(false); setMsg(error); return }
    setOk(true); setMsg('Guardado ✓'); novo(); carregar()
  }

  async function rascunhoAI() {
    if (!modelo.trim()) { setOk(false); setMsg('Indica o modelo antes de gerar o rascunho.'); return }
    setAiOn(true); setMsg(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const res = await fetch('/api/fichas/modelo-descricao-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marca, modelo }),
      })
      const j = await res.json()
      if (!j.ok) { setOk(false); setMsg('IA: ' + (j.erro ?? 'falha')); return }
      setDPt(j.descricao_pt ?? ''); setDEn(j.descricao_en ?? '')
      setOk(true); setMsg('Rascunho gerado pela AI — revê e ajusta antes de gravar.')
    } catch (e) {
      setOk(false); setMsg('IA: ' + (e instanceof Error ? e.message : 'falha'))
    } finally { setAiOn(false) }
  }

  async function apagar(d: DescricaoModelo) {
    if (!window.confirm(`Apagar a descrição de ${[d.marca, d.modelo].filter(Boolean).join(' ')}?`)) return
    const { error } = await eliminarDescricaoModelo(d.id)
    if (error) { setOk(false); setMsg(error); return }
    if (editId === d.id) novo()
    carregar()
  }

  return (
    <main style={c.page}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={c.titulo}>📄 Descrições por modelo</h1>
        <p style={c.sub}>
          Escrita uma vez por modelo, entra automaticamente na ficha de qualquer equipamento desse modelo (PT usa PT; EN/ES/FR usam EN).{' '}
          <Link href="/definicoes/fichas" style={c.link}>← Configuração das Fichas</Link>
        </p>
      </div>

      <div style={c.card}>
        <div style={c.condTitulo}>{editId ? 'Editar descrição' : 'Nova descrição'}</div>
        <div style={c.grid2}>
          <label style={c.campo}><span style={c.rot}>Marca</span>
            <input style={c.input} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ex.: Candela" />
          </label>
          <label style={c.campo}><span style={c.rot}>Modelo *</span>
            <input style={c.input} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex.: GentleLase Pro" />
          </label>
        </div>
        <div style={c.aiLinha}>
          <button style={c.btnAI} disabled={aiOn} onClick={rascunhoAI}>{aiOn ? 'A gerar…' : '✨ Gerar rascunho com AI'}</button>
          <span style={c.aiNota}>Propõe um texto a partir do modelo — revê sempre antes de gravar.</span>
        </div>
        <label style={c.rot}>Descrição — Português</label>
        <textarea style={c.area} rows={4} value={dPt} onChange={(e) => setDPt(e.target.value)} placeholder="2-3 frases: tecnologia e aplicações típicas…" />
        <label style={c.rot}>Descrição — English</label>
        <textarea style={c.area} rows={4} value={dEn} onChange={(e) => setDEn(e.target.value)} />

        {msg && <div style={ok ? c.ok : c.erro}>{msg}</div>}
        <div style={c.acoes}>
          {editId && <button style={c.btnSec} onClick={novo}>Cancelar edição</button>}
          <button style={c.btn} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>

      <h2 style={c.h2}>Modelos com descrição</h2>
      {carregando ? (
        <p style={c.muted}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>Ainda não há descrições de modelo.</p>
      ) : (
        <div style={c.listaCards}>
          {lista.map((d) => (
            <div key={d.id} style={c.item}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={c.itemNome}>{[d.marca, d.modelo].filter(Boolean).join(' ')}</div>
                <div style={c.itemTxt}>{d.descricao_pt ?? d.descricao_en ?? '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={c.btnMini} onClick={() => editar(d)}>✏️ Editar</button>
                <button style={c.btnMiniDanger} onClick={() => apagar(d)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default function DescricoesModeloPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar…</p>}>
      <Conteudo />
    </Suspense>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 4 },
  link: { color: '#2563EB', textDecoration: 'none' },
  card: { border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  condTitulo: { fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginTop: 6 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  area: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', resize: 'vertical' },
  aiLinha: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  btnAI: { background: 'linear-gradient(90deg,#7C3AED,#EC4899)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer' },
  aiNota: { fontSize: 12, color: 'var(--muted)' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  h2: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)', margin: '20px 0 8px' },
  muted: { color: 'var(--muted)', padding: 16 },
  listaCards: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: 12 },
  itemNome: { fontWeight: 700, fontSize: 14 },
  itemTxt: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  btnMini: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnMiniDanger: { background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' },
  ok: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
}
