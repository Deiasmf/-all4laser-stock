'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  listarContas, tipoContaLabel, formatarMoeda, formatarData,
  type ContaComSaldo,
} from '@/lib/cc'

export default function ContasCorrentesPage() {
  const router = useRouter()
  const [contas, setContas] = useState<ContaComSaldo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')

  useEffect(() => {
    listarContas().then((cs) => { setContas(cs); setCarregando(false) })
  }, [])

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return q ? contas.filter((c) => c.nome.toLowerCase().includes(q)) : contas
  }, [contas, pesquisa])

  // Total a receber em EUR (soma dos saldos positivos de todas as contas).
  const totalEur = useMemo(
    () => contas.reduce((s, c) => s + (c.saldo?.saldo_eur ?? 0), 0),
    [contas],
  )

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>📒 Contas Correntes</h1>
          <p style={c.sub}>Consignação e planos de pagamento por parceiro/cliente.</p>
        </div>
        <Link href="/contas-correntes/nova" style={c.btnPrimario}>+ Nova conta</Link>
      </div>

      <div style={c.indicadores}>
        <div style={{ ...c.indicador, background: '#ECFDF5' }}>
          <span style={c.indicadorTitulo}>Saldo total em aberto (EUR)</span>
          <span style={{ ...c.indicadorValor, color: '#065F46' }}>{formatarMoeda(totalEur, 'EUR')}</span>
        </div>
        <div style={{ ...c.indicador, background: '#EEF2FF' }}>
          <span style={c.indicadorTitulo}>Contas ativas</span>
          <span style={{ ...c.indicadorValor, color: '#3730A3' }}>{contas.filter((x) => x.ativa).length}</span>
        </div>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar conta..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <span style={c.contagem}>{filtradas.length} conta(s)</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>Ainda não há contas. Cria a primeira em “+ Nova conta”.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Conta</span>
            <span>Tipo</span>
            <span style={{ textAlign: 'right' }}>Saldo</span>
            <span style={{ textAlign: 'right' }}>Saldo (EUR)</span>
            <span style={{ textAlign: 'center' }}>Stock</span>
            <span>Próx. venc.</span>
          </div>
          {filtradas.map((conta) => (
            <LinhaConta
              key={conta.id}
              conta={conta}
              onClick={() => router.push(`/contas-correntes/${conta.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function LinhaConta({ conta, onClick }: { conta: ContaComSaldo; onClick: () => void }) {
  const s = conta.saldo
  const saldoMoeda = s?.saldo_moeda ?? 0
  return (
    <div style={{ ...c.linha, ...c.clicavel }} onClick={onClick}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{conta.nome}</span>
        {!conta.ativa && <span style={c.inativa}>inativa</span>}
      </span>
      <span><span style={c.tipoPill}>{tipoContaLabel(conta.tipo)}</span></span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: saldoMoeda < 0 ? '#B45309' : 'var(--foreground)' }}>
        {formatarMoeda(saldoMoeda, conta.moeda)}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatarMoeda(s?.saldo_eur ?? 0, 'EUR')}</span>
      <span style={{ textAlign: 'center' }}>
        {s && s.maquinas_em_stock > 0 ? <span style={c.stockPill}>{s.maquinas_em_stock}</span> : <span style={c.muted}>—</span>}
      </span>
      <span style={{ color: s?.proximo_vencimento ? 'var(--foreground)' : 'var(--muted)' }}>
        {formatarData(s?.proximo_vencimento)}
      </span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  indicadores: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 },
  indicador: { borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--border)' },
  indicadorTitulo: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  indicadorValor: { fontSize: 20, fontWeight: 800 },
  filtros: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, flex: 1, minWidth: 200 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.1fr 1.1fr 0.6fr 1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 720 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  inativa: { fontSize: 11, color: '#B91C1C', fontWeight: 600 },
  tipoPill: { display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#3730A3', background: '#E0E7FF', borderRadius: 999, padding: '2px 10px' },
  stockPill: { display: 'inline-block', minWidth: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '2px 8px' },
}
