'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarReparacoes } from '@/lib/reparacaoPecas'
import type { ReparacaoPeca } from '@/types/reparacaoPeca'
import { estadoInfo } from '@/types/reparacaoPeca'

const CHAVE_FILTROS = 'reparacao_pecas_filtros'

// Estado efetivo para o badge: "aguarda avariada" quando enviámos substituta
// e o cliente ainda não devolveu a peça avariada.
function estadoEfetivo(r: ReparacaoPeca): string | null {
  if (
    r.status === 'em_reparacao' &&
    r.tipo_dono === 'cliente' &&
    r.substituta_enviada &&
    !r.cliente_enviou_avariada
  ) {
    return 'aguarda_avariada'
  }
  return r.status
}

function EstadoBadge({ r }: { r: ReparacaoPeca }) {
  const est = estadoEfetivo(r)
  if (!est) return null
  const info = estadoInfo(est)
  const cor = info?.cor ?? '#6B7280'
  const texto = info?.label ?? est
  return (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: '#fff', background: cor, whiteSpace: 'nowrap' }}>
      {texto}
    </span>
  )
}

export default function ReparacaoPecasPage() {
  const { isAdmin } = useAuth()
  const [registos, setRegistos] = useState<ReparacaoPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fDono, setFDono] = useState('')
  const [fFornecedor, setFFornecedor] = useState('')
  const [fMes, setFMes] = useState('')
  const [filtrosCarregados, setFiltrosCarregados] = useState(false)
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({})

  async function carregar() {
    const lista = await listarReparacoes()
    setRegistos(lista)
    setCarregando(false)
  }

  useEffect(() => {
    // setState só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // Repõe filtros guardados
    try {
      const raw = sessionStorage.getItem(CHAVE_FILTROS)
      if (raw) {
        const f = JSON.parse(raw)
        setPesquisa(f.pesquisa ?? '')
        setFStatus(f.fStatus ?? '')
        setFDono(f.fDono ?? '')
        setFFornecedor(f.fFornecedor ?? '')
        setFMes(f.fMes ?? '')
      }
    } catch { /* filtros inválidos — ignora */ }
    setFiltrosCarregados(true)
  }, [])

  // Persiste filtros
  useEffect(() => {
    if (!filtrosCarregados) return
    sessionStorage.setItem(
      CHAVE_FILTROS,
      JSON.stringify({ pesquisa, fStatus, fDono, fFornecedor, fMes })
    )
  }, [filtrosCarregados, pesquisa, fStatus, fDono, fFornecedor, fMes])

  // Opções de filtro derivadas dos dados
  const estadosOpc = useMemo(
    () => Array.from(new Set(registos.map((r) => r.status).filter(Boolean))).sort() as string[],
    [registos]
  )
  const fornecedoresOpc = useMemo(
    () => Array.from(new Set(registos.map((r) => r.fornecedor).filter(Boolean))).sort() as string[],
    [registos]
  )
  const mesesOpc = useMemo(
    () =>
      Array.from(new Set(registos.map((r) => (r.data_saida ? r.data_saida.slice(0, 7) : null)).filter(Boolean)))
        .sort()
        .reverse() as string[],
    [registos]
  )

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return registos
      .filter((r) => !fStatus || r.status === fStatus)
      .filter((r) => !fDono || r.tipo_dono === fDono)
      .filter((r) => !fFornecedor || r.fornecedor === fFornecedor)
      .filter((r) => !fMes || (r.data_saida ?? '').slice(0, 7) === fMes)
      .filter((r) =>
        !q ||
        (r.numero ?? '').toLowerCase().includes(q) ||
        (r.peca ?? '').toLowerCase().includes(q) ||
        (r.serial_number ?? '').toLowerCase().includes(q) ||
        (r.sn_avariado ?? '').toLowerCase().includes(q) ||
        (r.cliente_nome ?? '').toLowerCase().includes(q)
      )
  }, [registos, pesquisa, fStatus, fDono, fFornecedor, fMes])

  // Agrupa por fornecedor de serviço; dentro de cada um, mais recente primeiro.
  const ordenados = useMemo(
    () =>
      [...filtrados].sort(
        (a, b) =>
          (a.fornecedor ?? 'zzz').localeCompare(b.fornecedor ?? 'zzz', 'pt') ||
          (b.data_saida ?? '').localeCompare(a.data_saida ?? '')
      ),
    [filtrados]
  )
  const LIMITE = 200
  const visiveis = ordenados.slice(0, LIMITE)

  const estadoLabel = (s: string) => estadoInfo(s)?.label ?? s

  // Nº de registos visíveis por fornecedor (para mostrar no cabeçalho)
  const contagemPorForn = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of visiveis) {
      const forn = r.fornecedor || 'Sem fornecedor'
      m[forn] = (m[forn] ?? 0) + 1
    }
    return m
  }, [visiveis])

  function linhasAgrupadas() {
    const linhas: React.ReactElement[] = []
    let ultimoForn: string | null = null
    let recolhidoAtual = false
    for (const r of visiveis) {
      const forn = r.fornecedor || 'Sem fornecedor'
      if (forn !== ultimoForn) {
        recolhidoAtual = !!recolhidos[forn]
        const recolhido = recolhidoAtual
        linhas.push(
          <button
            key={`f-${forn}`}
            type="button"
            style={c.grupoForn}
            onClick={() => setRecolhidos((mp) => ({ ...mp, [forn]: !mp[forn] }))}
            aria-expanded={!recolhido}
          >
            <span style={{ ...c.chevron, transform: recolhido ? 'rotate(0deg)' : 'rotate(90deg)' }}>▸</span>
            <span>{forn}</span>
            <span style={c.grupoContagem}>{contagemPorForn[forn]}</span>
          </button>
        )
        ultimoForn = forn
      }
      if (recolhidoAtual) continue
      linhas.push(
        <Link key={r.id} href={`/logistico/reparacao-pecas/${r.id}`} style={c.linha}>
          <span style={{ minWidth: 0 }}>
            <span style={c.numero}>{r.numero || '—'}</span>
            <span style={{ fontWeight: 600 }}>{r.peca || '—'}</span>
            {(r.sn_avariado || r.serial_number) && (
              <span style={c.serialTag}>S/N: {r.sn_avariado || r.serial_number}</span>
            )}
            <span style={c.meta}>
              {r.tipo_dono === 'cliente' ? `Cliente: ${r.cliente_nome || '—'}` : 'Nossa'}
              {r.garantia ? ` · ${r.garantia}` : ''}
              {r.pago ? ` · ${r.pago}` : ''}
            </span>
          </span>
          <span style={c.dir}>
            <EstadoBadge r={r} />
            <span style={c.dataSaida}>{r.data_saida || '—'}</span>
          </span>
        </Link>
      )
    }
    return linhas
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Peças em Reparação</h1>
        <Link href="/logistico" style={c.voltar}>← Logística</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por nº, peça, SN, cliente..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.input}
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {estadosOpc.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
        </select>
        <select value={fDono} onChange={(e) => setFDono(e.target.value)} style={c.select}>
          <option value="">Nossa / Cliente</option>
          <option value="nossa">Nossa</option>
          <option value="cliente">Cliente</option>
        </select>
        <select value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)} style={c.select}>
          <option value="">Todos os fornecedores</option>
          {fornecedoresOpc.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={fMes} onChange={(e) => setFMes(e.target.value)} style={c.select}>
          <option value="">Todos os meses</option>
          {mesesOpc.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {isAdmin && (
          <Link href="/logistico/reparacao-pecas/nova" style={c.btnPrimario}>+ Nova Reparação</Link>
        )}
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} registo(s)</span>
        {filtrados.length > LIMITE && (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>a mostrar {LIMITE} — refina a pesquisa</span>
        )}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem registos.</p>
      ) : (
        <div style={c.tabela}>
          {linhasAgrupadas()}
        </div>
      )}

      <p style={c.dica}>Toca num registo para ver os detalhes e gerir o processo.</p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { flex: 1, minWidth: 180, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8 },
  grupoForn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontWeight: 800, fontSize: 14, color: 'var(--primary)', background: 'var(--accent-bg, #eef1f6)', border: 'none', borderRadius: 6, padding: 8, marginTop: 8, cursor: 'pointer' },
  chevron: { display: 'inline-block', fontSize: 12, transition: 'transform 0.15s', color: 'var(--muted)' },
  grupoContagem: { marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: '#fff', borderRadius: 999, padding: '1px 8px' },
  linha: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', textDecoration: 'none', color: 'inherit', cursor: 'pointer' },
  numero: { display: 'inline-block', marginRight: 8, fontWeight: 700, fontSize: 12.5, color: 'var(--primary)' },
  serialTag: { marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--muted)' },
  meta: { display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  dir: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  dataSaida: { fontSize: 12.5, color: 'var(--muted)' },
  dica: { color: 'var(--muted)', fontSize: 13, marginTop: 10, textAlign: 'center' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
}
