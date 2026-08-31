'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarAcessorios, criarAcessorio, apagarAcessorio, type AcessorioItem,
  listarCatalogoAcessorios, criarAcessorioCatalogo, type CatalogoAcessorio,
} from '@/lib/fichaProduto'

// Acessórios incluídos: dropdown com pesquisa (catálogo gerível), "+ Novo
// acessório" (guarda no catálogo) e possibilidade de texto livre pontual.
const norm = (s: string) => s.trim().toLowerCase()

export default function AcessoriosEquip({ equipamentoId, textoLegado, onChange }: {
  equipamentoId: string
  textoLegado?: string | null
  onChange?: () => void
}) {
  const { perfil } = useAuth()
  const podeEditar = !!perfil?.id
  const [itens, setItens] = useState<AcessorioItem[]>([])
  const [catalogo, setCatalogo] = useState<CatalogoAcessorio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novo, setNovo] = useState('')
  const [aberto, setAberto] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const [i, c] = await Promise.all([listarAcessorios(equipamentoId), listarCatalogoAcessorios()])
    setItens(i); setCatalogo(c); setCarregando(false)
  }, [equipamentoId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function fora(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const jaTem = (nome: string) => itens.some((a) => norm(a.descricao) === norm(nome))
  const sugestoes = catalogo
    .filter((c) => (novo.trim() ? norm(c.nome).includes(norm(novo)) : true) && !jaTem(c.nome))
    .slice(0, 8)
  const matchExato = catalogo.some((c) => norm(c.nome) === norm(novo))

  async function adicionarAoEquip(nome: string) {
    const d = nome.trim()
    if (!d || jaTem(d)) { setNovo(''); setAberto(false); return }
    const ordem = itens.reduce((mx, a) => Math.max(mx, a.ordem ?? 0), 0) + 1
    await criarAcessorio(equipamentoId, d, ordem)
    setNovo(''); setAberto(false)
    await carregar(); onChange?.()
  }
  async function novoNoCatalogo(nome: string) {
    await criarAcessorioCatalogo(nome)
    await adicionarAoEquip(nome)
  }
  async function remover(a: AcessorioItem) {
    await apagarAcessorio(a.id)
    await carregar(); onChange?.()
  }

  return (
    <div style={s.seccao}>
      <div style={s.cab}><span style={s.titulo}>Acessórios incluídos</span></div>

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
            <div ref={wrapRef} style={s.wrap}>
              <div style={s.addLinha}>
                <input
                  style={s.input} value={novo}
                  onChange={(e) => { setNovo(e.target.value); setAberto(true) }}
                  onFocus={() => setAberto(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarAoEquip(novo) } }}
                  placeholder="Escolher do catálogo ou escrever…"
                />
                <button style={s.btnPrim} disabled={!novo.trim()} onClick={() => adicionarAoEquip(novo)} title="Adicionar a este equipamento">
                  + Adicionar
                </button>
              </div>

              {aberto && (sugestoes.length > 0 || (novo.trim() && !matchExato)) && (
                <div style={s.dropdown}>
                  {sugestoes.map((c) => (
                    <button key={c.id} style={s.opt} onClick={() => adicionarAoEquip(c.nome)}>{c.nome}</button>
                  ))}
                  {novo.trim() && !matchExato && (
                    <button style={{ ...s.opt, ...s.optNovo }} onClick={() => novoNoCatalogo(novo)}>
                      ➕ Novo acessório «{novo.trim()}» (guardar no catálogo)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {podeEditar && <p style={s.dica}>Escreve e usa &ldquo;+ Adicionar&rdquo; para um item pontual, ou &ldquo;Novo acessório&rdquo; para o guardar no catálogo reutilizável.</p>}

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
  wrap: { position: 'relative' },
  addLinha: { display: 'flex', gap: 8 },
  input: { flex: 1, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  dropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' },
  opt: { display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid #f0f0f0', padding: '9px 12px', fontSize: 13.5, cursor: 'pointer', font: 'inherit' },
  optNovo: { color: 'var(--primary)', fontWeight: 700 },
  dica: { fontSize: 12, color: 'var(--muted)', marginTop: 8, marginBottom: 0 },
  legado: { fontSize: 12.5, color: 'var(--muted)', marginTop: 10, marginBottom: 0, whiteSpace: 'pre-wrap' },
}
