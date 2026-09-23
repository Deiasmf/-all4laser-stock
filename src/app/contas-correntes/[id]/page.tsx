'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterConta, movimentosDaConta, criarMovimentoManual,
  tipoContaLabel, tipoMovInfo, formatarMoeda, formatarData, hojeISO,
  TIPOS_MOVIMENTO, MOEDAS,
  type ContaComSaldo, type MovimentoLedger, type TipoMovimento,
} from '@/lib/cc'
import TabConsignacao from './TabConsignacao'
import TabPlanos from './TabPlanos'
import TabReconciliacao from './TabReconciliacao'

type Tab = 'extrato' | 'consignacao' | 'planos' | 'reconciliacao' | 'acessos'

const TABS: { id: Tab; label: string; pronto: boolean }[] = [
  { id: 'consignacao', label: 'Consignação', pronto: true },
  { id: 'planos', label: 'Planos', pronto: true },
  { id: 'extrato', label: 'Extrato', pronto: true },
  { id: 'reconciliacao', label: 'Reconciliação', pronto: true },
  { id: 'acessos', label: 'Acessos', pronto: false },
]

export default function DetalheContaPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [conta, setConta] = useState<ContaComSaldo | null>(null)
  const [movs, setMovs] = useState<MovimentoLedger[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState<Tab>('extrato')

  const recarregar = useCallback(async () => {
    const [ct, ms] = await Promise.all([obterConta(id), movimentosDaConta(id)])
    setConta(ct)
    setMovs(ms)
    setCarregando(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  if (carregando) return <p style={c.estado}>A carregar...</p>
  if (!conta) return (
    <main style={c.page}>
      <Link href="/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
      <p style={c.estado}>Conta não encontrada.</p>
    </main>
  )

  const s = conta.saldo
  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
          <h1 style={c.titulo}>{conta.nome}</h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={c.tipoPill}>{tipoContaLabel(conta.tipo)}</span>
            <span style={c.moedaPill}>{conta.moeda}</span>
            {!conta.ativa && <span style={c.inativaPill}>inativa</span>}
          </div>
        </div>
      </div>

      {/* Cartões de saldo */}
      <div style={c.resumoCards}>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Saldo ({conta.moeda})</span>
          <span style={{ ...c.rValor, color: (s?.saldo_moeda ?? 0) < 0 ? '#B45309' : 'var(--foreground)' }}>
            {formatarMoeda(s?.saldo_moeda ?? 0, conta.moeda)}
          </span>
          <span style={c.rNota}>em aberto</span>
        </div>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Saldo (EUR)</span>
          <span style={c.rValor}>{formatarMoeda(s?.saldo_eur ?? 0, 'EUR')}</span>
          <span style={c.rNota}>contravalor</span>
        </div>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Esperado / Recebido (EUR)</span>
          <span style={{ ...c.rValor, fontSize: 17 }}>
            {formatarMoeda(s?.total_esperado_eur ?? 0, 'EUR')}
          </span>
          <span style={c.rNota}>recebido: {formatarMoeda(s?.total_recebido_eur ?? 0, 'EUR')}</span>
        </div>
        <div style={c.rCard}>
          <span style={c.rTitulo}>Máquinas em stock</span>
          <span style={c.rValor}>{s?.maquinas_em_stock ?? 0}</span>
          <span style={c.rNota}>próx. venc.: {formatarData(s?.proximo_vencimento)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={c.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            style={{ ...c.tab, ...(tab === t.id ? c.tabAtiva : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.label}{!t.pronto && <span style={c.emBreveDot} title="Em breve"> •</span>}
          </button>
        ))}
      </div>

      {tab === 'extrato'
        ? <TabExtrato conta={conta} movs={movs} onMudou={recarregar} />
        : tab === 'consignacao'
        ? <TabConsignacao conta={conta} onMudou={recarregar} />
        : tab === 'planos'
        ? <TabPlanos conta={conta} onMudou={recarregar} />
        : tab === 'reconciliacao'
        ? <TabReconciliacao conta={conta} onMudou={recarregar} />
        : <PlaceholderTab tab={tab} />}
    </main>
  )
}

// ─── Tab Extrato ─────────────────────────────────────────────────────────────

function TabExtrato({ conta, movs, onMudou }: {
  conta: ContaComSaldo; movs: MovimentoLedger[]; onMudou: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  // O saldo acumulado vem da view (cronológico total); aqui só se mostra do mais
  // recente para o mais antigo e se aplicam filtros de visualização.
  const linhas = useMemo(() => {
    const filtradas = movs.filter((m) => {
      if (filtroTipo && m.tipo !== filtroTipo) return false
      if (de && m.data < de) return false
      if (ate && m.data > ate) return false
      return true
    })
    return [...filtradas].reverse()
  }, [movs, filtroTipo, de, ate])

  const temFiltros = !!filtroTipo || !!de || !!ate

  return (
    <div>
      <div style={c.barraExtrato}>
        <div style={c.filtros}>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={c.inputSm}>
            <option value="">Todos os tipos</option>
            {TIPOS_MOVIMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={c.inputSm} title="De" />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={c.inputSm} title="Até" />
          {temFiltros && <button style={c.btnLimpar} onClick={() => { setFiltroTipo(''); setDe(''); setAte('') }}>Limpar</button>}
        </div>
        <button style={c.btnPrimarioSm} onClick={() => setAberto((v) => !v)}>
          {aberto ? '× Fechar' : '+ Registar movimento'}
        </button>
      </div>

      {aberto && (
        <FormMovimento
          conta={conta}
          onCancelar={() => setAberto(false)}
          onGuardado={() => { setAberto(false); onMudou() }}
        />
      )}

      {linhas.length === 0 ? (
        <p style={c.estado}>{temFiltros ? 'Sem movimentos para os filtros escolhidos.' : 'Ainda não há movimentos nesta conta.'}</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Data</span>
            <span>Tipo</span>
            <span>Descrição</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span style={{ textAlign: 'right' }}>EUR</span>
            <span style={{ textAlign: 'right' }}>Saldo</span>
          </div>
          {linhas.map((m) => <LinhaMov key={m.id} m={m} moeda={conta.moeda} />)}
        </div>
      )}
    </div>
  )
}

function LinhaMov({ m, moeda }: { m: MovimentoLedger; moeda: string }) {
  const info = tipoMovInfo(m.tipo)
  const origem = m.origem_tipo === 'venda' ? 'Venda'
    : m.origem_tipo === 'prestacao' ? 'Prestação'
    : m.origem_tipo === 'reconciliacao' ? 'Reconciliação'
    : 'Manual'
  const desc = m.notas || m.referencia_bancaria || origem
  return (
    <div style={c.linha}>
      <span>{formatarData(m.data)}</span>
      <span><span style={{ ...c.movPill, color: info.cor, background: info.bg }}>{info.label}</span></span>
      <span style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={desc}>
        {desc}
      </span>
      <span style={{ textAlign: 'right', fontWeight: 600, color: info.sinal < 0 ? '#065F46' : 'var(--foreground)' }}>
        {info.sinal < 0 ? '−' : '+'}{formatarMoeda(m.valor, m.moeda)}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatarMoeda(m.valor_eur, 'EUR')}</span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: m.saldo_acumulado < 0 ? '#B45309' : 'var(--foreground)' }}>
        {formatarMoeda(m.saldo_acumulado, moeda)}
      </span>
    </div>
  )
}

// ─── Formulário de movimento manual ──────────────────────────────────────────

function parseNum(v: string): number {
  const n = Number(v.replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

function FormMovimento({ conta, onCancelar, onGuardado }: {
  conta: ContaComSaldo; onCancelar: () => void; onGuardado: () => void
}) {
  const { perfil } = useAuth()
  const [tipo, setTipo] = useState<TipoMovimento>('recebido')
  const [data, setData] = useState(hojeISO())
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState(conta.moeda)
  const [taxa, setTaxa] = useState(conta.moeda === 'EUR' ? '1' : (conta.taxa_contratual ? String(conta.taxa_contratual) : ''))
  const [ref, setRef] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Ao mudar a moeda, ajusta a taxa por defeito (EUR → 1).
  function mudarMoeda(nova: string) {
    setMoeda(nova)
    if (nova === 'EUR') setTaxa('1')
    else if (nova === conta.moeda && conta.taxa_contratual) setTaxa(String(conta.taxa_contratual))
  }

  const valorNum = parseNum(valor)
  const taxaNum = parseNum(taxa)
  const contravalor = taxaNum > 0 ? valorNum / taxaNum : null
  const podeGuardar = valorNum > 0 && !!data && taxaNum > 0

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica um valor, uma data e uma taxa (unidades por 1 EUR) maiores que zero.'); return }
    setAGuardar(true)
    const { error } = await criarMovimentoManual(
      {
        conta_id: conta.id,
        tipo,
        data,
        valor: valorNum,
        moeda: moeda.trim().toUpperCase(),
        taxa_cambio_eur: taxaNum,
        referencia_bancaria: ref.trim() || null,
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    if (error) { setErro('Não foi possível guardar: ' + error.message); setAGuardar(false); return }
    onGuardado()
  }

  return (
    <div style={c.formCard}>
      {erro && <div style={c.erro}>{erro}</div>}
      <div style={c.grelha2}>
        <label style={c.campo}>
          <span style={c.rotulo}>Tipo de movimento</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimento)} style={c.input}>
            {TIPOS_MOVIMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={c.input} />
        </label>
      </div>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Valor</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Moeda</span>
          <select value={moeda} onChange={(e) => mudarMoeda(e.target.value)} style={c.input}>
            {Array.from(new Set([conta.moeda, ...MOEDAS])).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Taxa ({moeda}/EUR)</span>
          <input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} disabled={moeda === 'EUR'} placeholder="4,40" style={c.input} />
        </label>
      </div>

      <label style={c.campo}>
        <span style={c.rotulo}>Referência bancária <span style={c.opc}>(opcional)</span></span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex.: transferência, nº de recibo" style={c.input} />
      </label>

      <label style={c.campo}>
        <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 54, resize: 'vertical' }} />
      </label>

      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
          {aGuardar ? 'A guardar...' : 'Guardar movimento'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
        {valorNum > 0 && contravalor != null && (
          <span style={c.previa}>Contravalor: <strong>{formatarMoeda(contravalor, 'EUR')}</strong></span>
        )}
      </div>
    </div>
  )
}

// ─── Placeholder das tabs por construir ──────────────────────────────────────

function PlaceholderTab({ tab }: { tab: Tab }) {
  const texto: Record<string, string> = {
    consignacao: 'Máquinas enviadas, registo de venda (margem e valor devido) e devoluções.',
    planos: 'Planos de pagamento, prestações geradas e registo de recebimentos.',
    reconciliacao: 'Importação do Excel da Laserix e revisão de divergências.',
    acessos: 'Utilizadores do portal ligados a esta conta.',
  }
  return (
    <div style={c.placeholder}>
      <p style={{ fontSize: 32, marginBottom: 8 }}>🚧</p>
      <p style={{ fontWeight: 600 }}>Disponível num próximo passo.</p>
      <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 420, margin: '4px auto 0' }}>{texto[tab]}</p>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 8px' },
  tipoPill: { display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#3730A3', background: '#E0E7FF', borderRadius: 999, padding: '2px 10px' },
  moedaPill: { display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 999, padding: '2px 10px' },
  inativaPill: { display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#B91C1C', background: '#FEF2F2', borderRadius: 999, padding: '2px 10px' },
  resumoCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  rCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 3 },
  rTitulo: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  rValor: { fontSize: 20, fontWeight: 800, color: 'var(--foreground)' },
  rNota: { fontSize: 12, color: 'var(--muted)' },
  tabs: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid var(--border)', background: '#fff', borderRadius: 999, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  emBreveDot: { color: '#F59E0B', fontWeight: 800 },
  barraExtrato: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  filtros: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  inputSm: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  btnLimpar: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' },
  btnPrimarioSm: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  formCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  grelha3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSecundario: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 18px', fontWeight: 600, cursor: 'pointer' },
  previa: { fontSize: 14, color: 'var(--muted)' },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.9fr 1fr 1.6fr 1.1fr 1fr 1.1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 760 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  movPill: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  placeholder: { background: '#fff', border: '1px dashed var(--border)', borderRadius: 12, padding: '36px 20px', textAlign: 'center' },
  estado: { color: 'var(--muted)', padding: 12 },
}
