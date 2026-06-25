'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listarEnvios, marcarPago } from '@/lib/enviosPecas'
import { estadoInfo, formatarEuro, type EnvioPeca } from '@/types/envioPecas'

const hoje = () => new Date().toISOString().slice(0, 10)

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function AdminEnviosPage() {
  const [envios, setEnvios] = useState<EnvioPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const todos = await listarEnvios()
    setEnvios(todos.filter((e) => e.estado === 'pronto_a_expedir' || e.estado === 'expedido'))
    setCarregando(false)
  }, [])
  // setState corre só após o await dentro de recarregar()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function togglePago(e: EnvioPeca) {
    setATrabalhar(e.id)
    await marcarPago(e.id, !e.pago, !e.pago ? hoje() : null)
    await recarregar()
    setATrabalhar(null)
  }

  return (
    <main style={c.page}>
      <h1 style={c.titulo}>Envios de Encomendas — Administrativo</h1>
      <p style={c.sub}>Encomendas prontas a expedir e expedidas. Clica no número para faturar, fazer carta de porte, expedir e enviar ao cliente.</p>

      {carregando ? (
        <p style={c.muted}>A carregar...</p>
      ) : envios.length === 0 ? (
        <p style={c.muted}>Nada a tratar de momento.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Número</span>
            <span>Cliente</span>
            <span>Responsável</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span style={{ textAlign: 'center' }}>Pago</span>
          </div>
          {envios.map((e) => (
            <div key={e.id} style={c.linha}>
              <span style={{ fontWeight: 700 }}>
                <Link href={`/logistico/envios-pecas/${e.id}`} style={c.link}>{e.numero ?? '—'}</Link>
              </span>
              <span>{e.cliente_nome ?? '—'}</span>
              <span style={c.muted2}>{e.responsavel_nome ?? '—'}</span>
              <span><EstadoBadge estado={e.estado} /></span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(e.valor_a_faturar)}</span>
              <span style={{ textAlign: 'center' }}>
                {e.estado === 'expedido' ? (
                  <button
                    onClick={() => togglePago(e)}
                    disabled={aTrabalhar === e.id}
                    title={e.pago ? 'Pago — clica para marcar não pago' : 'Não pago — clica para marcar pago'}
                    style={{ ...c.pagoPill, background: e.pago ? '#15803D' : '#DC2626' }}
                  >
                    {e.pago ? '🟢 Pago' : '🔴 Não'}
                  </button>
                ) : (
                  <span style={c.muted2}>—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 13, marginBottom: 16 },
  muted: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.1fr 1.1fr 0.9fr 0.8fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 760 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  link: { color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' },
  muted2: { color: 'var(--muted)', fontSize: 13 },
  pagoPill: { color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
}
