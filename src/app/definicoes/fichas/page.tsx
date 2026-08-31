'use client'

// Administração das Fichas de Produto: bloco "About All4laser" (PT/EN) que
// aparece em todas as fichas geradas. Editável por qualquer staff.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { obterConfigFicha, guardarAboutFicha } from '@/lib/fichaProduto'
import { mensagemErro } from '@/lib/erros'

export default function ConfigFichasPage() {
  const [aboutPt, setAboutPt] = useState('')
  const [aboutEn, setAboutEn] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    obterConfigFicha().then((c) => {
      setAboutPt(c.about_pt ?? '')
      setAboutEn(c.about_en ?? '')
      setCarregando(false)
    })
  }, [])

  async function guardar() {
    setAGuardar(true); setMsg(null); setOk(false)
    const { error } = await guardarAboutFicha(aboutPt, aboutEn)
    setAGuardar(false)
    if (error) { setOk(false); setMsg(mensagemErro(error)); return }
    setOk(true); setMsg('Guardado ✓')
  }

  return (
    <main style={c.page}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={c.titulo}>📄 Fichas de Produto — Configuração</h1>
        <p style={c.sub}>
          Texto &ldquo;Sobre a All4laser&rdquo; que aparece em todas as fichas geradas (PT usa a versão portuguesa; EN/ES/FR usam a inglesa).{' '}
          <Link href="/admin-dept/fichas-preview" style={c.link}>Ver pré-visualização ↗</Link>
        </p>
        <p style={c.sub}><Link href="/definicoes/fichas/modelos" style={c.link}>📄 Descrições por modelo →</Link></p>
      </div>

      {carregando ? (
        <p style={c.muted}>A carregar…</p>
      ) : (
        <div style={c.card}>
          <label style={c.rot}>Sobre a All4laser — Português</label>
          <textarea style={c.area} value={aboutPt} onChange={(e) => setAboutPt(e.target.value)} rows={5} placeholder="Breve descrição da empresa (3-4 linhas)…" />

          <label style={c.rot}>About All4laser — English</label>
          <textarea style={c.area} value={aboutEn} onChange={(e) => setAboutEn(e.target.value)} rows={5} placeholder="Short company description (3-4 lines)…" />

          {msg && <div style={ok ? c.ok : c.erro}>{msg}</div>}
          <div style={c.acoes}>
            <button style={c.btn} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 4 },
  link: { color: '#2563EB', textDecoration: 'none' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  rot: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginTop: 8 },
  area: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', resize: 'vertical' },
  acoes: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  ok: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
}
