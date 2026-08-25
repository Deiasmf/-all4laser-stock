'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { listarAnexos, carregarAnexo, apagarAnexo, type AnexoComUrl } from '@/lib/minhaArea'
import AnexoVista from './AnexoVista'

// Anexos ao nível da tarefa (comment_id nulo): lista + upload.
// A RLS do Storage/tabela decide quem pode ver, enviar e remover.
export default function AnexosTarefa({ taskId, autorId, soLeitura = false }: {
  taskId: string
  autorId: string | null
  soLeitura?: boolean
}) {
  const [anexos, setAnexos] = useState<AnexoComUrl[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const todos = await listarAnexos(taskId)
    setAnexos(todos.filter((a) => !a.comment_id))
    setCarregando(false)
  }, [taskId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setAEnviar(true); setErro(null)
    for (const f of files) {
      const { error } = await carregarAnexo(taskId, f, autorId)
      if (error) { setErro('Erro a enviar: ' + error.message); break }
    }
    setAEnviar(false)
    if (inputRef.current) inputRef.current.value = ''
    await carregar()
  }

  async function remover(a: AnexoComUrl) {
    if (!window.confirm(`Remover "${a.nome}"?`)) return
    const { error } = await apagarAnexo(a)
    if (error) { setErro('Erro a remover: ' + error.message); return }
    await carregar()
  }

  return (
    <div style={s.wrap}>
      {erro && <div style={s.erro}>{erro}</div>}
      {carregando ? <p style={s.muted}>A carregar…</p> : (
        anexos.length === 0 ? <p style={s.muted}>Sem anexos.</p> : (
          <div style={s.grelha}>
            {anexos.map((a) => (
              <AnexoVista key={a.id} anexo={a} onRemover={soLeitura ? undefined : () => remover(a)} />
            ))}
          </div>
        )
      )}
      {!soLeitura && (
        <div>
          <input ref={inputRef} type="file" multiple onChange={escolher} style={{ display: 'none' }} />
          <button style={s.btn} disabled={aEnviar} onClick={() => inputRef.current?.click()}>
            {aEnviar ? 'A enviar…' : '📎 Adicionar ficheiro/foto'}
          </button>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 },
  grelha: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  btn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 },
}
