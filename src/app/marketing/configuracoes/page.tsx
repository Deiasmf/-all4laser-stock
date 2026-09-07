'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  listarCanais, criarCanal, atualizarCanal, apagarCanal, reordenarCanais,
} from '@/lib/marketing'
import { invalidarCanais } from '@/lib/useCanais'
import { mensagemErro } from '@/lib/erros'
import type { CanalDef } from '@/types/marketing'

export default function MarketingConfiguracoesPage() {
  const [canais, setCanais] = useState<CanalDef[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoLabel, setNovoLabel] = useState('')
  const [novoEmoji, setNovoEmoji] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  const recarregar = useCallback(async () => {
    setCanais(await listarCanais(true)) // inclui inativos
    invalidarCanais()
    setCarregando(false)
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  async function adicionar() {
    if (!novoLabel.trim()) return
    setAGuardar(true); setErro(null)
    const { error } = await criarCanal(novoLabel, novoEmoji)
    setAGuardar(false)
    if (error) { setErro(mensagemErro(error as never)); return }
    setNovoLabel(''); setNovoEmoji(''); recarregar()
  }

  async function guardar(id: string, patch: { label?: string; emoji?: string | null; ativo?: boolean }) {
    const { error } = await atualizarCanal(id, patch)
    if (error) { setErro(mensagemErro(error as never)); return }
    recarregar()
  }

  async function remover(c: CanalDef) {
    if (!confirm(`Apagar o canal "${c.label}"? As publicações antigas que o usem passam a mostrar "${c.slug}".`)) return
    const { error } = await apagarCanal(c.id)
    if (error) { setErro(mensagemErro(error as never)); return }
    recarregar()
  }

  async function mover(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= canais.length) return
    const nova = [...canais]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    setCanais(nova)
    await reordenarCanais(nova.map((c) => c.id))
    recarregar()
  }

  return (
    <main style={s.page}>
      <Link href="/marketing" style={s.voltar}>← Marketing</Link>
      <h1 style={s.titulo}>Configurações</h1>

      <section className="a4l-card" style={{ padding: 18 }}>
        <div style={s.rotulo}>Canais de publicação</div>
        <p style={s.sub}>Os canais que aparecem ao criar publicações. Podes renomear, mudar o emoji, reordenar, desativar ou apagar. Desativar esconde de novas publicações sem afetar as antigas.</p>

        {erro && <p style={{ color: 'var(--danger)', marginBottom: 10 }}>{erro}</p>}
        {carregando && <p style={{ color: 'var(--muted)' }}>A carregar…</p>}

        {!carregando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {canais.map((c, i) => (
              <CanalLinha key={c.id} canal={c} primeiro={i === 0} ultimo={i === canais.length - 1}
                onGuardar={(p) => guardar(c.id, p)} onRemover={() => remover(c)}
                onSubir={() => mover(i, -1)} onDescer={() => mover(i, 1)} />
            ))}
          </div>
        )}

        <div style={s.novoBloco}>
          <div style={s.rotuloPequeno}>Adicionar canal</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...s.input, width: 70, textAlign: 'center' }} value={novoEmoji} onChange={(e) => setNovoEmoji(e.target.value)} placeholder="🎵" maxLength={4} />
            <input style={{ ...s.input, flex: 1, minWidth: 160 }} value={novoLabel} onChange={(e) => setNovoLabel(e.target.value)} placeholder="Nome do canal (ex.: TikTok)" onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }} />
            <button style={{ ...s.btnPri, ...(aGuardar || !novoLabel.trim() ? { opacity: 0.6 } : {}) }} disabled={aGuardar || !novoLabel.trim()} onClick={adicionar}>Adicionar</button>
          </div>
        </div>
      </section>
    </main>
  )
}

function CanalLinha({ canal, primeiro, ultimo, onGuardar, onRemover, onSubir, onDescer }: {
  canal: CanalDef; primeiro: boolean; ultimo: boolean
  onGuardar: (p: { label?: string; emoji?: string | null; ativo?: boolean }) => void
  onRemover: () => void; onSubir: () => void; onDescer: () => void
}) {
  const [label, setLabel] = useState(canal.label)
  const [emoji, setEmoji] = useState(canal.emoji ?? '')
  const alterado = label.trim() !== canal.label || (emoji.trim() || '') !== (canal.emoji ?? '')

  return (
    <div style={{ ...s.linha, opacity: canal.ativo ? 1 : 0.55 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button style={s.setinha} onClick={onSubir} disabled={primeiro} title="Subir">▲</button>
        <button style={s.setinha} onClick={onDescer} disabled={ultimo} title="Descer">▼</button>
      </div>
      <input style={{ ...s.input, width: 60, textAlign: 'center' }} value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
      <input style={{ ...s.input, flex: 1, minWidth: 120 }} value={label} onChange={(e) => setLabel(e.target.value)} />
      <code style={s.slug}>{canal.slug}</code>
      {alterado && <button style={s.btnMini} onClick={() => onGuardar({ label, emoji })}>Guardar</button>}
      {!canal.ativo && <span style={s.inativo}>inativo</span>}
      <button style={{ ...s.linkBtn, color: canal.ativo ? '#92400E' : '#166534' }}
        onClick={() => onGuardar({ ativo: !canal.ativo })}>{canal.ativo ? 'Desativar' : 'Ativar'}</button>
      <button style={{ ...s.linkBtn, color: 'var(--danger, #c0392b)' }} onClick={onRemover}>Apagar</button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 16px' },
  rotulo: { fontSize: 15, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  rotuloPequeno: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 },
  sub: { fontSize: 13.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 },
  linha: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 10, padding: 8 },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  slug: { fontSize: 12, color: 'var(--muted)', background: '#F3F4F6', padding: '2px 8px', borderRadius: 6 },
  inativo: { fontSize: 11.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 999 },
  setinha: { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 10, lineHeight: 1.1, padding: 0 },
  btnMini: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)' },
  novoBloco: { borderTop: '1px solid var(--border)', paddingTop: 14 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
}
