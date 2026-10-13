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

  const { linhas, t1, t2, t3 } = useMemo(() => {
    const agora = new Date().getTime()
    const t1: number[] = [] // resposta à 1ª emissão (pedido → proforma/fatura enviada)
    const t2: number[] = [] // pró-forma enviada → pagamento recebido
    const t3: number[] = [] // fatura final pedida → fatura final enviada
    const linhas = pedidos.map((p) => {
      const trabalho = ESTADOS_ABERTOS.includes(p.estado)
      const inicio = p.estado === 'fatura_pedida' ? (p.fatura_pedida_em ?? p.created_at) : p.created_at
      const horas = trabalho ? (agora - new Date(inicio).getTime()) / H : null
      const atrasado = trabalho && horas != null && horas > limiteHoras
      const envInicial = p.tipo === 'pro_forma' ? p.proforma_enviada_em : p.enviado_em
      if (envInicial) t1.push(horasEntre(p.created_at, envInicial))
      if (p.proforma_enviada_em && p.pagamento_recebido_em) t2.push(horasEntre(p.proforma_enviada_em, p.pagamento_recebido_em))
      if (p.fatura_pedida_em && p.fechado_em) t3.push(horasEntre(p.fatura_pedida_em, p.fechado_em))
      return { p, trabalho, horas, atrasado }
    })
    return { linhas, t1, t2, t3 }
  }, [pedidos, limiteHoras])

  const media = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
  const abertos = linhas.filter((l) => l.trabalho)
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
          <div style={c.cardLbl}>Em trabalho</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #B91C1C' }}>
          <div style={{ ...c.cardNum, color: atrasados.length ? '#B91C1C' : undefined }}>{atrasados.length}</div>
          <div style={c.cardLbl}>Parados &gt; {limiteHoras}h</div>
        </div>
      </div>

      {/* Os três tempos do ciclo, medidos em separado */}
      <section style={c.bloco}>
        <h2 style={c.blocoTitulo}>Tempos médios por etapa</h2>
        <div style={c.tempos}>
          <div style={c.tempoCard}>
            <div style={c.tempoLbl}>Resposta à emissão</div>
            <div style={c.tempoVal}>{media(t1) == null ? '—' : fmtDuracao(media(t1)!)}</div>
            <div style={c.tempoN}>pedido → documento enviado ({t1.length})</div>
          </div>
          <div style={c.tempoCard}>
            <div style={c.tempoLbl}>Até pagamento</div>
            <div style={c.tempoVal}>{media(t2) == null ? '—' : fmtDuracao(media(t2)!)}</div>
            <div style={c.tempoN}>pró-forma enviada → pagamento ({t2.length})</div>
          </div>
          <div style={c.tempoCard}>
            <div style={c.tempoLbl}>Resposta à fatura final</div>
            <div style={c.tempoVal}>{media(t3) == null ? '—' : fmtDuracao(media(t3)!)}</div>
            <div style={c.tempoN}>fatura pedida → fatura enviada ({t3.length})</div>
          </div>
        </div>
      </section>

      <section style={c.bloco}>
        <h2 style={c.blocoTitulo}>Pedidos</h2>
        {carregando ? (
          <p style={c.info}>A carregar…</p>
        ) : linhas.length === 0 ? (
          <p style={c.info}>Sem pedidos.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linhas.map(({ p, trabalho, horas, atrasado }) => {
              const est = estadoPedidoInfo(p.estado)
              return (
                <Link key={p.id} href={`/pedidos-fatura/${p.id}`} style={{ ...c.linha, ...(atrasado ? c.linhaAtraso : null) }}>
                  <span style={c.num}>{p.numero ?? '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nome}</span>
                  <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                  <span style={c.tempo}>
                    {horas == null ? '—' : trabalho ? `há ${fmtDuracao(horas)}` : ''}
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
  tempos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  tempoCard: { border: '1px solid var(--border)', borderRadius: 10, padding: 12, textAlign: 'center' },
  tempoLbl: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  tempoVal: { fontSize: 22, fontWeight: 800, color: 'var(--primary)', margin: '4px 0' },
  tempoN: { fontSize: 11.5, color: 'var(--muted)' },
  mediaLinha: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 },
  linha: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, textDecoration: 'none', color: 'inherit', fontSize: 14 },
  linhaAtraso: { borderColor: '#FCA5A5', background: '#FEF2F2' },
  num: { fontWeight: 800, color: 'var(--primary)', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  tempo: { fontSize: 13, color: 'var(--muted)', minWidth: 80, textAlign: 'right' },
}
