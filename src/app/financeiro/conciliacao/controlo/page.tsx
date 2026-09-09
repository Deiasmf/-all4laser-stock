'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  listarContas, carregarControlo, formatarValor,
  type ContaBancaria, type ControloConta,
} from '@/lib/conciliacaoBancaria'

export default function ControloConciliacaoPage() {
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [contaId, setContaId] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [dados, setDados] = useState<ControloConta[]>([])
  const [aCarregar, setACarregar] = useState(false)

  const carregar = useCallback(async () => {
    setACarregar(true)
    setDados(await carregarControlo({ conta_id: contaId || undefined, de: de || undefined, ate: ate || undefined }))
    setACarregar(false)
  }, [contaId, de, ate])

  useEffect(() => { listarContas().then(setContas) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro/conciliacao" style={c.voltar}>← Conciliação</Link>
          <h1 style={c.titulo}>📊 Controlo da conciliação</h1>
          <p style={c.sub}>Por conta e período: total de recebimentos vs conciliado, ignorado e o que falta.</p>
        </div>
        <Link href="/financeiro/conciliacao/fila" style={c.btnSec}>Ir conciliar →</Link>
      </div>

      <section style={c.filtros}>
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={c.select}>
          <option value="">Todas as contas</option>
          {contas.map((cc) => <option key={cc.id} value={cc.id}>{cc.nome}</option>)}
        </select>
        <label style={c.lbl}>De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={c.date} /></label>
        <label style={c.lbl}>Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={c.date} /></label>
        {aCarregar && <span style={c.muted}>A carregar…</span>}
      </section>

      {dados.length === 0 && !aCarregar && <p style={c.vazio}>Sem movimentos no filtro escolhido.</p>}

      {dados.map((cc) => {
        const cr = cc.creditos
        return (
          <section key={cc.conta_id} style={c.card}>
            <div style={c.cardTitulo}>{cc.conta_nome} <span style={c.muted}>({cc.moeda})</span></div>

            <div style={c.barra}>
              <Faixa cor="#10B981" v={cr.conciliado.soma} tot={cr.total.soma} />
              <Faixa cor="#F59E0B" v={cr.ignorado.soma} tot={cr.total.soma} />
              <Faixa cor="#9CA3AF" v={cr.porConciliar.soma} tot={cr.total.soma} />
            </div>

            <div style={c.kpis}>
              <Kpi tit="Recebimentos (crédito)" n={cr.total.n} v={formatarValor(cr.total.soma, cc.moeda)} cor="#1E40AF" bg="#DBEAFE" />
              <Kpi tit="Conciliado" n={cr.conciliado.n} v={formatarValor(cr.conciliado.soma, cc.moeda)} cor="#065F46" bg="#D1FAE5" />
              <Kpi tit="Ignorado" n={cr.ignorado.n} v={formatarValor(cr.ignorado.soma, cc.moeda)} cor="#92400E" bg="#FEF3C7" />
              <Kpi tit="Por conciliar" n={cr.porConciliar.n} v={formatarValor(cr.porConciliar.soma, cc.moeda)} cor="#374151" bg="#F3F4F6" destaque />
              <Kpi tit="Saídas (débito)" n={cc.debitos.n} v={formatarValor(cc.debitos.soma, cc.moeda)} cor="#6B7280" bg="#F9FAFB" />
            </div>

            {cr.porConciliar.n > 0 && (
              <Link href="/financeiro/conciliacao/fila" style={c.pendente}>
                ⏳ Faltam <strong>{cr.porConciliar.n}</strong> recebimento(s) por conciliar ({formatarValor(cr.porConciliar.soma, cc.moeda)}) — ir tratar →
              </Link>
            )}

            {cc.meses.length > 0 && (
              <div style={c.tabela}>
                <div style={{ ...c.linha, ...c.cab }}>
                  <span>Mês</span>
                  <span style={{ textAlign: 'right' }}>Recebido</span>
                  <span style={{ textAlign: 'right' }}>Conciliado</span>
                  <span style={{ textAlign: 'right' }}>Ignorado</span>
                  <span style={{ textAlign: 'right' }}>Por conciliar</span>
                </div>
                {cc.meses.map((m) => (
                  <div key={m.mes} style={c.linha}>
                    <span>{m.mes}</span>
                    <span style={{ textAlign: 'right' }}>{formatarValor(m.total, cc.moeda)}</span>
                    <span style={{ textAlign: 'right', color: '#065F46' }}>{formatarValor(m.conciliado, cc.moeda)}</span>
                    <span style={{ textAlign: 'right', color: '#92400E' }}>{formatarValor(m.ignorado, cc.moeda)}</span>
                    <span style={{ textAlign: 'right', color: m.porConciliar > 0 ? '#B91C1C' : 'var(--muted)', fontWeight: m.porConciliar > 0 ? 700 : 400 }}>{formatarValor(m.porConciliar, cc.moeda)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}

function Faixa({ v, tot, cor }: { v: number; tot: number; cor: string }) {
  const pct = tot > 0 ? Math.max(0, (v / tot) * 100) : 0
  if (pct <= 0) return null
  return <div style={{ width: `${pct}%`, background: cor, height: '100%' }} title={`${pct.toFixed(0)}%`} />
}

function Kpi({ tit, n, v, cor, bg, destaque }: { tit: string; n: number; v: string; cor: string; bg: string; destaque?: boolean }) {
  return (
    <div style={{ ...c.kpi, background: bg, ...(destaque ? { outline: '2px solid #D1D5DB' } : {}) }}>
      <div style={c.kpiTit}>{tit}</div>
      <div style={{ ...c.kpiV, color: cor }}>{v}</div>
      <div style={c.kpiN}>{n} mov.</div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  filtros: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 },
  lbl: { fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' },
  date: { padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 },
  vazio: { textAlign: 'center', color: 'var(--muted)', padding: 30, fontSize: 15 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--primary)' },
  barra: { display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: '#F3F4F6' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  kpi: { borderRadius: 10, padding: '10px 12px' },
  kpiTit: { fontSize: 12, fontWeight: 700, color: '#374151' },
  kpiV: { fontSize: 17, fontWeight: 800, margin: '2px 0' },
  kpiN: { fontSize: 11.5, color: '#6B7280' },
  pendente: { display: 'block', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '9px 12px', fontSize: 13.5, textDecoration: 'none' },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 600 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnSec: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' },
}
