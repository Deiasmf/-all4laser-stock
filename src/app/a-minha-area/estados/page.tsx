'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarEstados, criarEstado, atualizarEstado, estadoInfo,
  type EstadoInfo,
} from '@/lib/minhaArea'

// Gestão dos estados das tarefas (só admin). Permite acrescentar, renomear,
// mudar cores/ordem, marcar como "conta como concluído" e ativar/desativar.
// Não se apaga um estado (pode estar em uso); desativa-se para deixar de o
// oferecer nas tarefas.

function slugify(txt: string): string {
  return txt.normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export default function EstadosPage() {
  const { isAdmin, perfilCarregado } = useAuth()
  const router = useRouter()
  const [linhas, setLinhas] = useState<EstadoInfo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  // Novo estado
  const [nLabel, setNLabel] = useState('')
  const [nCor, setNCor] = useState('#374151')
  const [nBg, setNBg] = useState('#E5E7EB')

  useEffect(() => {
    if (perfilCarregado && !isAdmin) router.replace('/a-minha-area')
  }, [perfilCarregado, isAdmin, router])

  const carregar = useCallback(async () => {
    setLinhas(await listarEstados(true))   // inclui inativos
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  function editar(slug: string, patch: Partial<EstadoInfo>) {
    setLinhas((ls) => ls.map((l) => (l.slug === slug ? { ...l, ...patch } : l)))
  }

  async function guardar(l: EstadoInfo) {
    setAGuardar(l.slug); setMsg(null)
    const { error } = await atualizarEstado(l.slug, {
      label: l.label.trim(), cor: l.cor, bg: l.bg, ordem: l.ordem,
      is_concluido: l.is_concluido, ativo: l.ativo,
    })
    setAGuardar(null)
    if (error) { setMsg(`Erro a guardar: ${error.message}`); return }
    setMsg(`"${l.label}" guardado ✓`)
    await carregar()
  }

  async function adicionar() {
    const label = nLabel.trim()
    if (!label) return
    const slug = slugify(label)
    if (!slug) { setMsg('Nome inválido.'); return }
    if (linhas.some((l) => l.slug === slug)) { setMsg('Já existe um estado com esse nome.'); return }
    const ordem = Math.max(0, ...linhas.map((l) => l.ordem)) + 1
    setAGuardar('novo'); setMsg(null)
    const { error } = await criarEstado({
      slug, label, cor: nCor, bg: nBg, ordem, is_concluido: false, ativo: true,
    })
    setAGuardar(null)
    if (error) { setMsg(`Erro a criar: ${error.message}`); return }
    setMsg(`Estado "${label}" criado ✓`)
    setNLabel(''); setNCor('#374151'); setNBg('#E5E7EB')
    await carregar()
  }

  if (!perfilCarregado) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>
  if (!isAdmin) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/a-minha-area/atribuir" style={c.voltar}>← Atribuir tarefa / recado</Link>
        <h1 style={c.titulo}>⚙️ Estados das tarefas</h1>
        <p style={c.sub}>Acrescenta ou ajusta os estados que a equipa usa nas tarefas. Marca &quot;conta como concluído&quot; nos estados que devem contar como feito.</p>
      </div>

      {msg && <div style={c.msg}>{msg}</div>}

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          <section style={c.secao}>
            <div style={c.lista}>
              {linhas.map((l) => {
                const prev = estadoInfo(l.slug, linhas)
                return (
                  <div key={l.slug} style={{ ...c.card, ...(l.ativo ? {} : c.cardInativo) }}>
                    <div style={c.cardTopo}>
                      <span style={{ ...c.preview, color: prev.cor, background: prev.bg }}>{l.label || '—'}</span>
                      <span style={c.slug}>{l.slug}</span>
                    </div>
                    <div style={c.grelha}>
                      <label style={c.campo}><span style={c.rot}>Nome</span>
                        <input style={c.input} value={l.label} onChange={(e) => editar(l.slug, { label: e.target.value })} />
                      </label>
                      <label style={c.campo}><span style={c.rot}>Ordem</span>
                        <input type="number" style={c.input} value={l.ordem} onChange={(e) => editar(l.slug, { ordem: Number(e.target.value) })} />
                      </label>
                      <label style={c.campoCor}><span style={c.rot}>Texto</span>
                        <input type="color" style={c.inputCor} value={l.cor} onChange={(e) => editar(l.slug, { cor: e.target.value })} />
                      </label>
                      <label style={c.campoCor}><span style={c.rot}>Fundo</span>
                        <input type="color" style={c.inputCor} value={l.bg} onChange={(e) => editar(l.slug, { bg: e.target.value })} />
                      </label>
                    </div>
                    <div style={c.linhaOpcoes}>
                      <label style={c.check}>
                        <input type="checkbox" checked={l.is_concluido} onChange={(e) => editar(l.slug, { is_concluido: e.target.checked })} />
                        Conta como concluído
                      </label>
                      <label style={c.check}>
                        <input type="checkbox" checked={l.ativo} onChange={(e) => editar(l.slug, { ativo: e.target.checked })} />
                        Ativo
                      </label>
                      <button style={c.btnPrimario} disabled={aGuardar === l.slug} onClick={() => guardar(l)}>
                        {aGuardar === l.slug ? 'A guardar…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section style={c.secao}>
            <h2 style={c.h2}>+ Novo estado</h2>
            <div style={c.novaForm}>
              <div style={c.grelha}>
                <label style={c.campo}><span style={c.rot}>Nome</span>
                  <input style={c.input} value={nLabel} onChange={(e) => setNLabel(e.target.value)} placeholder="Ex.: A rever" />
                </label>
                <label style={c.campoCor}><span style={c.rot}>Texto</span>
                  <input type="color" style={c.inputCor} value={nCor} onChange={(e) => setNCor(e.target.value)} />
                </label>
                <label style={c.campoCor}><span style={c.rot}>Fundo</span>
                  <input type="color" style={c.inputCor} value={nBg} onChange={(e) => setNBg(e.target.value)} />
                </label>
              </div>
              <div style={c.linhaOpcoes}>
                <span style={{ ...c.preview, color: nCor, background: nBg }}>{nLabel || 'pré-visualização'}</span>
                <button style={c.btnPrimario} disabled={!nLabel.trim() || aGuardar === 'novo'} onClick={adicionar}>
                  {aGuardar === 'novo' ? 'A criar…' : 'Adicionar estado'}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  topo: { marginBottom: 14 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  secao: { marginBottom: 24 },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px' },
  msg: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '9px 12px', fontSize: 13.5, marginBottom: 12 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  cardInativo: { opacity: 0.6 },
  cardTopo: { display: 'flex', gap: 10, alignItems: 'center' },
  preview: { padding: '3px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 },
  slug: { fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  campoCor: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 90 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  inputCor: { width: '100%', height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', boxSizing: 'border-box' },
  linhaOpcoes: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  check: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: 'var(--foreground)' },
  novaForm: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' },
}
