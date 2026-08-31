'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarHandpieces, criarHandpiece, atualizarHandpiece, apagarHandpiece,
  obterConfigFicha, leituraDesatualizada, type Handpiece,
} from '@/lib/fichaProduto'

// Handpieces (peças de mão) com contador de pulsos e data de leitura.
// Sinaliza leituras desatualizadas (mais antigas que a config, default 6 meses).
function fmtData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}
type Rascunho = { nome: string; contador: string; data: string }
const VAZIO: Rascunho = { nome: '', contador: '', data: '' }
function paraPatch(r: Rascunho) {
  return {
    nome: r.nome.trim(),
    contador_pulsos: r.contador.trim() === '' ? null : Number(r.contador),
    data_leitura: r.data || null,
  }
}

export default function HandpiecesEquip({ equipamentoId, onChange }: {
  equipamentoId: string
  onChange?: () => void
}) {
  const { perfil } = useAuth()
  const podeEditar = !!perfil?.id
  const [itens, setItens] = useState<Handpiece[]>([])
  const [meses, setMeses] = useState(6)
  const [carregando, setCarregando] = useState(true)
  const [novoAberto, setNovoAberto] = useState(false)
  const [novo, setNovo] = useState<Rascunho>(VAZIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Rascunho>(VAZIO)

  const carregar = useCallback(async () => {
    const [hs, cfg] = await Promise.all([listarHandpieces(equipamentoId), obterConfigFicha()])
    setItens(hs); setMeses(cfg.meses_leitura_valida); setCarregando(false)
  }, [equipamentoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!novo.nome.trim()) return
    const ordem = itens.reduce((mx, h) => Math.max(mx, h.ordem ?? 0), 0) + 1
    await criarHandpiece(equipamentoId, { ...paraPatch(novo), ordem })
    setNovo(VAZIO); setNovoAberto(false)
    await carregar(); onChange?.()
  }
  function abrirEdicao(h: Handpiece) {
    setEditId(h.id)
    setEdit({ nome: h.nome, contador: h.contador_pulsos?.toString() ?? '', data: h.data_leitura ?? '' })
  }
  async function guardarEdicao() {
    if (!editId || !edit.nome.trim()) return
    await atualizarHandpiece(editId, paraPatch(edit))
    setEditId(null)
    await carregar(); onChange?.()
  }
  async function remover(h: Handpiece) {
    if (!window.confirm(`Remover o handpiece "${h.nome}"?`)) return
    await apagarHandpiece(h.id)
    await carregar(); onChange?.()
  }

  return (
    <div style={s.seccao}>
      <div style={s.cab}>
        <span style={s.titulo}>Handpieces / contadores</span>
        {podeEditar && !novoAberto && <button style={s.btnSec} onClick={() => { setNovo(VAZIO); setNovoAberto(true) }}>+ Adicionar</button>}
      </div>

      {carregando ? <p style={s.muted}>A carregar…</p> : (
        <>
          {itens.length === 0 && !novoAberto ? <p style={s.muted}>Sem handpieces registados.</p> : (
            <div style={s.lista}>
              {itens.map((h) => (
                editId === h.id ? (
                  <div key={h.id} style={s.form}>
                    <Campos r={edit} set={setEdit} />
                    <div style={s.acoes}>
                      <button style={s.btnSec} onClick={() => setEditId(null)}>Cancelar</button>
                      <button style={s.btnPrim} onClick={guardarEdicao}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div key={h.id} style={s.linha}>
                    <div style={{ minWidth: 0 }}>
                      <div style={s.nome}>{h.nome}</div>
                      <div style={s.meta}>
                        {h.contador_pulsos != null ? `${h.contador_pulsos.toLocaleString('pt-PT')} pulsos` : 'sem contador'}
                        {' · '}leitura {fmtData(h.data_leitura)}
                        {leituraDesatualizada(h.data_leitura, meses) && <span style={s.desat}>⚠ leitura desatualizada</span>}
                      </div>
                    </div>
                    {podeEditar && (
                      <div style={s.linhaAcoes}>
                        <button style={s.btnMini} onClick={() => abrirEdicao(h)}>✏️</button>
                        <button style={s.btnMini} onClick={() => remover(h)}>🗑</button>
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>
          )}

          {novoAberto && (
            <div style={{ ...s.form, marginTop: 8 }}>
              <Campos r={novo} set={setNovo} />
              <div style={s.acoes}>
                <button style={s.btnSec} onClick={() => setNovoAberto(false)}>Cancelar</button>
                <button style={s.btnPrim} disabled={!novo.nome.trim()} onClick={adicionar}>Adicionar</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Campos({ r, set }: { r: Rascunho; set: (r: Rascunho) => void }) {
  return (
    <div style={s.grelha}>
      <label style={s.campo}><span style={s.rot}>Nome / tipo</span>
        <input style={s.input} value={r.nome} onChange={(e) => set({ ...r, nome: e.target.value })} placeholder="ex.: HP Alexandrite" />
      </label>
      <label style={s.campo}><span style={s.rot}>Contador (pulsos)</span>
        <input type="number" style={s.input} value={r.contador} onChange={(e) => set({ ...r, contador: e.target.value })} />
      </label>
      <label style={s.campo}><span style={s.rot}>Data da leitura</span>
        <input type="date" style={s.input} value={r.data} onChange={(e) => set({ ...r, data: e.target.value })} />
      </label>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  muted: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' },
  nome: { fontWeight: 600, fontSize: 14 },
  meta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  desat: { color: '#B91C1C', fontWeight: 700, marginLeft: 8 },
  linhaAcoes: { display: 'flex', gap: 6, flexShrink: 0 },
  btnMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: 12.5 },
  form: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: '#fafafa' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
}
