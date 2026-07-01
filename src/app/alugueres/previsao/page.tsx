'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, nomeMes } from '@/lib/alugueres'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

type Marcacao = { cliente: string; calendario: string; modelo: string; zona: string; inicio: string; dias: number; tipo: string; valor: number; mes: string }
type Dados = {
  ok: boolean; erro?: string; total: number; nMarcacoes: number
  marcacoes: Marcacao[]; porMes: { mes: string; valor: number }[]; porZona: { zona: string; valor: number }[]; erros: string[]
}

const colunasExport: ColunaExport<Marcacao>[] = [
  { cabecalho: 'Cliente', valor: (m) => m.cliente },
  { cabecalho: 'Equipamento', valor: (m) => m.modelo },
  { cabecalho: 'Zona', valor: (m) => m.zona },
  { cabecalho: 'Início', valor: (m) => m.inicio },
  { cabecalho: 'Dias', valor: (m) => m.dias },
  { cabecalho: 'Tipo', valor: (m) => m.tipo },
  { cabecalho: 'Valor', valor: (m) => formatarEuro(m.valor) },
]

export default function PrevisaoPage() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [zona, setZona] = useState('')

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      try {
        const r = await fetch('/api/alugueres/previsao', { headers: { Authorization: `Bearer ${token ?? ''}` } })
        const j = await r.json()
        if (!ativo) return
        setCarregando(false)
        if (!j.ok) { setErro(j.erro ?? 'Não foi possível calcular a previsão.'); return }
        setDados(j)
      } catch {
        if (ativo) { setCarregando(false); setErro('Erro de rede ao calcular a previsão.') }
      }
    })()
    return () => { ativo = false }
  }, [])

  const marcacoesFiltradas = useMemo(
    () => (dados?.marcacoes ?? []).filter((m) => !zona || m.zona === zona),
    [dados, zona],
  )
  const maxMes = useMemo(() => Math.max(1, ...(dados?.porMes ?? []).map((x) => x.valor)), [dados])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Previsão de receita</h1>
        <Link href="/alugueres/agenda" style={c.voltar}>Calendários →</Link>
      </div>
      <AlugueresNav />

      {carregando ? (
        <p style={c.estado}>A ler as marcações da agenda e a calcular… (pode demorar uns segundos)</p>
      ) : erro ? (
        <div style={c.erro}>{erro}</div>
      ) : dados ? (
        <>
          <div style={c.totalCartao}>
            <span style={c.totalLabel}>Total previsto (até fim de 2026)</span>
            <span style={c.totalValor}>{formatarEuro(dados.total)}</span>
            <span style={c.totalSub}>{dados.nMarcacoes} marcações</span>
          </div>

          {dados.erros?.length > 0 && (
            <div style={c.aviso}>⚠️ Alguns calendários não foram lidos: {dados.erros.join(' · ')}</div>
          )}

          <h2 style={c.subt}>Por mês</h2>
          <div style={c.tabela}>
            {dados.porMes.map((m) => (
              <div key={m.mes} style={c.barraLinha}>
                <span style={c.barraMes}>{nomeMes(m.mes)}</span>
                <div style={c.barraTrack}>
                  <div style={{ ...c.barraFill, width: `${(m.valor / maxMes) * 100}%` }} />
                </div>
                <span style={c.barraValor}>{formatarEuro(m.valor)}</span>
              </div>
            ))}
          </div>

          <h2 style={c.subt}>Por zona</h2>
          <div style={c.zonas}>
            {dados.porZona.map((z) => (
              <button
                key={z.zona}
                style={zona === z.zona ? c.zonaAtiva : c.zona}
                onClick={() => setZona(zona === z.zona ? '' : z.zona)}
              >
                {z.zona}: <strong>{formatarEuro(z.valor)}</strong>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={c.subt}>Marcações {zona && `· ${zona}`} ({marcacoesFiltradas.length})</h2>
            <BotaoExportar nome="previsao" colunas={colunasExport} linhas={marcacoesFiltradas} />
          </div>
          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Cliente</span>
              <span>Equipamento</span>
              <span>Início</span>
              <span style={{ textAlign: 'center' }}>Dias</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            {marcacoesFiltradas.map((m, i) => (
              <div key={i} style={c.linha}>
                <span style={{ fontWeight: 600 }}>{m.cliente}</span>
                <span style={c.muted}>{m.modelo} · {m.zona}</span>
                <span style={c.muted}>{m.inicio}</span>
                <span style={{ textAlign: 'center' }}>{m.dias} <span style={c.muted}>({m.tipo})</span></span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(m.valor)}</span>
              </div>
            ))}
          </div>

          <p style={c.sub}>
            Valor calculado pela tabela de preços (modelo + duração). Confirma alguns para validar a regra.
          </p>
        </>
      ) : null}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  estado: { color: 'var(--muted)', padding: 8 },
  sub: { color: 'var(--muted)', fontSize: 13, margin: '12px 0' },
  subt: { fontSize: 16, fontWeight: 700, margin: '22px 0 10px' },
  totalCartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 2 },
  totalLabel: { fontSize: 14, color: 'var(--muted)', fontWeight: 600 },
  totalValor: { fontSize: 32, fontWeight: 800, color: '#1b873f' },
  totalSub: { fontSize: 13, color: 'var(--muted)' },
  aviso: { background: '#fff8e6', color: '#8a6d00', border: '1px solid #f0e0a8', borderRadius: 9, padding: '10px 12px', fontSize: 13, marginTop: 12 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  barraLinha: { display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 10, alignItems: 'center', padding: '6px 8px' },
  barraMes: { fontSize: 13, textTransform: 'capitalize' },
  barraTrack: { background: '#eef1f6', borderRadius: 6, height: 16, overflow: 'hidden' },
  barraFill: { background: '#1b873f', height: '100%', borderRadius: 6 },
  barraValor: { fontSize: 13, fontWeight: 700, textAlign: 'right' },
  zonas: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  zona: { background: '#fff', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  zonaAtiva: { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', borderRadius: 999, padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  linha: { display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 0.9fr 0.9fr 0.8fr', gap: 10, padding: '9px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 720 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  erro: { background: 'var(--danger-bg, #ffebee)', color: 'var(--danger, #c62828)', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, fontSize: 14 },
}
