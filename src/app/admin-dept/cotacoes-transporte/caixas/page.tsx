'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarBoxes, criarBox, atualizarBox, eliminarBox, boxVazia, type BoxInput } from '@/lib/freight'
import type { StandardBox } from '@/types/freight'

export default function CaixasPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [boxes, setBoxes] = useState<StandardBox[]>([])
  const [aberto, setAberto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<BoxInput>(boxVazia())
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => setBoxes(await listarBoxes()), [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  function abrirNovo() { setEditId(null); setForm({ ...boxVazia(), ordem: (boxes.at(-1)?.ordem ?? 0) + 10 }); setAberto(true) }
  function abrirEdicao(b: StandardBox) {
    setEditId(b.id)
    setForm({ nome: b.nome, int_c: b.int_c, int_l: b.int_l, int_a: b.int_a, ext_c: b.ext_c, ext_l: b.ext_l, ext_a: b.ext_a, peso_tipico: b.peso_tipico, notas: b.notas, ativo: b.ativo, ordem: b.ordem })
    setAberto(true)
  }
  async function guardar() {
    if (!form.nome.trim()) { setToast('Indica o nome.'); return }
    if (!form.ext_c || !form.ext_l || !form.ext_a) { setToast('As medidas exteriores são obrigatórias.'); return }
    const { error } = editId ? await atualizarBox(editId, form) : await criarBox(form)
    if (error) { setToast('Erro: ' + error.message); return }
    setAberto(false); setToast('Guardado.'); carregar()
  }
  async function apagar(b: StandardBox) {
    if (!window.confirm(`Apagar a caixa ${b.nome}?`)) return
    const { error } = await eliminarBox(b.id); setToast(error ? 'Erro: ' + error.message : 'Apagada.'); carregar()
  }
  const nn = (v: string) => (v === '' ? null : Number(v))

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
          <h1 style={c.titulo}>Catálogo de caixas</h1>
          <p style={c.sub}>Medidas em cm (C×L×A). Para cotação usam-se sempre as exteriores.</p>
        </div>
        <button style={c.btnPrimario} onClick={abrirNovo}>+ Nova caixa</button>
      </div>

      <div style={c.tabelaWrap}>
        <table style={c.tabela}>
          <thead><tr>
            <th style={c.th}>Nome</th><th style={c.th}>Interior (C×L×A)</th><th style={c.th}>Exterior (C×L×A)</th>
            <th style={c.th}>Peso típico</th><th style={c.th}>Notas</th><th style={c.th}></th>
          </tr></thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={b.id} style={c.tr}>
                <td style={c.td}>{b.nome} {!b.ativo && <span style={c.inativo}>inativo</span>}</td>
                <td style={c.td}>{b.int_c != null ? `${b.int_c}×${b.int_l}×${b.int_a}` : '—'}</td>
                <td style={c.td}><strong>{b.ext_c}×{b.ext_l}×{b.ext_a}</strong></td>
                <td style={c.td}>{b.peso_tipico != null ? `${b.peso_tipico} kg` : '—'}</td>
                <td style={c.td}>{b.notas ?? '—'}</td>
                <td style={c.tdAcoes}><button style={c.btnMini} onClick={() => abrirEdicao(b)}>✏️</button><button style={c.btnMini} onClick={() => apagar(b)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div style={c.overlay} onClick={() => setAberto(false)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}><strong>{editId ? 'Editar caixa' : 'Nova caixa'}</strong><button style={c.btnFechar} onClick={() => setAberto(false)}>✕</button></div>
            <div style={c.grelha}>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Nome *</span><input style={c.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
              <div style={c.trio}>
                <span style={c.rot}>Interior C×L×A (cm)</span>
                <div style={c.trioInputs}>
                  <input style={c.num} type="number" value={form.int_c ?? ''} onChange={(e) => setForm({ ...form, int_c: nn(e.target.value) })} />
                  <input style={c.num} type="number" value={form.int_l ?? ''} onChange={(e) => setForm({ ...form, int_l: nn(e.target.value) })} />
                  <input style={c.num} type="number" value={form.int_a ?? ''} onChange={(e) => setForm({ ...form, int_a: nn(e.target.value) })} />
                </div>
              </div>
              <div style={c.trio}>
                <span style={c.rot}>Exterior C×L×A (cm) *</span>
                <div style={c.trioInputs}>
                  <input style={c.num} type="number" value={form.ext_c || ''} onChange={(e) => setForm({ ...form, ext_c: Number(e.target.value) })} />
                  <input style={c.num} type="number" value={form.ext_l || ''} onChange={(e) => setForm({ ...form, ext_l: Number(e.target.value) })} />
                  <input style={c.num} type="number" value={form.ext_a || ''} onChange={(e) => setForm({ ...form, ext_a: Number(e.target.value) })} />
                </div>
              </div>
              <label style={c.campo}><span style={c.rot}>Peso típico (kg)</span><input style={c.input} type="number" value={form.peso_tipico ?? ''} onChange={(e) => setForm({ ...form, peso_tipico: nn(e.target.value) })} /></label>
              <label style={c.campo}><span style={c.rot}>Ordem</span><input style={c.input} type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Notas</span><input style={c.input} value={form.notas ?? ''} onChange={(e) => setForm({ ...form, notas: e.target.value || null })} /></label>
              <label style={c.check}><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativa</label>
            </div>
            <div style={c.modalAcoes}><button style={c.btnSecundario} onClick={() => setAberto(false)}>Cancelar</button><button style={c.btnPrimario} onClick={guardar}>Guardar</button></div>
          </div>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1000, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0' },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  tabelaWrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px', verticalAlign: 'top' },
  tdAcoes: { padding: '8px', whiteSpace: 'nowrap' },
  inativo: { fontSize: 11, color: '#B91C1C', background: '#FEE2E2', borderRadius: 999, padding: '1px 6px' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 50 },
  modal: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(560px, 100%)', marginTop: 24 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnFechar: { border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  trio: { display: 'flex', flexDirection: 'column', gap: 4 },
  trioInputs: { display: 'flex', gap: 6 },
  num: { padding: '8px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', width: 70 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btnPrimario: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnMini: { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', padding: '4px 8px', marginRight: 4, fontSize: 14 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
