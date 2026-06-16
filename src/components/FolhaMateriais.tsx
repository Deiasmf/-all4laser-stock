'use client'

import { useEffect, useRef, useState } from 'react'
import {
  listarMateriaisFolha, adicionarMaterial, removerMaterial, pesquisarPecas,
} from '@/lib/pecas'
import type { Peca, FolhaMaterialComPeca } from '@/types/peca'

export default function FolhaMateriais({ folhaId }: { folhaId: string }) {
  const [materiais, setMateriais] = useState<FolhaMaterialComPeca[]>([])
  const [pecaSel, setPecaSel] = useState<Peca | null>(null)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Peca[]>([])
  const [aberto, setAberto] = useState(false)
  const [qtd, setQtd] = useState('1')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  async function carregar() {
    setMateriais(await listarMateriaisFolha(folhaId))
  }

  useEffect(() => {
    // setMateriais só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhaId])

  // Pesquisa de peças com debounce
  useEffect(() => {
    if (pecaSel) return
    const t = setTimeout(async () => {
      const r = await pesquisarPecas(texto)
      setResultados(r)
    }, 250)
    return () => clearTimeout(t)
  }, [texto, pecaSel])

  function escolher(p: Peca) {
    setPecaSel(p)
    setTexto(p.nome)
    setAberto(false)
  }

  function limparPeca() {
    setPecaSel(null)
    setTexto('')
    setResultados([])
  }

  async function adicionar() {
    setErro(null)
    if (!pecaSel) { setErro('Escolhe uma peça da lista.'); return }
    const q = Number(qtd)
    if (!q || q <= 0) { setErro('Indica uma quantidade válida.'); return }
    setAGuardar(true)
    const { error } = await adicionarMaterial(folhaId, pecaSel, q)
    setAGuardar(false)
    if (error) { setErro('Erro a adicionar: ' + error.message); return }
    limparPeca()
    setQtd('1')
    carregar()
  }

  async function remover(m: FolhaMaterialComPeca) {
    if (!confirm(`Remover "${m.descricao}" (x${m.quantidade})? O stock é reposto.`)) return
    const { error } = await removerMaterial(m.id)
    if (error) { alert('Erro a remover: ' + error.message); return }
    carregar()
  }

  const q = Number(qtd) || 0
  const semStock = pecaSel != null && q > pecaSel.quantidade

  return (
    <section style={s.seccao}>
      <div style={s.titulo}>Material utilizado (peças)</div>

      {/* Adicionar peça */}
      <div style={s.adicionar}>
        <div ref={boxRef} style={s.campoBusca}>
          <input
            style={s.input}
            placeholder="Procurar peça (nome, grupo, marca)..."
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setPecaSel(null); setAberto(true) }}
            onFocus={() => setAberto(true)}
          />
          {pecaSel && (
            <button style={s.limpar} onClick={limparPeca} title="Limpar" type="button">×</button>
          )}
          {aberto && !pecaSel && resultados.length > 0 && (
            <div style={s.dropdown}>
              {resultados.map((p) => (
                <button key={p.id} type="button" style={s.opcao} onClick={() => escolher(p)}>
                  <span style={{ fontWeight: 600 }}>{p.nome}</span>
                  <span style={s.opcaoMeta}>
                    {[p.marca, p.grupo].filter(Boolean).join(' · ')} · stock {p.quantidade}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          style={s.inputQtd}
          type="number"
          min={1}
          inputMode="numeric"
          value={qtd}
          onChange={(e) => setQtd(e.target.value)}
        />
        <button style={s.botao} onClick={adicionar} disabled={aGuardar} type="button">
          {aGuardar ? '...' : 'Adicionar'}
        </button>
      </div>

      {pecaSel && (
        <div style={s.stockInfo}>
          Stock atual de <strong>{pecaSel.nome}</strong>: {pecaSel.quantidade}
          {semStock && <span style={s.aviso}> — atenção: a quantidade excede o stock disponível</span>}
        </div>
      )}
      {erro && <div style={s.erro}>{erro}</div>}

      {/* Lista de material */}
      {materiais.length === 0 ? (
        <div style={s.vazio}>Ainda não foi registado material. O stock é descontado ao adicionar.</div>
      ) : (
        <div style={s.tabela}>
          {materiais.map((m) => (
            <div key={m.id} style={s.linha}>
              <span style={{ gridArea: 'nome', fontWeight: 600 }}>{m.descricao ?? '—'}</span>
              <span style={s.meta}>
                {m.peca ? [m.peca.marca, m.peca.grupo].filter(Boolean).join(' · ') : 'peça removida'}
                {m.peca && ` · stock ${m.peca.quantidade}`}
              </span>
              <span style={s.qtd}>×{m.quantidade}</span>
              <button style={s.remover} onClick={() => remover(m)} title="Remover" type="button">×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  titulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  adicionar: { display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
  campoBusca: { position: 'relative', flex: 1, minWidth: 180 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  limpar: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 },
  inputQtd: { width: 70, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  botao: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' },
  opcao: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  opcaoMeta: { fontSize: 12, color: 'var(--muted)' },
  stockInfo: { fontSize: 13, color: 'var(--muted)' },
  aviso: { color: 'var(--danger, #c62828)', fontWeight: 600 },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 10, color: '#c62828', fontSize: 14 },
  vazio: { fontSize: 13, color: 'var(--muted)' },
  tabela: { display: 'flex', flexDirection: 'column', gap: 6 },
  linha: { display: 'grid', gridTemplateColumns: '1fr auto auto', gridTemplateAreas: '"nome qtd rem" "meta qtd rem"', gap: '0 10px', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 },
  meta: { gridArea: 'meta', fontSize: 12, color: 'var(--muted)' },
  qtd: { gridArea: 'qtd', fontWeight: 700, fontSize: 15 },
  remover: { gridArea: 'rem', width: 26, height: 26, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--danger, #c62828)', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
}
