'use client'

import { useRef } from 'react'
import { estadoInfo, prioridadeInfo, prazoBadge, type MinhaTarefa, type EstadoInfo } from '@/lib/minhaArea'

function dData(d: string | null) {
  if (!d) return ''
  const [a, m, dia] = d.split('-'); return dia ? `${dia}/${m}/${a.slice(2)}` : d
}

// VISTA LISTA (estilo bullets/Notion): linhas limpas com checkbox para concluir,
// título e badges discretos. Reordenação por arrasto (ordem manual persistida).
// Clicar no título abre o detalhe.
export default function TarefasLista({
  tarefas, estados, onAbrir, onToggleConcluir, onReordenar,
}: {
  tarefas: MinhaTarefa[]          // já pela ordem a mostrar (ordem manual)
  estados: EstadoInfo[]
  onAbrir: (t: MinhaTarefa) => void
  onToggleConcluir: (t: MinhaTarefa) => void | Promise<void>
  onReordenar: (assigneeIdsOrdenados: string[]) => void | Promise<void>
}) {
  const arrastado = useRef<string | null>(null)

  async function largar(alvo: MinhaTarefa) {
    const de = arrastado.current
    arrastado.current = null
    if (!de || de === alvo.assigneeId) return
    const ids = tarefas.map((t) => t.assigneeId)
    const from = ids.indexOf(de); const to = ids.indexOf(alvo.assigneeId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    await onReordenar(ids)
  }

  if (tarefas.length === 0) return <p style={s.vazio}>Nada a mostrar.</p>

  return (
    <div style={s.lista}>
      {tarefas.map((t) => {
        const concluida = estadoInfo(t.meuEstado, estados).is_concluido
        const ei = estadoInfo(t.meuEstado, estados)
        const pi = prioridadeInfo(t.prioridade)
        const badge = prazoBadge(t.data_limite, concluida)
        return (
          <div
            key={t.id} style={s.linha}
            draggable
            onDragStart={() => { arrastado.current = t.assigneeId }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => largar(t)}
          >
            <span style={s.pega} title="Arrastar para reordenar">⠿</span>
            <button
              style={{ ...s.check, ...(concluida ? s.checkFeito : {}) }}
              onClick={() => onToggleConcluir(t)}
              title={concluida ? 'Reabrir' : 'Concluir'} aria-label="Concluir tarefa"
            >{concluida ? '✓' : ''}</button>
            <button style={{ ...s.titulo, ...(concluida ? s.tituloFeito : {}) }} onClick={() => onAbrir(t)}>
              {t.titulo}
            </button>
            <div style={s.badges}>
              {!concluida && <span style={{ ...s.dot, background: pi.cor }} title={`Prioridade ${pi.label}`} />}
              {t.sub.total > 0 && <span style={s.mini}>☑ {t.sub.feitas}/{t.sub.total}</span>}
              {t.etiquetas.slice(0, 2).map((e) => (
                <span key={e.id} style={{ ...s.chip, color: e.cor, background: `${e.cor}1A` }}>{e.nome}</span>
              ))}
              {t.etiquetas.length > 2 && <span style={s.mini}>+{t.etiquetas.length - 2}</span>}
              {t.anexos > 0 && <span style={s.mini}>📎 {t.anexos}</span>}
              {badge ? <span style={{ ...s.badge, color: badge.cor, background: badge.bg }}>{badge.texto}</span>
                : t.data_limite && !concluida ? <span style={s.data}>{dData(t.data_limite)}</span> : null}
              {!concluida && !ei.is_concluido && ei.slug !== 'pendente' && (
                <span style={{ ...s.estado, color: ei.cor, background: ei.bg }}>{ei.label}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  lista: { display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  linha: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)' },
  pega: { color: '#C7CBD1', cursor: 'grab', fontSize: 14, userSelect: 'none', flexShrink: 0 },
  check: { width: 22, height: 22, borderRadius: 999, border: '2px solid var(--border)', background: '#fff', color: 'transparent', cursor: 'pointer', flexShrink: 0, fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  checkFeito: { background: '#065F46', borderColor: '#065F46', color: '#fff' },
  titulo: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, fontSize: 14.5, cursor: 'pointer', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tituloFeito: { textDecoration: 'line-through', color: 'var(--muted)' },
  badges: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 999, display: 'inline-block' },
  mini: { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 },
  chip: { borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  badge: { borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  data: { fontSize: 11.5, color: 'var(--muted)' },
  estado: { borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  vazio: { color: 'var(--muted)', fontSize: 14 },
}
