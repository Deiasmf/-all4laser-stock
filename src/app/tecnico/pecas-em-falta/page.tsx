'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarPecasFalta, agruparPorEquipamento, adicionarPecaFalta, marcarFaltasPedidas,
  type GrupoFalta, type FaltaInput,
} from '@/lib/pecasFalta'
import { criarPedido, type ItemInput } from '@/lib/compras'
import PecaAutocomplete from '@/components/PecaAutocomplete'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import { ESTADO_FALTA_CONFIG, type PecaFalta } from '@/types/compras'

function FaltaTag({ p }: { p: PecaFalta }) {
  const c = ESTADO_FALTA_CONFIG[p.estado]
  return <span style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{c.label}</span>
}

const colunasExport: ColunaExport<PecaFalta>[] = [
  { cabecalho: 'Equipamento (SN)', valor: (p) => p.equipamento_sn },
  { cabecalho: 'Modelo', valor: (p) => p.equipamento_modelo },
  { cabecalho: 'Peça', valor: (p) => p.peca_nome },
  { cabecalho: 'Quantidade', valor: (p) => p.quantidade_necessaria },
  { cabecalho: 'Estado', valor: (p) => ESTADO_FALTA_CONFIG[p.estado].label },
  { cabecalho: 'Notas', valor: (p) => p.notas },
]

