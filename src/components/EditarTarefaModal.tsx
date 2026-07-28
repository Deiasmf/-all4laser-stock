'use client'

import { useState } from 'react'
import { atualizarTarefa, PRIORIDADES, type Prioridade } from '@/lib/minhaArea'

// Editar os campos de uma tarefa (título, descrição, prioridade, prazo).
// Reutilizado na área do colaborador e no acompanhamento do admin. A RLS decide
// quem pode gravar (criador, destinatários ou admin).
export default function EditarTarefaModal({
  tarefa, onFechar, onGuardado,
}: {
  tarefa: { id: string; titulo: string; descricao: string | null; prioridade: Prioridade; data_limite: string | null }
  onFechar: () => void
  onGuardado: () => void | Promise<void>
}) {
  const [titulo, setTitulo] = useState(tarefa.titulo)
  const [descricao, setDescricao] = useState(tarefa.descricao ?? '')
  const [prioridade, setPrioridade] = useState<Prioridade>(tarefa.prioridade)
  const [prazo, setPrazo] = useState((tarefa.data_limite ?? '').slice(0, 10))
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    if (!titulo.trim()) { setErro('Indica o título.'); return }
    setErro(null)
    setAGuardar(true)
    const { error } = await atualizarTarefa(tarefa.id, {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      prioridade,
      data_limite: prazo || null,
    })
    setAGuardar(false)
    if (error) { setErro('Erro a guardar: ' + error.message); return }
    await onGuardado()
  }

  return (
    <div style={s.overlay} onClick={onFechar}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.cab}>
          <h2 style={s.titulo}>Editar tarefa</h2>
          <button onClick={onFechar} style={s.fechar} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={s.erro}>{erro}</div>}

        <label style={s.label}>Título</label>
        <input style={s.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que é preciso fazer" />

        <label style={s.label}>Descrição</label>
        <textarea style={{ ...s.input, minHeight: 70, resize: 'vertical' }} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes (opcional)" />

        <div style={s.linha2}>
          <div>
            <label style={s.label}>Prioridade</label>
            <select style={s.input} value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
              {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Data limite</label>
            <input style={s.input} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
        </div>

        <div style={s.acoes}>
          <button onClick={onFechar} style={s.btnGhost}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={s.btnPrimario}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  label: { fontWeight: 600, fontSize: 13.5, marginTop: 12, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
}
