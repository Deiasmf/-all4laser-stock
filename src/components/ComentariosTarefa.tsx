'use client'

import { useCallback, useEffect, useState } from 'react'
import { listarComentarios, adicionarComentario, type Comentario } from '@/lib/minhaArea'

// Fio de respostas/comentários de uma tarefa. Reutilizado na área do
// colaborador e no acompanhamento do admin. A RLS decide quem vê/escreve
// (criador + destinatários da tarefa).
function dh(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTarefa({ taskId, autor }: {
  taskId: string
  autor: { id: string | null; nome: string | null }
}) {
  const [itens, setItens] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aEnviar, setAEnviar] = useState(false)

  const carregar = useCallback(async () => {
    setItens(await listarComentarios(taskId))
    setCarregando(false)
  }, [taskId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    const m = texto.trim()
    if (!m || aEnviar) return
    setAEnviar(true)
    await adicionarComentario(taskId, autor, m)
    setTexto('')
    setAEnviar(false)
    await carregar()
  }

  return (
    <div style={s.wrap}>
      {carregando ? <p style={s.muted}>A carregar…</p> : itens.length === 0 ? <p style={s.muted}>Sem respostas ainda.</p> : (
        <div style={s.lista}>
          {itens.map((c) => {
            const meu = !!autor.id && c.autor_id === autor.id
            return (
              <div key={c.id} style={{ ...s.bolha, ...(meu ? s.bolhaMinha : {}) }}>
                <div style={s.cab}>{c.autor_nome ?? 'Alguém'} · {dh(c.created_at)}</div>
                <div style={s.msg}>{c.mensagem}</div>
              </div>
            )
          })}
        </div>
      )}
      <div style={s.formLinha}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Escrever resposta…"
          style={s.input}
        />
        <button style={s.btn} disabled={!texto.trim() || aEnviar} onClick={enviar}>Responder</button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 },
  lista: { display: 'flex', flexDirection: 'column', gap: 6 },
  bolha: { background: '#f4f5f7', borderRadius: 10, padding: '7px 10px', maxWidth: '85%', alignSelf: 'flex-start' },
  bolhaMinha: { background: '#DBEAFE', alignSelf: 'flex-end' },
  cab: { fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 },
  msg: { fontSize: 13.5, whiteSpace: 'pre-wrap' },
  formLinha: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
}
