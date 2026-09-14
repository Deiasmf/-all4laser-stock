'use client'

import { useMemo, useState } from 'react'
import SeletorEstado from './SeletorEstado'
import {
  estadoInfo, prioridadeInfo, prazoBadge, PRIORIDADES,
  type MinhaTarefa, type EstadoInfo, type Prioridade,
} from '@/lib/minhaArea'

type Col = 'titulo' | 'estado' | 'prioridade' | 'prazo' | 'atualizado'
type Agrupar = 'nenhum' | 'estado' | 'prioridade'

function dh(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// VISTA TABELA: colunas ordenáveis, edição inline (estado/prioridade/prazo),
// agrupar por estado ou prioridade. Clicar no título abre o detalhe.
export default function TarefasTabela({
  tarefas, estados, onAbrir, onEstado, onPatch,
}: {
  tarefas: MinhaTarefa[]
  estados: EstadoInfo[]
  onAbrir: (t: MinhaTarefa) => void
  onEstado: (t: MinhaTarefa, estado: string, aguarda: string | null) => void | Promise<void>
  onPatch: (t: MinhaTarefa, patch: { prioridade?: Prioridade; data_limite?: string | null }) => void | Promise<void>
}) {
  const [ordCol, setOrdCol] = useState<Col>('prioridade')
  const [ordAsc, setOrdAsc] = useState(true)
  const [agrupar, setAgrupar] = useState<Agrupar>('nenhum')

  function clicarCol(c: Col) {
    if (c === ordCol) setOrdAsc((v) => !v)
    else { setOrdCol(c); setOrdAsc(true) }
  }

  const ordenadas = useMemo(() => {
    const dir = ordAsc ? 1 : -1
    const val = (t: MinhaTarefa): string | number => {
      switch (ordCol) {
        case 'titulo': return t.titulo.toLowerCase()
        case 'estado': return estadoInfo(t.meuEstado, estados).ordem
        case 'prioridade': return prioridadeInfo(t.prioridade).ordem
        case 'prazo': return t.data_limite ?? '9999-99-99'
        case 'atualizado': return t.updated_at
      }
    }
    return [...tarefas].sort((a, b) => {
      const va = val(a); const vb = val(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [tarefas, ordCol, ordAsc, estados])

  // Agrupamento
  const grupos = useMemo(() => {
    if (agrupar === 'nenhum') return [{ chave: '', label: '', itens: ordenadas }]
    const mapa = new Map<string, { label: string; ordem: number; itens: MinhaTarefa[] }>()
    for (const t of ordenadas) {
      let chave: string, label: string, ordem: number
      if (agrupar === 'estado') { const i = estadoInfo(t.meuEstado, estados); chave = i.slug; label = i.label; ordem = i.ordem }
      else { const i = prioridadeInfo(t.prioridade); chave = i.valor; label = i.label; ordem = i.ordem }
      const g = mapa.get(chave) ?? { label, ordem, itens: [] }
      g.itens.push(t); mapa.set(chave, g)
    }
    return [...mapa.entries()].sort((a, b) => a[1].ordem - b[1].ordem)
      .map(([chave, g]) => ({ chave, label: g.label, itens: g.itens }))
  }, [ordenadas, agrupar, estados])

  const seta = (c: Col) => (ordCol === c ? (ordAsc ? ' ▲' : ' ▼') : '')

  return (
    <div>
      <div style={s.controlos}>
        <label style={s.ctlLabel}>Agrupar:
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)} style={s.ctlSel}>
            <option value="nenhum">Nada</option>
            <option value="estado">Estado</option>
            <option value="prioridade">Prioridade</option>
          </select>
        </label>
      </div>

      <div style={s.scroll}>
        <table style={s.tabela}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.thClick }} onClick={() => clicarCol('titulo')}>Título{seta('titulo')}</th>
              <th style={{ ...s.th, ...s.thClick }} onClick={() => clicarCol('estado')}>Estado{seta('estado')}</th>
              <th style={{ ...s.th, ...s.thClick }} onClick={() => clicarCol('prioridade')}>Prioridade{seta('prioridade')}</th>
              <th style={{ ...s.th, ...s.thClick }} onClick={() => clicarCol('prazo')}>Prazo{seta('prazo')}</th>
              <th style={s.th}>Etiquetas</th>
              <th style={s.th} title="Anexos">📎</th>
              <th style={{ ...s.th, ...s.thClick }} onClick={() => clicarCol('atualizado')}>Atualizado{seta('atualizado')}</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <GrupoLinhas key={g.chave || 'todos'} label={g.label} itens={g.itens}
                estados={estados} onAbrir={onAbrir} onEstado={onEstado} onPatch={onPatch} agrupado={agrupar !== 'nenhum'} />
            ))}
            {tarefas.length === 0 && <tr><td colSpan={7} style={s.vazio}>Nada a mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GrupoLinhas({
  label, itens, estados, onAbrir, onEstado, onPatch, agrupado,
}: {
  label: string
  itens: MinhaTarefa[]
  estados: EstadoInfo[]
  onAbrir: (t: MinhaTarefa) => void
  onEstado: (t: MinhaTarefa, estado: string, aguarda: string | null) => void | Promise<void>
  onPatch: (t: MinhaTarefa, patch: { prioridade?: Prioridade; data_limite?: string | null }) => void | Promise<void>
  agrupado: boolean
}) {
  return (
    <>
      {agrupado && <tr><td colSpan={7} style={s.grupoCab}>{label} ({itens.length})</td></tr>}
      {itens.map((t) => {
        const pi = prioridadeInfo(t.prioridade)
        const concluida = estadoInfo(t.meuEstado, estados).is_concluido
        const badge = prazoBadge(t.data_limite, concluida)
        return (
          <tr key={t.id} style={s.tr}>
            <td style={s.tdTitulo}>
              <button style={s.tituloBtn} onClick={() => onAbrir(t)}>{t.titulo}</button>
              {t.sub.total > 0 && <span style={s.sub}>☑ {t.sub.feitas}/{t.sub.total}</span>}
            </td>
            <td style={s.td}>
              <SeletorEstado estados={estados} valor={t.meuEstado} aguardaOQue={t.meuAguardaOQue} onMudar={(e, a) => onEstado(t, e, a)} />
            </td>
            <td style={s.td}>
              <select value={t.prioridade} onChange={(e) => onPatch(t, { prioridade: e.target.value as Prioridade })}
                style={{ ...s.selPrio, color: pi.cor, background: pi.bg }}>
                {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </select>
            </td>
            <td style={s.td}>
              <div style={s.prazoCel}>
                <input type="date" value={(t.data_limite ?? '').slice(0, 10)} onChange={(e) => onPatch(t, { data_limite: e.target.value || null })} style={s.dateInput} />
                {badge && <span style={{ ...s.badge, color: badge.cor, background: badge.bg }}>{badge.texto}</span>}
              </div>
            </td>
            <td style={s.td}>
              <div style={s.chips}>
                {t.etiquetas.slice(0, 3).map((e) => (
                  <span key={e.id} style={{ ...s.chip, color: e.cor, background: `${e.cor}1A` }}>{e.nome}</span>
                ))}
                {t.etiquetas.length > 3 && <span style={s.mais}>+{t.etiquetas.length - 3}</span>}
              </div>
            </td>
            <td style={s.tdCentro}>{t.anexos > 0 ? t.anexos : ''}</td>
            <td style={s.tdMuted}>{dh(t.updated_at)}</td>
          </tr>
        )
      })}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  controlos: { display: 'flex', gap: 10, marginBottom: 8, justifyContent: 'flex-end' },
  ctlLabel: { fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 },
  ctlSel: { border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', font: 'inherit', fontSize: 12.5 },
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', background: '#FafafA' },
  thClick: { cursor: 'pointer', userSelect: 'none' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '8px 12px', verticalAlign: 'middle' },
  tdTitulo: { padding: '8px 12px', minWidth: 200 },
  tituloBtn: { background: 'none', border: 'none', padding: 0, textAlign: 'left', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--foreground)' },
  sub: { marginLeft: 8, fontSize: 11.5, color: 'var(--muted)' },
  tdCentro: { padding: '8px 12px', textAlign: 'center', color: 'var(--muted)' },
  tdMuted: { padding: '8px 12px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' },
  selPrio: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', font: 'inherit', appearance: 'none' },
  prazoCel: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dateInput: { border: '1px solid var(--border)', borderRadius: 8, padding: '4px 7px', font: 'inherit', fontSize: 12.5 },
  badge: { borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  chips: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  chip: { borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  mais: { fontSize: 11, color: 'var(--muted)', fontWeight: 700 },
  grupoCab: { padding: '10px 12px 4px', fontWeight: 800, fontSize: 12.5, color: 'var(--foreground)', background: '#F9FAFB' },
  vazio: { padding: 20, textAlign: 'center', color: 'var(--muted)' },
}