export default function PecasEmFaltaPage() {
  const router = useRouter()
  const { session, perfil } = useAuth()
  const [grupos, setGrupos] = useState<GrupoFalta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aCriar, setACriar] = useState(false)

  // modal adicionar
  const [modal, setModal] = useState<GrupoFalta | null>(null)
  const [pNome, setPNome] = useState(''); const [pId, setPId] = useState<string | null>(null)
  const [pQtd, setPQtd] = useState('1'); const [pNotas, setPNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  async function carregar() {
    setGrupos(agruparPorEquipamento(await listarPecasFalta()))
    setCarregando(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  function toggleSel(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function abrirModal(g: GrupoFalta) {
    setModal(g); setPNome(''); setPId(null); setPQtd('1'); setPNotas('')
  }

  async function guardarFalta() {
    if (!modal || !pNome.trim()) return
    setAGuardar(true)
    const input: FaltaInput = {
      equipamento_id: modal.equipamento_id,
      equipamento_sn: modal.equipamento_sn,
      equipamento_modelo: modal.equipamento_modelo,
      peca_id: pId,
      peca_nome: pNome.trim(),
      quantidade_necessaria: Math.max(1, Number(pQtd) || 1),
      notas: pNotas.trim() || null,
      criado_por: session?.user.id ?? null,
      criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    }
    await adicionarPecaFalta(input)
    setAGuardar(false); setModal(null)
    carregar()
  }

  async function criarPedidoDaSelecao() {
    const selecionadas: PecaFalta[] = grupos.flatMap((g) => g.pecas).filter((p) => sel.has(p.id))
    if (selecionadas.length === 0) return
    setACriar(true)
    const itens: ItemInput[] = selecionadas.map((p) => ({ peca_id: p.peca_id, peca_nome: p.peca_nome ?? '', quantidade: p.quantidade_necessaria, notas: p.equipamento_sn ? `Equip. ${p.equipamento_sn}` : null }))
    const { data, error } = await criarPedido(
      { urgente: false, notas: 'Gerado a partir de peças em falta.', estado: 'rascunho' },
      itens, session?.user.id ?? null, perfil?.nome ?? perfil?.email ?? null
    )
    if (error || !data) { setACriar(false); alert('Erro ao criar o pedido.'); return }
    await marcarFaltasPedidas(selecionadas.map((p) => p.id))
    router.push(`/compras/${data.id}`)
  }

  const totalFalta = grupos.reduce((a, g) => a + g.pecas.filter((p) => p.estado === 'em_falta').length, 0)
  const linhasExport = grupos.flatMap((g) => g.pecas)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>Peças em Falta por Equipamento</h1>
          <Link href="/tecnico" style={{ color: 'var(--a4l-text-light)', textDecoration: 'none', fontSize: 14 }}>← Técnico</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <BotaoExportar nome="pecas-em-falta" colunas={colunasExport} linhas={linhasExport} />
          <button className="a4l-btn" disabled={sel.size === 0 || aCriar} onClick={criarPedidoDaSelecao} style={{ opacity: sel.size === 0 ? 0.5 : 1 }}>
            {aCriar ? 'A criar...' : `Criar Pedido de Compra (${sel.size})`}
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--a4l-text-light)', fontSize: 13, marginBottom: 12 }}>{totalFalta} peça(s) em falta · {grupos.length} equipamento(s)</p>

      {carregando ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>A carregar...</p>
      ) : grupos.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>Não há peças em falta registadas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map((g) => {
            const aberto = abertos[g.chave] ?? false
            const nFalta = g.pecas.filter((p) => p.estado === 'em_falta').length
            return (
              <div key={g.chave} className="a4l-card" style={{ padding: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                  <button onClick={() => setAbertos((a) => ({ ...a, [g.chave]: !aberto }))} className="a4l-btn-ghost" style={{ padding: '4px 10px' }}>{aberto ? '▾' : '▸'} Ver peças</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {g.equipamento_id ? (
                      <Link href={`/equipamentos/${g.equipamento_id}`} style={{ fontWeight: 700, color: 'var(--a4l-3)', textDecoration: 'none' }}>{g.equipamento_sn ?? '—'}</Link>
                    ) : (
                      <span style={{ fontWeight: 700, color: 'var(--a4l-text-dark)' }}>{g.equipamento_sn ?? '—'} <span style={{ fontSize: 11, color: 'var(--a4l-text-light)' }}>(não no stock)</span></span>
                    )}
                    <span style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}> · {g.equipamento_modelo ?? '—'}</span>
                  </div>
                  <span style={{ fontSize: 12, color: nFalta > 0 ? '#DC2626' : 'var(--a4l-text-light)', fontWeight: 700, whiteSpace: 'nowrap' }}>{nFalta} em falta</span>
                </div>

                {aberto && (
                  <div style={{ padding: '0 16px 14px' }}>
                    {g.pecas.map((p) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '0.5px solid var(--a4l-border)', fontSize: 14 }}>
                        {p.estado === 'em_falta' ? (
                          <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} />
                        ) : <span style={{ width: 13 }} />}
                        <span style={{ flex: 1, color: 'var(--a4l-text-mid)' }}>{p.peca_nome} {p.quantidade_necessaria > 1 && <span style={{ color: 'var(--a4l-text-light)' }}>×{p.quantidade_necessaria}</span>}</span>
                        <FaltaTag p={p} />
                      </div>
                    ))}
                    <button className="a4l-btn-ghost" style={{ marginTop: 10 }} onClick={() => abrirModal(g)}>+ Adicionar peça em falta</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} className="a4l-card" style={{ width: '100%', maxWidth: 460 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 4 }}>Adicionar peça em falta</h2>
            <p style={{ fontSize: 12.5, color: 'var(--a4l-text-light)', marginBottom: 12 }}>{modal.equipamento_sn} · {modal.equipamento_modelo ?? '—'}</p>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Peça</label>
              <PecaAutocomplete valor={pNome} onTexto={(v) => { setPNome(v); setPId(null) }} onEscolher={(p) => { setPNome(p.nome); setPId(p.id) }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 90 }}>
                <label style={lbl}>Quantidade</label>
                <input className="a4l-input" type="number" min={1} value={pQtd} onChange={(e) => setPQtd(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Notas</label>
                <input className="a4l-input" value={pNotas} onChange={(e) => setPNotas(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="a4l-btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="a4l-btn" disabled={aGuardar || !pNome.trim()} onClick={guardarFalta}>{aGuardar ? 'A guardar...' : 'Adicionar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--a4l-text-mid)', marginBottom: 4 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(13,11,43,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
