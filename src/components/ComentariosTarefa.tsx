'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listarComentarios, adicionarComentario, listarAnexos, carregarAnexo, apagarAnexo,
  type Comentario, type AnexoComUrl,
} from '@/lib/minhaArea'
import AnexoVista from './AnexoVista'

// Fio de respostas/comentários de uma tarefa, com anexos por comentário.
// Reutilizado na área do colaborador e no acompanhamento do admin. A RLS decide
// quem vê/escreve (criador + destinatários da tarefa).
function dh(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ComentariosTarefa({ taskId, autor, soLeitura = false }: {
  taskId: string
  autor: { id: string | null; nome: string | null }
  // No painel de equipa mostramos o fio só para leitura (esconde a caixa de
  // resposta). Escrever continua reservado a criador/destinatários pela RLS.
  soLeitura?: boolean
}) {
  const [itens, setItens] = useState<Comentario[]>([])
  const [anexos, setAnexos] = useState<AnexoComUrl[]>([])
  const [texto, setTexto] = useState('')
  const [ficheiros, setFicheiros] = useState<File[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aEnviar, setAEnviar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const [cs, as] = await Promise.all([listarComentarios(taskId), listarAnexos(taskId)])
    setItens(cs)
    setAnexos(as.filter((a) => a.comment_id))   // só os anexos de comentários
    setCarregando(false)
  }, [taskId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const anexosDe = (commentId: string) => anexos.filter((a) => a.comment_id === commentId)

  async function enviar() {
    const m = texto.trim()
    if ((!m && ficheiros.length === 0) || aEnviar) return
    setAEnviar(true)
    // Um comentário só de anexo fica com uma mensagem mínima (a BD exige texto).
    const { data } = await adicionarComentario(taskId, autor, m || '📎 (anexo)')
    const commentId = (data as Comentario | null)?.id ?? null
    for (const f of ficheiros) await carregarAnexo(taskId, f, autor.id, commentId)
    setTexto(''); setFicheiros([])
    if (inputRef.current) inputRef.current.value = ''
    setAEnviar(false)
    await carregar()
  }

  async function remover(a: AnexoComUrl) {
    if (!window.confirm(`Remover "${a.nome}"?`)) return
    await apagarAnexo(a)
    await carregar()
  }

  return (
    <div style={s.wrap}>
      {carregando ? <p style={s.muted}>A carregar…</p> : itens.length === 0 ? <p style={s.muted}>Sem respostas ainda.</p> : (
        <div style={s.lista}>
          {itens.map((c) => {
            const meu = !!autor.id && c.autor_id === autor.id
            const as = anexosDe(c.id)
            return (
              <div key={c.id} style={{ ...s.bolha, ...(meu ? s.bolhaMinha : {}) }}>
                <div style={s.cab}>{c.autor_nome ?? 'Alguém'} · {dh(c.created_at)}</div>
                <div style={s.msg}>{c.mensagem}</div>
                {as.length > 0 && (
                  <div style={s.anexos}>
                    {as.map((a) => (
                      <AnexoVista key={a.id} anexo={a} onRemover={soLeitura ? undefined : () => remover(a)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!soLeitura && (
        <>
          {ficheiros.length > 0 && (
            <div style={s.selecionados}>
              {ficheiros.map((f, i) => (
                <span key={i} style={s.ficheiroTag}>
                  📎 {f.name}
                  <button style={s.tagX} onClick={() => setFicheiros((v) => v.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
                </span>
              ))}
            </div>
          )}
          <div style={s.formLinha}>
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
              onChange={(e) => setFicheiros(Array.from(e.target.files ?? []))} />
            <button style={s.clip} onClick={() => inputRef.current?.click()} title="Anexar ficheiro/foto" aria-label="Anexar">📎</button>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
              placeholder="Escrever resposta…"
              style={s.input}
            />
            <button style={s.btn} disabled={(!texto.trim() && ficheiros.length === 0) || aEnviar} onClick={enviar}>
              {aEnviar ? 'A enviar…' : 'Responder'}
            </button>
          </div>
        </>
      )}
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
  anexos: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  selecionados: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  ficheiroTag: { display: 'inline-flex', gap: 6, alignItems: 'center', background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', borderRadius: 999, padding: '3px 10px', fontSize: 12 },
  tagX: { background: 'none', border: 'none', color: '#3730A3', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 },
  formLinha: { display: 'flex', gap: 8, alignItems: 'center' },
  clip: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 15, lineHeight: 1 },
  input: { flex: 1, padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
}
