'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  cashflowMensal, listarContas, listarAlertas,
  formatarMoeda, TIPOS_ALERTA_LABEL,
  type CashflowLinha, type ContaComSaldo, type AlertaCC,
} from '@/lib/cc'

type FiltroTipo = 'todos' | 'prestacao' | 'venda'

function chaveMes(d: string) { return d.slice(0, 7) }
function rotuloMes(chave: string) {
  const [a, m] = chave.split('-')
  return new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })
}
function eur(v: number) { return formatarMoeda(v, 'EUR') }

export default function CashflowPage() {
  const [linhas, setLinhas] = useState<CashflowLinha[]>([])
  const [contas, setContas] = useState<ContaComSaldo[]>([])
  const [alertas, setAlertas] = useState<AlertaCC[]>([])
  const [carregando, setCarregando] = useState(true)
  const [contaId, setContaId] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')

  useEffect(() => {
    Promise.all([cashflowMensal(), listarContas(), listarAlertas()]).then(([l, c, a]) => {
      setLinhas(l); setContas(c); setAlertas(a); setCarregando(false)
    })
  }, [])

  // Janela: 2 meses atrás → 11 à frente (14 meses).
  const meses = useMemo(() => {
    const hoje = new Date()
    const base = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }, [])

  const filtradas = useMemo(() => linhas.filter((l) => {
    if (contaId && l.conta_id !== contaId) return false
    if (tipo !== 'todos' && l.categoria !== 'recebido' && l.categoria !== tipo) return false
    return true
  }), [linhas, contaId, tipo])

  // Agregação por mês em EUR (esperado = prestacao+venda; recebido à parte).
  const porMes = useMemo(() => {
    const mapa = new Map<string, { esperado: number; recebido: number }>()
    for (const m of meses) mapa.set(m, { esperado: 0, recebido: 0 })
    for (const l of filtradas) {
      const k = chaveMes(l.mes)
      const cel = mapa.get(k)
      if (!cel) continue
      if (l.categoria === 'recebido') cel.recebido += l.valor_eur
      else cel.esperado += l.valor_eur
    }
    return mapa
  }, [filtradas, meses])

  const maxVal = useMemo(() => {
    let mx = 0
    for (const m of meses) { const c = porMes.get(m)!; mx = Math.max(mx, c.esperado, c.recebido) }
    return mx || 1
  }, [porMes, meses])

  // Tabela por moeda (valores na moeda de origem).
  const porMoeda = useMemo(() => {
    const mapa = new Map<string, { esperado: number; recebido: number }>()
    for (const l of filtradas) {
      if (!meses.includes(chaveMes(l.mes))) continue
      const cel = mapa.get(l.moeda) ?? { esperado: 0, recebido: 0 }
      if (l.categoria === 'recebido') cel.recebido += l.valor
      else cel.esperado += l.valor
      mapa.set(l.moeda, cel)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtradas, meses])

  function exportarCsv() {
    const linhasCsv = [['Mes', 'Esperado_EUR', 'Recebido_EUR']]
    for (const m of meses) { const c = porMes.get(m)!; linhasCsv.push([m, c.esperado.toFixed(2), c.recebido.toFixed(2)]) }
    const csv = linhasCsv.map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'cashflow.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
          <h1 style={c.titulo}>📈 Cashflow</h1>
          <p style={c.sub}>Recebimentos esperados vs recebido real, por mês (em EUR).</p>
        </div>
        <button style={c.btnSec} onClick={exportarCsv}>Exportar CSV</button>
      </div>

      {alertas.length > 0 && (
        <div style={c.alertasCard}>
          <div style={c.alertasTitulo}>⚠️ {alertas.length} alerta(s)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertas.slice(0, 8).map((a, i) => (
              <Link key={i} href={`/contas-correntes/${a.conta_id}`} style={c.alertaLinha}>
                <span style={{ ...c.sevDot, background: a.severidade === 'alta' ? '#B91C1C' : '#D97706' }} />
                <span style={c.alertaTipo}>{TIPOS_ALERTA_LABEL[a.tipo]}</span>
                <span style={c.alertaConta}>{a.conta_nome}</span>
                <span style={c.alertaMsg}>{a.mensagem}</span>
              </Link>
            ))}
            {alertas.length > 8 && <span style={c.muted}>e mais {alertas.length - 8}…</span>}
          </div>
        </div>
      )}

      <div style={c.filtros}>
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={c.input}>
          <option value="">Todas as contas</option>
          {contas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)} style={c.input}>
          <option value="todos">Prestações + vendas</option>
          <option value="prestacao">Só prestações</option>
          <option value="venda">Só vendas (consignação)</option>
        </select>
      </div>

      {carregando ? <p style={c.estado}>A carregar...</p> : (
        <>
          {/* Gráfico de barras */}
          <div style={c.card}>
            <div style={c.legenda}>
              <span><span style={{ ...c.legDot, background: '#F59E0B' }} /> Esperado</span>
              <span><span style={{ ...c.legDot, background: '#10B981' }} /> Recebido</span>
            </div>
            <div style={c.grafico}>
              {meses.map((m) => {
                const cel = porMes.get(m)!
                return (
                  <div key={m} style={c.colMes}>
                    <div style={c.barras}>
                      <div style={{ ...c.barra, height: `${(cel.esperado / maxVal) * 150}px`, background: '#F59E0B' }} title={`Esperado: ${eur(cel.esperado)}`} />
                      <div style={{ ...c.barra, height: `${(cel.recebido / maxVal) * 150}px`, background: '#10B981' }} title={`Recebido: ${eur(cel.recebido)}`} />
                    </div>
                    <span style={c.mesRot}>{rotuloMes(m)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabela por moeda */}
          <div style={c.card}>
            <div style={c.cardTitulo}>Por moeda (na moeda de origem)</div>
            {porMoeda.length === 0 ? <p style={c.estado}>Sem valores na janela.</p> : (
              <div style={c.tabela}>
                <div style={{ ...c.linha, ...c.cab }}>
                  <span>Moeda</span>
                  <span style={{ textAlign: 'right' }}>Esperado</span>
                  <span style={{ textAlign: 'right' }}>Recebido</span>
                </div>
                {porMoeda.map(([moeda, v]) => (
                  <div key={moeda} style={c.linha}>
                    <span style={{ fontWeight: 700 }}>{moeda}</span>
                    <span style={{ textAlign: 'right' }}>{formatarMoeda(v.esperado, moeda)}</span>
                    <span style={{ textAlign: 'right', color: '#065F46' }}>{formatarMoeda(v.recebido, moeda)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnSec: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' },
  alertasCard: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: 14, marginBottom: 16 },
  alertasTitulo: { fontWeight: 700, color: '#92400E', marginBottom: 8, fontSize: 14 },
  alertaLinha: { display: 'flex', gap: 8, alignItems: 'center', textDecoration: 'none', color: 'inherit', fontSize: 13, flexWrap: 'wrap' },
  sevDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  alertaTipo: { fontWeight: 700, color: '#374151' },
  alertaConta: { color: 'var(--primary)', fontWeight: 600 },
  alertaMsg: { color: 'var(--muted)' },
  filtros: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  input: { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 },
  legenda: { display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 },
  legDot: { display: 'inline-block', width: 10, height: 10, borderRadius: 3, marginRight: 5 },
  grafico: { display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 6, minHeight: 190 },
  colMes: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 46 },
  barras: { display: 'flex', gap: 3, alignItems: 'flex-end', height: 150 },
  barra: { width: 14, borderRadius: '3px 3px 0 0', minHeight: 2 },
  mesRot: { fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6 },
  linha: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px', fontSize: 14, borderBottom: '1px solid #f3f3f3', alignItems: 'center' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  estado: { color: 'var(--muted)', padding: 12 },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
}
