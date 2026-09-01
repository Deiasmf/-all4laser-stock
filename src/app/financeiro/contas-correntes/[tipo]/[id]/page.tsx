'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  movimentosDaEntidade, extrato, aging, hojeISO, formatarEuro, formatarData,
  tipoDocInfo, estadoMovInfo, ESTADOS_MOV, contaParaSaldo, marcarPago, marcarPorPagar,
  type MovimentoCC, type EntidadeTipo, type LinhaExtrato,
} from '@/lib/contasCorrentes'
import { categoriaInfo } from '@/lib/categorizacaoFinanceira'

export default function ExtratoEntidadePage() {
  const params = useParams<{ tipo: string; id: string }>()
  const tipo = (params.tipo === 'fornecedor' ? 'fornecedor' : 'cliente') as EntidadeTipo
  const id = params.id

  const [movs, setMovs] = useState<MovimentoCC[]>([])
  const [carregando, setCarregando] = useState(true)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [estado, setEstado] = useState('')

  const recarregar = useCallback(async () => {
    setMovs(await movimentosDaEntidade(tipo, id))
    setCarregando(false)
  }, [tipo, id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  const nome = movs.find((m) => m.entidade_nome)?.entidade_nome ?? '—'
  const hoje = hojeISO()

  // Filtros aplicam-se à visualização; o saldo acumulado é sempre cronológico total.
  const linhas = useMemo(() => {
    const todas = extrato(movs)
    return todas.filter((l) => {
      if (de && l.data_documento < de) return false
      if (ate && l.data_documento > ate) return false
      // Filtro por estado aplica-se às faturas (estado calculado por alocação).
      if (estado && l.estadoCalc !== estado) return false
      return true
    })
  }, [movs, de, ate, estado])

  const saldoFinal = movs.filter(contaParaSaldo).reduce((s, m) => s + m.valor_debito - m.valor_credito, 0)
  const ag = useMemo(() => aging(movs, hoje), [movs, hoje])
  const receber = tipo === 'cliente'
  const temFiltros = !!de || !!ate || !!estado

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
          <h1 style={c.titulo}>{nome}</h1>
          <span style={c.tag}>{receber ? 'Cliente' : 'Fornecedor'}</span>
        </div>
        <Link
          href={`/financeiro/contas-correntes/novo?tipo=${tipo}&id=${id}&nome=${encodeURIComponent(nome)}`}
          style={c.btnPrimario}
        >
          + Novo movimento
        </Link>
      </div>

      {/* Resumo */}
      <div style={c.resumoCards}>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Saldo atual</span>
          <span style={{ ...c.rValor, color: saldoFinal < 0 ? '#B45309' : 'var(--foreground)' }}>{formatarEuro(saldoFinal)}</span>
          <span style={c.rNota}>{receber ? 'a receber' : 'a pagar'}</span>
        </div>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Vencido</span>
          <span style={{ ...c.rValor, color: (ag.d0_30 + ag.d31_60 + ag.d61_90 + ag.d90p) > 0 ? '#B91C1C' : 'var(--foreground)' }}>
            {formatarEuro(ag.d0_30 + ag.d31_60 + ag.d61_90 + ag.d90p)}
          </span>
          <span style={c.rNota}>por vencer: {formatarEuro(ag.porVencer)}</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={c.filtros}>
        <label style={c.filtroLabel}>De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={c.input} /></label>
        <label style={c.filtroLabel}>Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={c.input} /></label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_MOV.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        {temFiltros && <button style={c.btnGhost} onClick={() => { setDe(''); setAte(''); setEstado('') }}>Limpar</button>}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : linhas.length === 0 ? (
        <p style={c.estado}>Sem movimentos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Data</span>
            <span>Documento</span>
            <span>Venc.</span>
            <span style={{ textAlign: 'right' }}>Débito</span>
            <span style={{ textAlign: 'right' }}>Crédito</span>
            <span style={{ textAlign: 'right' }}>Saldo</span>
            <span style={{ textAlign: 'center' }}>Estado</span>
            <span style={{ textAlign: 'center' }}>Pagamento</span>
          </div>
          {linhas.map((l) => <LinhaMov key={l.id} l={l} aoMudar={recarregar} />)}
        </div>
      )}
    </main>
  )
}

function LinhaMov({ l, aoMudar }: { l: LinhaExtrato; aoMudar: () => Promise<void> }) {
  const td = tipoDocInfo(l.tipo_documento)
  const cat = categoriaInfo(l.categoria)
  const proForma = l.tipo_documento === 'pro_forma'
  const cobravel = l.tipo_documento === 'fatura' || proForma
  const est = cobravel && l.estadoCalc ? estadoMovInfo(l.estadoCalc) : null
  const pago = l.estado === 'liquidado'
  const [ocupado, setOcupado] = useState(false)

  async function alternar() {
    setOcupado(true)
    if (pago) await marcarPorPagar(l.id)
    else await marcarPago(l)
    await aoMudar()
    setOcupado(false)
  }

  return (
    <div style={{ ...c.linha, ...(proForma ? c.proForma : {}) }}>
      <span style={c.muted}>{formatarData(l.data_documento)}</span>
      <span>
        {td.label}{l.documento_ref ? ` ${l.documento_ref}` : ''}
        {cat && <span style={{ ...c.badge, color: cat.cor, background: cat.bg, marginLeft: 6 }}>{cat.icon} {cat.label}</span>}
        {proForma && <span style={c.notas} title="A pró-forma não entra no saldo da conta corrente"> · fora do saldo</span>}
        {l.notas && <span style={c.notas} title={l.notas}> · {l.notas}</span>}
      </span>
      <span style={c.muted}>{formatarData(l.data_vencimento)}</span>
      <span style={{ textAlign: 'right' }}>{l.valor_debito ? formatarEuro(l.valor_debito) : '—'}</span>
      <span style={{ textAlign: 'right' }}>{l.valor_credito ? formatarEuro(l.valor_credito) : '—'}</span>
      <span style={{ textAlign: 'right', fontWeight: 700 }}>{proForma ? '—' : formatarEuro(l.saldoAcumulado)}</span>
      <span style={{ textAlign: 'center' }}>
        {est
          ? <span style={{ ...c.badge, color: est.cor, background: est.bg }} title={l.porLiquidarCalc > 0 ? `Por liquidar: ${formatarEuro(l.porLiquidarCalc)}` : undefined}>{est.label}</span>
          : <span style={c.muted}>—</span>}
      </span>
      <span style={{ textAlign: 'center' }}>
        {cobravel ? (
          <button style={{ ...c.pagoBtn, ...(pago ? c.pagoOn : {}) }} disabled={ocupado} onClick={alternar}
            title={pago ? 'Pagamento confirmado — clicar para reverter' : 'Confirmar o pagamento total deste documento'}>
            {pago ? `✓ ${formatarData(l.data_pagamento)}` : 'Marcar pago'}
          </button>
        ) : (
          <span style={c.muted}>—</span>
        )}
      </span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  tag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: '#374151', background: '#E5E7EB' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  resumoCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  rCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 2 },
  rTitulo: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  rValor: { fontSize: 22, fontWeight: 800 },
  rNota: { fontSize: 12, color: 'var(--muted)' },
  filtros: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  filtroLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  input: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.9fr 2.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 1.1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 980 },
  proForma: { background: '#FAFAFA' },
  pagoBtn: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  pagoOn: { background: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  notas: { color: 'var(--muted)', fontSize: 12.5 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
}
