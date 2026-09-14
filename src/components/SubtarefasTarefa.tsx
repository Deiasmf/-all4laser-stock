'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarSubtarefas, criarSubtarefa, toggleSubtarefa, renomearSubtarefa,
  apagarSubtarefa, reordenarSubtarefas, type Subtarefa,
} from '@/lib/minhaArea'

// Checklist de subtarefas dentro de uma tarefa. Progresso "feitas/total".
// Reordenação por arrasto (nativo). onMudou avisa o pai para atualizar o
// progresso mostrado na lista/tabela.
export default function SubtarefasTarefa({
  taskId, autorId, onMudou,
}: {
  taskId: string
  autorId: string | null
  onMudou?: () => void
}) {
  const [itens, setItens] = useState<Subtarefa[]>([])
  const [nova, setNova] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const arrastado = useRef<string | null>(null)

  const carregar = useCallback(async () => { setItens(await listarSubtarefas(taskId)) }, [taskId])
  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  const feitas = itens.filter((i) => i.concluida).length

  async function adicionar() {
    const t = nova.trim()
    if (!t) return
    setNova('')
    await criarSubtarefa(taskId, t, itens.length, autorId)
    await carregar(); onMudou?.()
  }
  async function alternar(i: Subtarefa) {
    await toggleSubtarefa(i.id, !i.concluida)
    await carregar(); onMudou?.()
  }
  async function guardarNome(i: Subtarefa) {
    const t = editTexto.trim()
    setEditId(null)
    if (t && t !== i.titulo) { await renomearSubtarefa(i.id, t); await carregar() }
  }
  async function remover(i: Subtarefa) {
    await apagarSubtarefa(i.id)
    await carregar(); onMudou?.()
  }
  async function largar(alvo: Subtarefa) {
    const de = arrastado.current
    arrastado.current = null
    if (!de || de === alvo.id) return
    const ids = itens.map((i) => i.id)
    const from = ids.indexOf(de); const to = ids.indexOf(alvo.id)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setItens(ids.map((id) => itens.find((i) => i.id === id)!))   // otimista
    await reordenarSubtarefas(ids)
    await carregar()
  }

  return (
    <div>
      <div style={s.cab}>
        <strong style={s.titulo}>Subtarefas</strong>
        {itens.length > 0 && (
          <span style={s.progresso}>
            {feitas}/{itens.length}
            <span style={s.barra}><span style={{ ...s.barraFill, width: `${(feitas / itens.length) * 100}%` }} /></span>
          </span>
        )}
      </div>

      <div style={s.lista}>
        {itens.map((i) => (
          <div
            key={i.id} style={s.item}
            draggable={editId !== i.id}
            onDragStart={() => { arrastado.current = i.id }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => largar(i)}
          >
            <span style={s.pega} title="Arrastar">⠿</span>
            <input type="checkbox" checked={i.concluida} onChange={() => alternar(i)} style={s.check} />
            {editId === i.id ? (
              <input
                value={editTexto} onChange={(e) => setEditTexto(e.target.value)} autoFocus
                onBlur={() => guardarNome(i)}
                onKeyDown={(e) => { if (e.key === 'Enter') guardarNome(i); if (e.key === 'Escape') setEditId(null) }}
                style={s.editInput}
              />
            ) : (
              <span
                style={{ ...s.texto, ...(i.concluida ? s.textoFeito : {}) }}
                onClick={() => { setEditId(i.id); setEditTexto(i.titulo) }}
                title="Clica para editar"
              >{i.titulo}</span>
            )}
            <button style={s.apagar} onClick={() => remover(i)} title="Remover" aria-label="Remover subtarefa">✕</button>
          </div>
        ))}
      </div>

      <div style={s.novaLinha}>
        <input
          value={nova} onChange={(e) => setNova(e.target.value)} placeholder="+ Adicionar subtarefa"
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} style={s.novaInput}
        />
        {nova.trim() && <button style={s.novaBtn} onClick={adicionar}>Adicionar</button>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  cab: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  titulo: { fontSize: 13.5 },
  progresso: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  barra: { display: 'inline-block', width: 70, height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' },
  barraFill: { display: 'block', height: '100%', background: '#065F46' },
  lista: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', borderRadius: 6 },
  pega: { color: '#C7CBD1', cursor: 'grab', fontSize: 13, userSelect: 'none' },
  check: { width: 16, height: 16, flexShrink: 0 },
  texto: { flex: 1, fontSize: 14, cursor: 'text' },
  textoFeito: { textDecoration: 'line-through', color: 'var(--muted)' },
  editInput: { flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit', fontSize: 14 },
  apagar: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '2px 6px' },
  novaLinha: { display: 'flex', gap: 6, marginTop: 6 },
  novaInput: { flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13.5 },
  novaBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
}
