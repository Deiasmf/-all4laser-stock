'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarPedidos, type PedidoComContagem } from '@/lib/compras'
import { ESTADO_PEDIDO_CONFIG, ESTADO_PEDIDO_OPCOES, type EstadoPedido } from '@/types/compras'

const STORAGE_KEY = 'compras-filtros'

function lerFiltros(): { estado?: string; urgente?: boolean; mes?: string; pesquisa?: string } {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function EstadoTag({ estado }: { estado: EstadoPedido }) {
  const c = ESTADO_PEDIDO_CONFIG[estado]
  return <span style={{ fontSize: 12, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>{c.label}</span>
}

export default function ComprasPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<PedidoComContagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [guardados] = useState(lerFiltros)
  const [fEstado, setFEstado] = useState(guardados.estado ?? '')
  const [fUrgente, setFUrgente] = useState(!!guardados.urgente)
  const [fMes, setFMes] = useState(guardados.mes ?? '')
  const [pesquisa, setPesquisa] = useState(guardados.pesquisa ?? '')

  useEffect(() => {
    listarPedidos().then(setPedidos).finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ estado: fEstado, urgente: fUrgente, mes: fMes, pesquisa })) } catch { /* ignora */ }
  }, [fEstado, fUrgente, fMes, pesquisa])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return pedidos.filter((p) => {
      if (fEstado && p.estado !== fEstado) return false
      if (fUrgente && !p.urgente) return false
      if (fMes && (p.created_at ?? '').slice(0, 7) !== fMes) return false
      if (q && !`${p.numero ?? ''} ${p.criado_por_nome ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [pedidos, fEstado, fUrgente, fMes, pesquisa])

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>Pedidos de Compra</h1>
        <Link href="/compras/novo" className="a4l-btn">+ Novo Pedido de Compra</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="a4l-input" style={{ flex: 1, minWidth: 200 }} placeholder="Pesquisar por nº ou autor..." value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} />
        <select className="a4l-input" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos os estados</option>
          {ESTADO_PEDIDO_OPCOES.map((e) => <option key={e} value={e}>{ESTADO_PEDIDO_CONFIG[e].label}</option>)}
        </select>
        <input className="a4l-input" type="month" value={fMes} onChange={(e) => setFMes(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--a4l-text-mid)' }}>
          <input type="checkbox" checked={fUrgente} onChange={(e) => setFUrgente(e.target.checked)} /> Só urgentes
        </label>
      </div>

      {carregando ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', padding: 24, textAlign: 'center' }}>
          {pedidos.length === 0 ? 'Ainda não há pedidos de compra.' : 'Nenhum pedido corresponde aos filtros.'}
        </p>
      ) : (
        <div className="a4l-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['Número', 'Data', 'Estado', '', 'Itens', 'Criado por'].map((h, i) => (
                  <th key={i} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} onClick={() => router.push(`/compras/${p.id}`)} style={{ cursor: 'pointer', borderBottom: '0.5px solid var(--a4l-border)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>{p.numero ?? '—'}</td>
                  <td style={td}>{formatarData(p.created_at)}</td>
                  <td style={td}><EstadoTag estado={p.estado} /></td>
                  <td style={td}>{p.urgente ? '🔴' : ''}</td>
                  <td style={td}>{p.n_itens}</td>
                  <td style={td}>{p.criado_por_nome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', color: 'var(--a4l-text-light)', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--a4l-border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px 14px', color: 'var(--a4l-text-mid)', whiteSpace: 'nowrap' }
