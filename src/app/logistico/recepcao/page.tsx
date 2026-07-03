'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarProcessos, listarTodosMovimentos, calcularSaldos, type SaldoCliente } from '@/lib/processosPecas'
import {
  ESTADOS, FLUXOS, estadoInfo, fluxoInfo, type ProcessoPeca, type ProcessoMovimento,
} from '@/types/processoPeca'

const CHAVE_FILTROS = 'processos_pecas_filtros'

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return <span style={{ ...c.badge, color: i.cor, background: i.bg }}>{i.label}</span>
}

export default function ProcessosPecasPage() {
  const router = useRouter()
  const [processos, setProcessos] = useState<ProcessoPeca[]>([])
  const [movimentos, setMovimentos] = useState<ProcessoMovimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<'processos' | 'saldo'>('processos')

  // filtros
  const [pesquisa, setPesquisa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fFluxo, setFFluxo] = useState('')
  const [fGarantia, setFGarantia] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fMes, setFMes] = useState('')
  const [filtrosCarregados, setFiltrosCarregados] = useState(false)

  useEffect(() => {
    Promise.all([listarProcessos(), listarTodosMovimentos()]).then(([p, m]) => {
      setProcessos(p); setMovimentos(m); setCarregando(false)
    })
    try {
      const raw = sessionStorage.getItem(CHAVE_FILTROS)
      if (raw) {
        const f = JSON.parse(raw)
        setPesquisa(f.pesquisa ?? ''); setFEstado(f.fEstado ?? ''); setFFluxo(f.fFluxo ?? '')
        setFGarantia(f.fGarantia ?? ''); setFCliente(f.fCliente ?? ''); setFMes(f.fMes ?? '')
      }
    } catch { /* filtros inválidos */ }
    setFiltrosCarregados(true)
  }, [])

  useEffect(() => {
    if (!filtrosCarregados) return
    sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify({ pesquisa, fEstado, fFluxo, fGarantia, fCliente, fMes }))
  }, [filtrosCarregados, pesquisa, fEstado, fFluxo, fGarantia, fCliente, fMes])

  const resumo = useMemo(() => {
    let abertos = 0, aguardaCliente = 0, emReparacao = 0, aguardaPagamento = 0
    for (const p of processos) {
      if (p.estado === 'aberto') abertos++
      if (p.estado === 'aguarda_cliente') aguardaCliente++
      if (p.estado === 'aguarda_reparacao') emReparacao++
      if (p.estado === 'aguarda_pagamento') aguardaPagamento++
    }
    return { abertos, aguardaCliente, emReparacao, aguardaPagamento }
  }, [processos])

  const clientesOpc = useMemo(
    () => Array.from(new Set(processos.map((p) => p.cliente_nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt')),
    [processos]
  )

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return processos
      .filter((p) => !fEstado || p.estado === fEstado)
      .filter((p) => !fFluxo || p.tipo_fluxo === fFluxo)
      .filter((p) => !fGarantia || (fGarantia === 'sim' ? p.em_garantia : !p.em_garantia))
      .filter((p) => !fCliente || p.cliente_nome === fCliente)
      .filter((p) => !fMes || (p.created_at ?? '').startsWith(fMes))
      .filter((p) =>
        !q ||
        (p.numero ?? '').toLowerCase().includes(q) ||
        (p.cliente_nome ?? '').toLowerCase().includes(q) ||
        (p.peca_descricao ?? '').toLowerCase().includes(q) ||
        (p.sn_avariado ?? '').toLowerCase().includes(q) ||
        (p.sn_substituto ?? '').toLowerCase().includes(q)
      )
  }, [processos, pesquisa, fEstado, fFluxo, fGarantia, fCliente, fMes])

  const saldos = useMemo<SaldoCliente[]>(() => calcularSaldos(processos, movimentos), [processos, movimentos])
  const temFiltros = !!(pesquisa || fEstado || fFluxo || fGarantia || fCliente || fMes)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Processos de Peças</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/logistico/recepcao/scan" style={c.btnScan}>📷 Scan QR</Link>
          <Link href="/logistico/recepcao/novo" className="a4l-btn" style={c.btnPrimario}>+ Novo Processo</Link>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={c.cards}>
        <Card num={resumo.abertos} label="Processos abertos" cor="#374151" />
        <Card num={resumo.aguardaCliente} label="Aguarda resposta de cliente" cor="#92400E" />
        <Card num={resumo.emReparacao} label="Em reparação externa" cor="#9A3412" />
        <Card num={resumo.aguardaPagamento} label="Aguarda pagamento" cor="#991B1B" />
      </div>

      {/* Tabs */}
      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'processos' ? c.tabAtivo : {}) }} onClick={() => setTab('processos')}>Processos</button>
        <button style={{ ...c.tab, ...(tab === 'saldo' ? c.tabAtivo : {}) }} onClick={() => setTab('saldo')}>Saldo por cliente</button>
      </div>

      {tab === 'processos' ? (
        <>
          <div style={c.filtros}>
            <input className="a4l-input" placeholder="Procurar por nº, cliente, peça, SN..." value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} style={{ ...c.input, flex: 1, minWidth: 200 }} />
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.select}>
              <option value="">Todos os estados</option>
              {ESTADOS.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
            </select>
            <select value={fFluxo} onChange={(e) => setFFluxo(e.target.value)} style={c.select}>
              <option value="">Todos os tipos</option>
              {FLUXOS.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
            <select value={fGarantia} onChange={(e) => setFGarantia(e.target.value)} style={c.select}>
              <option value="">Garantia (todas)</option>
              <option value="sim">Em garantia</option>
              <option value="nao">Fora de garantia</option>
            </select>
            <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} style={c.select}>
              <option value="">Todos os clientes</option>
              {clientesOpc.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
            </select>
            <input type="month" value={fMes} onChange={(e) => setFMes(e.target.value)} style={c.select} />
            {temFiltros && <button className="a4l-btn-ghost" style={c.btnGhost} onClick={() => { setPesquisa(''); setFEstado(''); setFFluxo(''); setFGarantia(''); setFCliente(''); setFMes('') }}>Limpar</button>}
          </div>

          <div style={c.resumoLinha}><span>{filtrados.length} processo(s)</span></div>

          {carregando ? (
            <p style={c.estado}>A carregar...</p>
          ) : filtrados.length === 0 ? (
            <p style={c.estado}>Sem processos.</p>
          ) : (
            <div style={c.tabela}>
              <div style={{ ...c.linha, ...c.cab }}>
                <span>Número</span><span>Cliente</span><span>Peça</span><span>Tipo</span>
                <span>Estado</span><span>Garantia</span><span>Data</span>
              </div>
              {filtrados.map((p) => (
                <div key={p.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => router.push(`/logistico/recepcao/${p.id}`)}>
                  <span style={{ fontWeight: 700 }}>{p.numero ?? '—'}</span>
                  <span>{p.cliente_nome}</span>
                  <span style={c.muted}>{p.peca_descricao}{p.sn_avariado ? ` · SN ${p.sn_avariado}` : ''}</span>
                  <span title={fluxoInfo(p.tipo_fluxo).label}>{fluxoInfo(p.tipo_fluxo).icon} {fluxoInfo(p.tipo_fluxo).label}</span>
                  <span><EstadoBadge estado={p.estado} /></span>
                  <span style={c.muted}>{p.em_garantia ? '🛡️ Sim' : 'Não'}</span>
                  <span style={c.muted}>{(p.created_at ?? '').slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linhaSaldo, ...c.cab }}>
            <span>Cliente</span>
            <span style={{ textAlign: 'center' }}>Enviadas</span>
            <span style={{ textAlign: 'center' }}>Recebidas</span>
            <span style={{ textAlign: 'center' }}>Por devolver</span>
          </div>
          {saldos.length === 0 ? <p style={c.estado}>Sem dados.</p> : saldos.map((s) => (
            <div key={s.cliente_nome} style={c.linhaSaldo}>
              <span style={{ fontWeight: 600 }}>{s.cliente_nome}</span>
              <span style={{ textAlign: 'center' }}>{s.enviadas}</span>
              <span style={{ textAlign: 'center' }}>{s.recebidas}</span>
              <span style={{ textAlign: 'center' }}>
                {s.pendentes > 0
                  ? <span style={{ ...c.badge, color: '#991B1B', background: '#FEE2E2' }}>Deve {s.pendentes}</span>
                  : <span style={c.muted}>0</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function Card({ num, label, cor }: { num: number; label: string; cor: string }) {
  return (
    <div className="a4l-card" style={{ ...c.card, borderTop: `3px solid ${cor}` }}>
      <div style={c.cardNum}>{num}</div>
      <div style={c.cardLbl}>{label}</div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' },
  cardNum: { fontSize: 30, fontWeight: 800, color: 'var(--primary)' },
  cardLbl: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 14 },
  tab: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 999, background: '#fff', fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)' },
  tabAtivo: { background: 'var(--accent-bg, #ece8fb)', borderColor: 'var(--primary)', color: 'var(--primary-dark)' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumoLinha: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.6fr 1.4fr 1.2fr 0.8fr 0.9fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 900 },
  linhaSaldo: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 520 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnScan: { background: '#1b1b2e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
}
