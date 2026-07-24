'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  listarMovimentos, resumoEntidades, aging, indicadores, hojeISO, formatarEuro,
  type MovimentoCC, type EntidadeTipo, type ResumoEntidade,
} from '@/lib/contasCorrentes'

export default function ContasCorrentesPage() {
  const router = useRouter()
  const [movs, setMovs] = useState<MovimentoCC[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<EntidadeTipo>('cliente')
  const [pesquisa, setPesquisa] = useState('')

  useEffect(() => {
    listarMovimentos().then((m) => { setMovs(m); setCarregando(false) })
  }, [])

  const hoje = hojeISO()
  const ind = useMemo(() => indicadores(movs, hoje), [movs, hoje])
  const movsTab = useMemo(() => movs.filter((m) => m.entidade_tipo === tab), [movs, tab])
  const resumos = useMemo(() => resumoEntidades(movsTab, hoje), [movsTab, hoje])
  const ag = useMemo(() => aging(movsTab, hoje), [movsTab, hoje])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return q ? resumos.filter((r) => r.nome.toLowerCase().includes(q)) : resumos
  }, [resumos, pesquisa])

  const receber = tab === 'cliente'

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>📊 Contas Correntes</h1>
          <p style={c.sub}>Saldos e movimentos de clientes e fornecedores.</p>
        </div>
        <Link href="/financeiro/contas-correntes/novo" style={c.btnPrimario}>+ Novo movimento</Link>
      </div>

      {/* Indicadores */}
      <div style={c.indicadores}>
        <Indicador titulo="Total a receber" valor={ind.aReceber} cor="#065F46" bg="#ECFDF5" />
        <Indicador titulo="Total a pagar" valor={ind.aPagar} cor="#9A3412" bg="#FFF7ED" />
        <Indicador titulo="Vencido a receber" valor={ind.vencidoReceber} cor="#B91C1C" bg="#FEF2F2" />
        <Indicador titulo="Vencido a pagar" valor={ind.vencidoPagar} cor="#B91C1C" bg="#FEF2F2" />
      </div>

      {/* Tabs */}
      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'cliente' ? c.tabAtiva : {}) }} onClick={() => setTab('cliente')}>Clientes</button>
        <button style={{ ...c.tab, ...(tab === 'fornecedor' ? c.tabAtiva : {}) }} onClick={() => setTab('fornecedor')}>Fornecedores</button>
      </div>

      {/* Aging */}
      <div style={c.aging}>
        <div style={c.agingTitulo}>Aging ({receber ? 'a receber' : 'a pagar'})</div>
        <div style={c.agingLinha}>
          <AgingCel rotulo="Por vencer" valor={ag.porVencer} />
          <AgingCel rotulo="0–30 dias" valor={ag.d0_30} alerta />
          <AgingCel rotulo="31–60 dias" valor={ag.d31_60} alerta />
          <AgingCel rotulo="61–90 dias" valor={ag.d61_90} alerta />
          <AgingCel rotulo="+90 dias" valor={ag.d90p} alerta />
        </div>
      </div>

      {/* Lista de entidades */}
      <div style={c.filtros}>
        <input
          placeholder={`Procurar ${receber ? 'cliente' : 'fornecedor'}...`}
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <span style={c.contagem}>{filtrados.length} {receber ? 'cliente(s)' : 'fornecedor(es)'}</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem movimentos {receber ? 'de clientes' : 'de fornecedores'}.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>{receber ? 'Cliente' : 'Fornecedor'}</span>
            <span style={{ textAlign: 'right' }}>Saldo</span>
            <span style={{ textAlign: 'right' }}>Vencido</span>
            <span style={{ textAlign: 'center' }}>Pendentes</span>
          </div>
          {filtrados.map((r) => (
            <LinhaEntidade key={`${r.tipo}:${r.id}`} r={r} onClick={() => router.push(`/financeiro/contas-correntes/${r.tipo}/${r.id}`)} />
          ))}
        </div>
      )}
    </main>
  )
}

function Indicador({ titulo, valor, cor, bg }: { titulo: string; valor: number; cor: string; bg: string }) {
  return (
    <div style={{ ...c.indicador, background: bg }}>
      <span style={c.indicadorTitulo}>{titulo}</span>
      <span style={{ ...c.indicadorValor, color: cor }}>{formatarEuro(valor)}</span>
    </div>
  )
}

function AgingCel({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div style={c.agingCel}>
      <span style={c.agingRotulo}>{rotulo}</span>
      <span style={{ ...c.agingValor, color: alerta && valor > 0 ? '#B91C1C' : 'var(--foreground)' }}>{formatarEuro(valor)}</span>
    </div>
  )
}

function LinhaEntidade({ r, onClick }: { r: ResumoEntidade; onClick: () => void }) {
  return (
    <div style={{ ...c.linha, ...c.clicavel }} onClick={onClick}>
      <span style={{ fontWeight: 600 }}>{r.nome}</span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: r.saldo < 0 ? '#B45309' : 'var(--foreground)' }}>{formatarEuro(r.saldo)}</span>
      <span style={{ textAlign: 'right', color: r.vencido > 0 ? '#B91C1C' : 'var(--muted)' }}>{formatarEuro(r.vencido)}</span>
      <span style={{ textAlign: 'center' }}>{r.pendentes > 0 ? <span style={c.pendPill}>{r.pendentes}</span> : <span style={c.muted}>—</span>}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  indicadores: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  indicador: { borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--border)' },
  indicadorTitulo: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  indicadorValor: { fontSize: 20, fontWeight: 800 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { padding: '8px 18px', border: '1px solid var(--border)', background: '#fff', borderRadius: 999, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  aging: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 },
  agingTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 },
  agingLinha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
  agingCel: { display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '3px solid var(--border)', paddingLeft: 10 },
  agingRotulo: { fontSize: 12, color: 'var(--muted)' },
  agingValor: { fontSize: 16, fontWeight: 700 },
  filtros: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, flex: 1, minWidth: 200 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 560 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  pendPill: { display: 'inline-block', minWidth: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' },
}
