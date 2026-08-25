'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { obterCompletude } from '@/lib/fichaProduto'
import { criarTarefa, listarColaboradores, type Colaborador } from '@/lib/minhaArea'

// Botão "Pedir dados em falta": cria uma tarefa ao colaborador escolhido, com a
// lista do que falta na ficha de produto e o link para o passo de preenchimento.
export default function PedirDadosFalta({ equipamentoId, tituloEquip }: {
  equipamentoId: string
  tituloEquip: string
}) {
  const { perfil } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [para, setPara] = useState('')
  const [faltam, setFaltam] = useState<string[]>([])
  const [aGuardar, setAGuardar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function abrir() {
    setAberto(true); setMsg(null); setPara('')
    const [c, comp] = await Promise.all([listarColaboradores(), obterCompletude(equipamentoId)])
    setColabs(c); setFaltam(comp.faltam)
  }

  async function enviar() {
    if (!perfil?.id || !para) return
    setAGuardar(true); setMsg(null)
    const link = `${window.location.origin}/equipamentos/${equipamentoId}/ficha`
    const desc = `Faltam: ${faltam.length ? faltam.join(', ') : '—'}\n\nCompletar aqui: ${link}`
    const { error } = await criarTarefa(
      { titulo: `Completar dados de produto — ${tituloEquip}`, descricao: desc, prioridade: 'normal', data_limite: null, assignees: [para] },
      perfil.id,
    )
    setAGuardar(false)
    if (error) { setMsg('Erro a criar tarefa: ' + error.message); return }
    setMsg('Tarefa criada ✓')
  }

  return (
    <>
      <button style={s.btn} onClick={abrir}>📨 Pedir dados em falta</button>

      {aberto && (
        <div style={s.overlay} onClick={() => setAberto(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.cab}>
              <h2 style={s.titulo}>Pedir dados em falta</h2>
              <button onClick={() => setAberto(false)} style={s.fechar} aria-label="Fechar">✕</button>
            </div>
            {msg && <div style={msg.startsWith('Erro') ? s.erro : s.ok}>{msg}</div>}
            <p style={s.p}>Cria uma tarefa a um colaborador para completar a ficha de <strong>{tituloEquip}</strong>.</p>
            <div style={s.faltamBox}>
              <div style={s.faltamTit}>Em falta:</div>
              {faltam.length === 0 ? <span style={s.muted}>Nada — ficha completa 🎉</span> : (
                <ul style={s.lista}>{faltam.map((f) => <li key={f}>{f}</li>)}</ul>
              )}
            </div>
            <label style={s.label}>Atribuir a</label>
            <select style={s.input} value={para} onChange={(e) => setPara(e.target.value)}>
              <option value="">— escolher colaborador —</option>
              {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome ?? c.email}</option>)}
            </select>
            <div style={s.acoes}>
              <button style={s.btnSec} onClick={() => setAberto(false)}>Fechar</button>
              <button style={s.btnPrim} disabled={!para || aGuardar} onClick={enviar}>{aGuardar ? 'A criar…' : 'Criar tarefa'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  p: { fontSize: 14, margin: '4px 0 10px' },
  faltamBox: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', marginBottom: 12 },
  faltamTit: { fontWeight: 700, fontSize: 13, color: '#92400E', marginBottom: 4 },
  lista: { margin: 0, paddingLeft: 18, fontSize: 13.5 },
  muted: { color: 'var(--muted)', fontSize: 13.5 },
  label: { fontWeight: 600, fontSize: 13.5, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  ok: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
}
