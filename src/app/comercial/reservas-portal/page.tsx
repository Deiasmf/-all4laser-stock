'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  listarTodasReservas, estadoInfo, modalidadeLabel, formatarData,
  MODELOS_RESERVA, type ReservaPortal,
} from '@/lib/reservasPortal'

const ESTADOS = ['pendente', 'confirmada', 'rejeitada', 'cancelada']

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function ReservasPortalPage() {
  const router = useRouter()
  const [reservas, setReservas] = useState<ReservaPortal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [estado, setEstado] = useState('')
  const [modelo, setModelo] = useState('')
  const [mes, setMes] = useState('')

  useEffect(() => {
    listarTodasReservas().then((r) => { setReservas(r); setCarregando(false) })
  }, [])

  const filtrados = useMemo(() => {
    return reservas.filter((r) => {
      if (estado && r.estado !== estado) return false
      if (modelo && r.modelo_equipamento !== modelo) return false
      if (mes && !(r.created_at ?? '').startsWith(mes)) return false
      return true
    })
  }, [reservas, estado, modelo, mes])

  const temFiltros = !!estado || !!modelo || !!mes

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Reservas Portal — Pedidos</h1>
      </div>

      <div style={c.filtros}>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{estadoInfo(s).label}</option>)}
        </select>
        <select value={modelo} onChange={(e) => setModelo(e.target.value)} style={c.select}>
          <option value="">Todos os modelos</option>
          {MODELOS_RESERVA.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.select} />
        {temFiltros && (
          <button style={c.btnGhost} onClick={() => { setEstado(''); setModelo(''); setMes('') }}>Limpar</button>
        )}
      </div>

      <div style={c.resumo}><span>{filtrados.length} pedido(s)</span></div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem pedidos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Número</span>
            <span>Data pedido</span>
            <span>Cliente</span>
            <span>Modelo</span>
            <span>Modalidade</span>
            <span>Datas pretendidas</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Ver</span>
          </div>
          {filtrados.map((r) => (
            <div key={r.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => router.push(`/comercial/reservas-portal/${r.id}`)}>
              <span style={{ fontWeight: 700 }}>{r.numero ?? '—'}</span>
              <span style={c.muted}>{(r.created_at ?? '').slice(0, 10)}</span>
              <span>{r.cliente_nome ?? '—'}</span>
              <span>{r.modelo_equipamento ?? '—'}</span>
              <span style={c.muted}>{modalidadeLabel(r.modalidade ?? '')}</span>
              <span style={c.muted}>{formatarData(r.data_inicio_pretendida)} – {formatarData(r.data_fim_pretendida)}</span>
              <span><EstadoBadge estado={r.estado} /></span>
              <span style={{ textAlign: 'right' }}>›</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.5fr 1.3fr 1.1fr 1.6fr 1fr 0.4fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 950 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
