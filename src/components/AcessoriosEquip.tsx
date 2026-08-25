'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { listarAcessorios, criarAcessorio, apagarAcessorio, type AcessorioItem } from '@/lib/fichaProduto'

// Lista gerível de acessórios incluídos. Mostra também o texto original
// (legado) se existir, para referência enquanto se afina a lista.
export default function AcessoriosEquip({ equipamentoId, textoLegado, onChange }: {
  equipamentoId: string
  textoLegado?: string | null
  onChange?: () => void
}) {
  const { perfil } = useAuth()
  const podeEditar = !!perfil?.id
  const [itens, setItens] = useState<AcessorioItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novo, setNovo] = useState('')

  const carregar = useCallback(async () => {
    setItens(await listarAcessorios(equipamentoId)); setCarregando(false)
  }, [equipamentoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    const d = novo.trim()
    if (!d) return
    const ordem = itens.reduce((mx, a) => Math.max(mx, a.ordem ?? 0), 0) + 1
    await criarAcessorio(equipamentoId, d, ordem)
    setNovo('')
    await carregar(); onChange?.()
  }
  async function remover(a: AcessorioItem) {
    await apagarAcessorio(a.id)
    await carregar(); onChange?.()
  }

  return (
    <div style={s.seccao}>
      <div style={s.cab}>
        <span style={s.titulo}>Acessórios incluídos</span>
      </div>

      {carregando ? <p style={s.muted}>A carregar…</p> : (
        <>
          {itens.length === 0 ? <p style={s.muted}>Sem acessórios na lista.</p> : (
            <div style={s.chips}>
              {itens.map((a) => (
                <span key={a.id} style={s.chip}>
                  {a.descricao}
                  {podeEditar && <button style={s.chipX} onClick={() => remover(a)} title="Remover" aria-label="Remover">✕</button>}
                </span>
              ))}
            </div>
          )}

          {podeEditar && (
            <div style={s.addLinha}>
              <input
                style={s.input} value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
                placeholder="Adicionar acessório (ex.: Pedal)"
              />
              <button style={s.btnPrim} disabled={!novo.trim()} onClick={adicionar}>+ Adicionar</button>
            </div>
          )}

          {textoLegado && textoLegado.trim() && (
            <p style={s.legado}><strong>Texto original:</strong> {textoLegado}</p>
          )}
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  muted: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f4f5f7', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 13 },
  chipX: { background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 },
  addLinha: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  legado: { fontSize: 12.5, color: 'var(--muted)', marginTop: 10, marginBottom: 0, whiteSpace: 'pre-wrap' },
}
