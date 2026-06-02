'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, mesAtual, nomeMes, ultimosMeses, somar } from '@/lib/alugueres'
import type { Aluguer } from '@/types/aluguer'

function agrupar(lista: Aluguer[], chave: (a: Aluguer) => string) {
  const m = new Map<string, number>()
  for (const a of lista) {
    const k = chave(a) || '—'
    m.set(k, (m.get(k) ?? 0) + (a.valor || 0))
  }
  return [...m.entries()].sort((x, y) => y[1] - x[1])
}

export default function DashboardAlugueres() {
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .then(({ data }) => {
        const lista = (data as Aluguer[]) ?? []
        setAlugueres(lista)
        setCarregando(false)
        // abrir no mês mais recente que tenha registos
        const ms = lista.map((a) => (a.data_entrega ?? '').slice(0, 7)).filter(Boolean).sort()
        if (ms.length) setMes(ms[ms.length - 1])
      })
  }, [])

  const doMes = useMemo(
    () => alugueres.filter((a) => (a.data_entrega ?? '').startsWith(mes)),
    [alugueres, mes]
  )

  const total = somar(doMes, (a) => a.valor)
  const nacional = somar(doMes.filter((a) => a.nacional), (a) => a.valor)
  const internacional = somar(doMes.filter((a) => !a.nacional), (a) => a.valor)
  const emCurso = alugueres.filter((a) => !a.data_recolha).length

  const porMetodo = agrupar(doMes, (a) => a.metodo_pagamento ?? '—')
  const topClientes = agrupar(doMes, (a) => a.cliente_nome ?? '—').slice(0, 5)
  const topEquip = agrupar(doMes, (a) =>
    [a.modelo, a.serial_number].filter(Boolean).join(' · ')
  ).slice(0, 5)

  // Gráfico dos últimos 12 meses (por data de entrega)
  const meses = ultimosMeses(12)
  const porMesValor = meses.map((m) => ({
    mes: m,
    valor: somar(alugueres.filter((a) => (a.data_entrega ?? '').startsWith(m)), (a) => a.valor),
  }))
  const maxMes = Math.max(1, ...porMesValor.map((x) => x.valor))

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres — Dashboard</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtroMes}>
        <label style={{ fontWeight: 600 }}>Mês:</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.inputMes} />
        <span style={c.mesNome}>{nomeMes(mes)}</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : (
        <>
          <div style={c.kpis}>
            <Kpi rotulo="Faturado no mês" valor={formatarEuro(total)} destaque />
            <Kpi rotulo="Nacional" valor={formatarEuro(nacional)} />
            <Kpi rotulo="Internacional" valor={formatarEuro(internacional)} />
            <Kpi rotulo="Nº de alugueres" valor={String(doMes.length)} />
            <Kpi rotulo="Em curso (por devolver)" valor={String(emCurso)} />
          </div>

          <Seccao titulo="Faturação dos últimos 12 meses">
            <div style={c.grafico}>
              {porMesValor.map((x) => (
                <div key={x.mes} style={c.barraCol} title={`${nomeMes(x.mes)}: ${formatarEuro(x.valor)}`}>
                  <div style={c.barraValor}>{x.valor > 0 ? Math.round(x.valor) : ''}</div>
                  <div style={{ ...c.barra, height: `${(x.valor / maxMes) * 100}%` }} />
                  <div style={c.barraLabel}>{x.mes.slice(5)}/{x.mes.slice(2, 4)}</div>
                </div>
              ))}
            </div>
          </Seccao>

          <div style={c.duasColunas}>
            <Seccao titulo="Top clientes do mês">
              <Lista dados={topClientes} vazio="Sem alugueres este mês." />
            </Seccao>
            <Seccao titulo="Top equipamentos do mês">
              <Lista dados={topEquip} vazio="Sem alugueres este mês." />
            </Seccao>
          </div>

          <Seccao titulo="Por método de pagamento (mês)">
            <Lista dados={porMetodo} vazio="Sem alugueres este mês." />
          </Seccao>
        </>
      )}
    </main>
  )
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ ...c.kpi, ...(destaque ? c.kpiDestaque : {}) }}>
      <div style={c.kpiValor}>{valor}</div>
      <div style={c.kpiRotulo}>{rotulo}</div>
    </div>
  )
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={c.seccao}>
      <div style={c.seccaoTitulo}>{titulo}</div>
      {children}
    </div>
  )
}

function Lista({ dados, vazio }: { dados: [string, number][]; vazio: string }) {
  if (dados.length === 0) return <div style={c.estado}>{vazio}</div>
  return (
    <div>
      {dados.map(([k, v]) => (
        <div key={k} style={c.linhaLista}>
          <span>{k}</span>
          <strong>{formatarEuro(v)}</strong>
        </div>
      ))}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtroMes: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' },
  inputMes: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  mesNome: { color: 'var(--muted)', textTransform: 'capitalize' },
  estado: { color: 'var(--muted)', padding: 8 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 8 },
  kpi: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  kpiDestaque: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  kpiValor: { fontSize: 22, fontWeight: 800, color: 'inherit' },
  kpiRotulo: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  seccaoTitulo: { fontWeight: 700, color: 'var(--primary)', marginBottom: 12 },
  duasColunas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  grafico: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, borderBottom: '1px solid var(--border)' },
  barraCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  barra: { width: '70%', background: 'var(--accent, #3552eb)', borderRadius: '4px 4px 0 0', minHeight: 2 },
  barraValor: { fontSize: 10, color: 'var(--muted)' },
  barraLabel: { fontSize: 10, color: 'var(--muted)', marginTop: 4 },
  linhaLista: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
}
