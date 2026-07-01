'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarEnvios } from '@/lib/enviosPecas'
import { ESTADOS_ENVIO, estadoInfo, transportadoraLabel, formatarEuro, type EnvioPeca } from '@/types/envioPecas'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

// Colunas para exportação (espelham a tabela de envios)
const colunasExport: ColunaExport<EnvioPeca>[] = [
  { cabecalho: 'Número', valor: (e) => e.numero },
  { cabecalho: 'Data', valor: (e) => (e.created_at ?? '').slice(0, 10) },
  { cabecalho: 'Cliente', valor: (e) => e.cliente_nome },
  { cabecalho: 'Responsável', valor: (e) => e.responsavel_nome },
  { cabecalho: 'Transportadora', valor: (e) => transportadoraLabel(e) },
  { cabecalho: 'Estado', valor: (e) => estadoInfo(e.estado).label },
  { cabecalho: 'Pago', valor: (e) => (e.pago ? 'Sim' : 'Não') },
  { cabecalho: 'Valor', valor: (e) => formatarEuro(e.valor_a_faturar) },
]

const CHAVE_FILTROS = 'envios-pecas:filtros'

type Filtros = { pesquisa: string; estado: string; pago: string; mes: string }

function lerFiltros(): Filtros {
  if (typeof window === 'undefined') return { pesquisa: '', estado: '', pago: '', mes: '' }
  try {
    const raw = sessionStorage.getItem(CHAVE_FILTROS)
    return raw ? { pesquisa: '', estado: '', pago: '', mes: '', ...JSON.parse(raw) } : { pesquisa: '', estado: '', pago: '', mes: '' }
  } catch {
    return { pesquisa: '', estado: '', pago: '', mes: '' }
  }
}

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function EnviosPecasPage() {
  const router = useRouter()
  const [envios, setEnvios] = useState<EnvioPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [g] = useState(lerFiltros)
  const [pesquisa, setPesquisa] = useState(g.pesquisa)
  const [estado, setEstado] = useState(g.estado)
  const [pago, setPago] = useState(g.pago)
  const [mes, setMes] = useState(g.mes)

  useEffect(() => {
    listarEnvios().then((e) => { setEnvios(e); setCarregando(false) })
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify({ pesquisa, estado, pago, mes })) } catch {}
  }, [pesquisa, estado, pago, mes])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return envios.filter((e) => {
      if (estado && e.estado !== estado) return false
      if (pago === 'sim' && !e.pago) return false
      if (pago === 'nao' && e.pago) return false
      if (mes && !(e.created_at ?? '').startsWith(mes)) return false
      if (q) {
        const alvo = `${e.numero ?? ''} ${e.cliente_nome ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [envios, pesquisa, estado, pago, mes])

  const temFiltros = !!pesquisa || !!estado || !!pago || !!mes

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Envios de Encomendas</h1>
        <Link href="/logistico/envios-pecas/novo" style={c.btnPrimario}>+ Novo Envio de Encomenda</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por número ou cliente..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={{ ...c.input, flex: 1, minWidth: 180 }}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {ESTADOS_ENVIO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <select value={pago} onChange={(e) => setPago(e.target.value)} style={c.select}>
          <option value="">Pago e não pago</option>
          <option value="sim">Pago</option>
          <option value="nao">Não pago</option>
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.select} />
        {temFiltros && (
          <button style={c.btnGhost} onClick={() => { setPesquisa(''); setEstado(''); setPago(''); setMes('') }}>
            Limpar
          </button>
        )}
        <BotaoExportar nome="encomendas-envios" colunas={colunasExport} linhas={filtrados} />
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} envio(s)</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem envios.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Número</span>
            <span>Data</span>
            <span>Cliente</span>
            <span>Responsável</span>
            <span>Transportadora</span>
            <span>Estado</span>
            <span style={{ textAlign: 'center' }}>Pago</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
          </div>
          {filtrados.map((e) => (
            <div key={e.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => router.push(`/logistico/envios-pecas/${e.id}`)}>
              <span style={{ fontWeight: 700 }}>{e.numero ?? '—'}</span>
              <span style={c.muted}>{(e.created_at ?? '').slice(0, 10)}</span>
              <span>{e.cliente_nome ?? '—'}</span>
              <span style={c.muted}>{e.responsavel_nome ?? '—'}</span>
              <span style={c.muted}>{transportadoraLabel(e)}</span>
              <span><EstadoBadge estado={e.estado} /></span>
              <span style={{ textAlign: 'center' }} title={e.pago ? 'Pago' : 'Não pago'}>{e.pago ? '🟢' : '🔴'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(e.valor_a_faturar)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1.5fr 1.1fr 1.1fr 1.1fr 0.6fr 1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 900 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
