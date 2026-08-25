'use client'

import { useCallback, useEffect, useState } from 'react'
import { listarHistorico, type HistoricoItem } from '@/lib/minhaArea'

// Linha do tempo (só leitura) de uma tarefa: quem alterou o quê e quando.
// É gravada por triggers na BD, por isso não há nada a escrever aqui.
function dh(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const ICONE: Record<string, string> = {
  criacao: '✨', campo: '✏️', estado: '🔄', reatribuicao: '👥',
}

export default function HistoricoTarefa({ taskId }: { taskId: string }) {
  const [itens, setItens] = useState<HistoricoItem[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setItens(await listarHistorico(taskId))
    setCarregando(false)
  }, [taskId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  return (
    <div style={s.wrap}>
      {carregando ? <p style={s.muted}>A carregar…</p> : itens.length === 0 ? <p style={s.muted}>Sem histórico.</p> : (
        <div style={s.lista}>
          {itens.map((h) => (
            <div key={h.id} style={s.linha}>
              <span style={s.icone}>{ICONE[h.tipo] ?? '•'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={s.desc}>{h.descricao}</div>
                <div style={s.meta}>{h.ator_nome ?? 'Alguém'} · {dh(h.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 8 },
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '2px solid var(--border)', paddingLeft: 12 },
  linha: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  icone: { fontSize: 13, lineHeight: '18px', flexShrink: 0 },
  desc: { fontSize: 13, whiteSpace: 'pre-wrap' },
  meta: { fontSize: 11.5, color: 'var(--muted)', marginTop: 1 },
}
