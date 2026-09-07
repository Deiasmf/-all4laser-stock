'use client'

import { useEffect, useState } from 'react'
import { listarColaboradores, criarTarefa, PRIORIDADES, type Colaborador, type Prioridade } from '@/lib/minhaArea'
import { definirResponsavelPost } from '@/lib/marketing'

type Autor = { id: string; nome: string | null }

// Atribui uma publicação a um colaborador: define-o como responsável E cria-lhe
// uma tarefa (na "Minha Área") com ligação à publicação.
export default function AtribuirPublicacao({ postId, titulo, autor, responsavelNome, onAtribuido }: {
  postId: string
  titulo: string
  autor: Autor
  responsavelNome: string | null
  onAtribuido: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [para, setPara] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [dataLimite, setDataLimite] = useState('')
  const [nota, setNota] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => { if (aberto && colaboradores.length === 0) listarColaboradores().then(setColaboradores) }, [aberto, colaboradores.length])

  async function atribuir() {
    if (!para) { setErro('Escolhe a quem atribuir.'); return }
    setErro(null); setAGuardar(true)
    const col = colaboradores.find((c) => c.id === para)
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/marketing/publicacoes/${postId}`
    const descricao = [nota.trim(), `Publicação: ${link}`].filter(Boolean).join('\n\n')
    const { error } = await criarTarefa({
      titulo: `📣 Publicar: ${titulo}`,
      descricao,
      prioridade,
      data_limite: dataLimite || null,
      assignees: [para],
    }, autor.id)
    if (!error && col) await definirResponsavelPost(postId, { id: col.id, nome: col.nome })
    setAGuardar(false)
    if (error) { setErro(error.message ?? 'Não foi possível criar a tarefa.'); return }
    setOk(`Atribuída a ${col?.nome ?? 'colaborador'} — tarefa criada.`)
    setNota(''); setDataLimite(''); setPara('')
    onAtribuido()
    setTimeout(() => { setOk(null); setAberto(false) }, 1800)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 14 }}>
          Responsável: <strong>{responsavelNome || '—'}</strong>
        </span>
        {!aberto && <button style={s.btnSec} onClick={() => setAberto(true)}>Atribuir a alguém</button>}
      </div>

      {ok && <p style={{ color: '#166534', fontSize: 13.5, marginTop: 8 }}>{ok}</p>}

      {aberto && !ok && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={s.linha}>
            <div style={s.grupo}>
              <label style={s.label}>Atribuir a</label>
              <select style={s.input} value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">— Escolher colaborador</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome || c.email}</option>)}
              </select>
            </div>
            <div style={s.grupo}>
              <label style={s.label}>Prioridade</label>
              <select style={s.input} value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
                {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </select>
            </div>
            <div style={s.grupo}>
              <label style={s.label}>Data limite (opcional)</label>
              <input style={s.input} type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />
            </div>
          </div>
          <textarea style={{ ...s.input, minHeight: 60 }} placeholder="Nota para o colaborador (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          {erro && <p style={{ color: 'var(--danger)', fontSize: 13.5 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={s.btnOff} onClick={() => { setAberto(false); setErro(null) }}>Cancelar</button>
            <button style={{ ...s.btnPri, ...(aGuardar ? { opacity: 0.6 } : {}) }} disabled={aGuardar} onClick={atribuir}>
              {aGuardar ? 'A atribuir…' : 'Atribuir e criar tarefa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  linha: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  grupo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', font: 'inherit' },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  btnOff: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
}
