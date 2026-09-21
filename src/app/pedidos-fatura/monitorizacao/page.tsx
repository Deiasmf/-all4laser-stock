'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarPedidosFatura, carregarConfigPedidos } from '@/lib/pedidosFatura'
import {
  ESTADOS_ABERTOS, estadoPedidoInfo, type PedidoFatura, type PedidoFaturaConfig,
} from '@/types/pedidoFatura'

// Monitorização de tempos de resposta dos pedidos de fatura (admin/financeiro).

const H = 3600_000

function horasEntre(ini: string, fim: string): number {
  return (new Date(fim).getTime() - new Date(ini).getTime()) / H
}
function fmtDuracao(horas: number): string {
  if (horas < 1) return `${Math.max(0, Math.round(horas * 60))} min`
  if (horas < 48) return `${horas.toFixed(1)} h`
  return `${(horas / 24).toFixed(1)} dias`
}
function mesLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

export default function MonitorizacaoPedidosPage() {
  const { isFinanceiro, perfilCarregado } = useAuth()
  const [pedidos, setPedidos] = useState<PedidoFatura[]>([])
  const [cfg, setCfg] = useState<PedidoFaturaConfig | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([listarPedidosFatura(), carregarConfigPedidos()]).then(([p, c]) => {
      setPedidos(p); setCfg(c); setCarregando(false)
    })
  }, [])

  const limiteHoras = cfg?.lembrete_horas ?? 48

  const linhas = useMemo(() => {
    const agora = new Date().toISOString()
    return pedidos.map((p) => {
      const aberto = ESTADOS_ABERTOS.includes(p.estado)
      const fim = p.respondido_em ?? p.enviado_em
      const horas = aberto ? horasEntre(p.created_at, agora) : (fim ? horasEntre(p.created_at, fim) : null)
      return { p, aberto, horas, atrasado: aberto && horas != null && horas > limiteHoras }
    })
  }, [pedidos, limiteHoras])

  // Média mensal do tempo de resposta (só pedidos já respondidos).
  const medias = useMemo(() => {
    const m = new Map<string, { soma: number; n: number; label: string; ordem: string }>()
    for (const l of linhas) {
      if (l.aberto || l.horas == null) continue
      const chave = l.p.created_at.slice(0, 7)
      const cur = m.get(chave) ?? { soma: 0, n: 0, label: mesLabel(l.p.created_at), ordem: chave }
      cur.soma += l.horas; cur.n += 1
      m.set(chave, cur)
    }
    return [...m.values()].sort((a, b) => b.ordem.localeCompare(a.ordem))
  }, [linhas])

  const abertos = linhas.filter((l) => l.aberto)
  const atrasados = abertos.filter((l) => l.atrasado)

  if (perfilCarregado && !isFinanceiro) {
    return <main style={c.page}><p style={c.info}>Sem acesso. Esta área é do financeiro/administração.</p></main>
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>📊 Monitorização — Pedidos de Fatura</h1>
        <Link href="/pedidos-fatura" style={c.voltar}>← Pedidos</Link>
      </div>

      <div style={c.cards}>
        <div style={{ ...c.card, borderTop: '3px solid #1E40AF' }}>
          <div style={c.cardNum}>{abertos.length}</div>
          <div style={c.cardLbl}>Abertos</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #B91C1C' }}>
          <div style={{ ...c.cardNum, color: atrasados.length ? '#B91C1C' : undefined }}>{atrasados.length}</div>
          <div style={c.cardLbl}>Parados &gt; {limiteHoras}h</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #065F46' }}>
          <div style={c.cardNum}>{medias[0] ? fmtDuracao(medias[0].soma / medias[0].n) : '—'}</div>
          <div style={c.cardLbl}>Média este mês</div>
        </div>
      </div>

      {medias.length > 0 && (
        <section style={c.bloco}>
          <h2 style={c.blocoTitulo}>Tempo médio de resposta por mês</h2>
          {medias.map((m) => (
            <div key={m.ordem} style={c.mediaLinha}>
              <span style={{ textTransform: 'capitalize' }}>{m.label}</span>
              <span><strong>{fmtDuracao(m.soma / m.n)}</strong> <span style={{ color: 'var(--muted)' }}>({m.n})</span></span>
            </div>
          ))}
        </section>
      )}

      <section style={c.bloco}>
        <h2 style={c.blocoTitulo}>Pedidos</h2>
        {carregando ? (
          <p style={c.info}>A carregar…</p>
        ) : linhas.length === 0 ? (
          <p style={c.info}>Sem pedidos.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linhas.map(({ p, aberto, horas, atrasado }) => {
              const est = estadoPedidoInfo(p.estado)
              return (
                <Link key={p.id} href={`/pedidos-fatura/${p.id}`} style={{ ...c.linha, ...(atrasado ? c.linhaAtraso : null) }}>
                  <span style={c.num}>{p.numero ?? '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nome}</span>
                  <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                  <span style={c.tempo}>
                    {horas == null ? '—' : aberto ? `há ${fmtDuracao(horas)}` : fmtDuracao(horas)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  info: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' },
  cardNum: { fontSize: 28, fontWeight: 800, color: 'var(--primary)' },
  cardLbl: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  bloco: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 },
  blocoTitulo: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  mediaLinha: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 },
  linha: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, textDecoration: 'none', color: 'inherit', fontSize: 14 },
  linhaAtraso: { borderColor: '#FCA5A5', background: '#FEF2F2' },
  num: { fontWeight: 800, color: 'var(--primary)', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  tempo: { fontSize: 13, color: 'var(--muted)', minWidth: 80, textAlign: 'right' },
}
