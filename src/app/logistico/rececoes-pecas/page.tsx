'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarRececoes } from '@/lib/rececoesPecas'
import {
  ESTADOS_RECECAO, estadoRececaoInfo, motivoRececaoInfo, type RececaoPeca,
} from '@/types/rececaoPecas'

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoRececaoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function RececoesPecasPage() {
  const router = useRouter()
  const [rececoes, setRececoes] = useState<RececaoPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [estado, setEstado] = useState('')

  useEffect(() => {
    listarRececoes().then((r) => { setRececoes(r); setCarregando(false) })
  }, [])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return rececoes.filter((r) => {
      if (estado && r.estado !== estado) return false
      if (q) {
        const origem = r.origem_tipo === 'cliente' ? r.cliente_nome : r.fornecedor_nome
        const alvo = `${r.numero ?? ''} ${origem ?? ''} ${r.referencia_numero ?? ''} ${r.equipamento_sn ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      return true
    })
  }, [rececoes, pesquisa, estado])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Receções de Encomendas</h1>
        <Link href="/logistico/rececoes-pecas/nova" style={c.btnPrimario}>+ Nova Receção de Encomenda</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por número, origem, documento ou SN..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={{ ...c.input, flex: 1, minWidth: 180 }}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {ESTADOS_RECECAO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        {(pesquisa || estado) && (
          <button style={c.btnGhost} onClick={() => { setPesquisa(''); setEstado('') }}>Limpar</button>
        )}
      </div>

      <div style={c.resumo}><span>{filtrados.length} receção(ões)</span></div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem receções.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Número</span>
            <span>Data</span>
            <span>Origem</span>
            <span>Motivo</span>
            <span>Documento</span>
            <span>Estado</span>
          </div>
          {filtrados.map((r) => {
            const origem = r.origem_tipo === 'cliente' ? r.cliente_nome : r.fornecedor_nome
            return (
              <div key={r.id} style={{ ...c.linha, ...c.clicavel }} onClick={() => router.push(`/logistico/rececoes-pecas/${r.id}`)}>
                <span style={{ fontWeight: 700 }}>{r.numero ?? '—'}</span>
                <span style={c.muted}>{(r.created_at ?? '').slice(0, 10)}</span>
                <span>{origem ?? '—'}</span>
                <span style={c.muted}>{motivoRececaoInfo(r.motivo).label}</span>
                <span style={c.muted}>{r.referencia_numero ?? '—'}</span>
                <span><EstadoBadge estado={r.estado} /></span>
              </div>
            )
          })}
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
  linha: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 1.6fr 1.3fr 1.2fr 1.1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 820 },
  clicavel: { cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
