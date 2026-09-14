'use client'

import { useMemo, useState } from 'react'
import { ligarEtiqueta, desligarEtiqueta, criarEtiqueta, type Etiqueta } from '@/lib/minhaArea'

// Chips de etiquetas de uma tarefa, com adicionar (das existentes ou criar nova)
// e remover. disponiveis = todas as etiquetas ativas. onMudou recarrega o pai
// (para atualizar a lista de etiquetas e a que aparece na tabela/lista).
const CORES = ['#6366F1', '#16A34A', '#DC2626', '#CA8A04', '#2563EB', '#DB2777', '#7C3AED', '#EA580C', '#374151', '#0891B2']

export default function EtiquetasTarefa({
  taskId, etiquetas, disponiveis, onMudou,
}: {
  taskId: string
  etiquetas: Etiqueta[]
  disponiveis: Etiqueta[]
  onMudou: () => void | Promise<void>
}) {
  const [aberto, setAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState(CORES[0])

  const naoUsadas = useMemo(() => {
    const ids = new Set(etiquetas.map((e) => e.id))
    return disponiveis.filter((e) => !ids.has(e.id))
  }, [etiquetas, disponiveis])

  async function adicionar(e: Etiqueta) { await ligarEtiqueta(taskId, e.id); setAberto(false); await onMudou() }
  async function remover(e: Etiqueta) { await desligarEtiqueta(taskId, e.id); await onMudou() }
  async function criarELigar() {
    const nome = novoNome.trim()
    if (!nome) return
    const { data, error } = await criarEtiqueta(nome, novaCor)
    if (!error && data) await ligarEtiqueta(taskId, (data as Etiqueta).id)
    setNovoNome(''); setAberto(false); await onMudou()
  }

  return (
    <div style={s.wrap}>
      {etiquetas.map((e) => (
        <span key={e.id} style={{ ...s.chip, color: e.cor, background: `${e.cor}1A`, borderColor: `${e.cor}55` }}>
          {e.nome}
          <button style={{ ...s.x, color: e.cor }} onClick={() => remover(e)} aria-label={`Remover ${e.nome}`}>✕</button>
        </span>
      ))}
      <div style={s.addWrap}>
        <button style={s.addBtn} onClick={() => setAberto((v) => !v)}>+ Etiqueta</button>
        {aberto && (
          <div style={s.pop}>
            {naoUsadas.length > 0 && (
              <div style={s.popLista}>
                {naoUsadas.map((e) => (
                  <button key={e.id} style={s.popItem} onClick={() => adicionar(e)}>
                    <span style={{ ...s.ponto, background: e.cor }} />{e.nome}
                  </button>
                ))}
              </div>
            )}
            <div style={s.criar}>
              <input value={novoNome} onChange={(ev) => setNovoNome(ev.target.value)} placeholder="Nova etiqueta"
                style={s.criarInput} onKeyDown={(ev) => { if (ev.key === 'Enter') criarELigar() }} />
              <div style={s.cores}>
                {CORES.map((cor) => (
                  <button key={cor} onClick={() => setNovaCor(cor)}
                    style={{ ...s.corBtn, background: cor, outline: novaCor === cor ? '2px solid #111' : 'none' }} aria-label={cor} />
                ))}
              </div>
              <button style={s.criarBtn} disabled={!novoNome.trim()} onClick={criarELigar}>Criar e adicionar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid', borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 700 },
  x: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, opacity: 0.7 },
  addWrap: { position: 'relative' },
  addBtn: { background: '#fff', border: '1px dashed var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  pop: { position: 'absolute', top: '110%', left: 0, zIndex: 30, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 10, width: 240, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
  popLista: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 },
  popItem: { display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 6px', borderRadius: 6, fontSize: 13, textAlign: 'left' },
  ponto: { width: 10, height: 10, borderRadius: 999, flexShrink: 0 },
  criar: { display: 'flex', flexDirection: 'column', gap: 8 },
  criarInput: { padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13 },
  cores: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  corBtn: { width: 20, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer' },
  criarBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
}
