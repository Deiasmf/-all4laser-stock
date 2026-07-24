'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { carregarAlertas, resumoAlertas, type Alerta, type CategoriaAlerta, type Severidade } from '@/lib/alertasFinanceiros'
import { formatarEuro } from '@/lib/contasCorrentes'

const CATEGORIAS: { valor: CategoriaAlerta; label: string }[] = [
  { valor: 'vencido_receber', label: 'Vencido a receber' },
  { valor: 'vencido_pagar', label: 'Vencido a pagar' },
  { valor: 'a_vencer', label: 'A vencer' },
  { valor: 'saldo_credor', label: 'Divergências' },
]

const SEV: Record<Severidade, { cor: string; bg: string; label: string }> = {
  critico: { cor: '#B91C1C', bg: '#FEF2F2', label: 'Crítico' },
  aviso: { cor: '#92400E', bg: '#FEF3C7', label: 'Aviso' },
  info: { cor: '#1E40AF', bg: '#DBEAFE', label: 'Info' },
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [diasAviso, setDiasAviso] = useState(7)
  const [cat, setCat] = useState<'' | CategoriaAlerta>('')

  useEffect(() => {
    let ativo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true)
    carregarAlertas(diasAviso).then((a) => { if (ativo) { setAlertas(a); setCarregando(false) } })
    return () => { ativo = false }
  }, [diasAviso])

  const resumo = useMemo(() => resumoAlertas(alertas), [alertas])
  const filtrados = useMemo(() => (cat ? alertas.filter((a) => a.categoria === cat) : alertas), [alertas, cat])

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🔔 Alertas</h1>
          <p style={c.sub}>Vencimentos, saldos e divergências — calculados em tempo real.</p>
        </div>
        <label style={c.diasBox}>
          A vencer nos próximos
          <input type="number" min={1} max={90} value={diasAviso}
            onChange={(e) => setDiasAviso(Math.max(1, Math.min(90, Number(e.target.value) || 7)))} style={c.diasInput} />
          dias
        </label>
      </div>

      {/* Cartões-resumo (clicáveis = filtro) */}
      <div style={c.cartoes}>
        <Cartao ativo={cat === 'vencido_receber'} onClick={() => setCat(cat === 'vencido_receber' ? '' : 'vencido_receber')}
          titulo="Vencido a receber" n={resumo.vencidoReceber.n} total={resumo.vencidoReceber.total} cor="#B91C1C" bg="#FEF2F2" />
        <Cartao ativo={cat === 'vencido_pagar'} onClick={() => setCat(cat === 'vencido_pagar' ? '' : 'vencido_pagar')}
          titulo="Vencido a pagar" n={resumo.vencidoPagar.n} total={resumo.vencidoPagar.total} cor="#9A3412" bg="#FFF7ED" />
        <Cartao ativo={cat === 'a_vencer'} onClick={() => setCat(cat === 'a_vencer' ? '' : 'a_vencer')}
          titulo={`A vencer (${diasAviso}d)`} n={resumo.aVencer.n} total={resumo.aVencer.total} cor="#1E40AF" bg="#EFF6FF" />
        <Cartao ativo={cat === 'saldo_credor'} onClick={() => setCat(cat === 'saldo_credor' ? '' : 'saldo_credor')}
          titulo="Divergências" n={resumo.divergencias.n} total={resumo.divergencias.total} cor="#5B21B6" bg="#F5F3FF" />
      </div>

      <div style={c.barraFiltro}>
        <span>{filtrados.length} alerta(s){cat ? ` · ${CATEGORIAS.find((x) => x.valor === cat)?.label}` : ''}</span>
        {resumo.criticos > 0 && <span style={c.criticosPill}>{resumo.criticos} crítico(s)</span>}
        {cat && <button style={c.btnGhost} onClick={() => setCat('')}>Ver todos</button>}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>✅ Sem alertas{cat ? ' nesta categoria' : ''}.</p>
      ) : (
        <div style={c.lista}>
          {filtrados.map((a) => {
            const s = SEV[a.severidade]
            return (
              <Link key={a.id} href={`/financeiro/contas-correntes/${a.entidade_tipo}/${a.entidade_id}`} style={{ ...c.alerta, borderLeft: `4px solid ${s.cor}` }}>
                <div style={c.alertaEsq}>
                  <span style={{ ...c.sevBadge, color: s.cor, background: s.bg }}>{s.label}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={c.alertaEnt}>{a.entidade_nome} <span style={c.entTipo}>· {a.entidade_tipo}</span></div>
                    <div style={c.alertaMsg}>{a.documento ? `${a.documento} — ` : ''}{a.mensagem}</div>
                  </div>
                </div>
                <div style={{ ...c.alertaValor, color: s.cor }}>{formatarEuro(a.valor)}</div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

function Cartao({ titulo, n, total, cor, bg, ativo, onClick }: {
  titulo: string; n: number; total: number; cor: string; bg: string; ativo: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{ ...c.cartao, background: bg, outline: ativo ? `2px solid ${cor}` : 'none' }}>
      <span style={c.cartaoTitulo}>{titulo}</span>
      <span style={{ ...c.cartaoValor, color: cor }}>{formatarEuro(total)}</span>
      <span style={c.cartaoN}>{n} alerta(s)</span>
    </button>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  diasBox: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  diasInput: { width: 60, padding: 8, border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 },
  cartoes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 },
  cartao: { border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', textAlign: 'left' },
  cartaoTitulo: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  cartaoValor: { fontSize: 20, fontWeight: 800 },
  cartaoN: { fontSize: 12, color: 'var(--muted)' },
  barraFiltro: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 14, flexWrap: 'wrap' },
  criticosPill: { fontSize: 12, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', borderRadius: 999, padding: '2px 10px' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  alerta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', textDecoration: 'none', color: 'var(--foreground)' },
  alertaEsq: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  sevBadge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  alertaEnt: { fontWeight: 700, fontSize: 14 },
  entTipo: { color: 'var(--muted)', fontSize: 12, fontWeight: 400 },
  alertaMsg: { color: 'var(--muted)', fontSize: 13 },
  alertaValor: { fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' },
}
