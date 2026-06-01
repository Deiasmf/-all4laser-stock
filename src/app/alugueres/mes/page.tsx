'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, mesAtual, nomeMes, somar } from '@/lib/alugueres'
import type { Aluguer } from '@/types/aluguer'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function AlugueresPorMes() {
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .order('data_entrega', { ascending: true })
      .then(({ data }) => {
        setAlugueres((data as Aluguer[]) ?? [])
        setCarregando(false)
      })
  }, [])

  const doMes = useMemo(
    () => alugueres.filter((a) => (a.data_entrega ?? '').startsWith(mes)),
    [alugueres, mes]
  )

  const total = somar(doMes, (a) => a.valor)
  const nacional = somar(doMes.filter((a) => a.nacional), (a) => a.valor)
  const internacional = somar(doMes.filter((a) => !a.nacional), (a) => a.valor)

  // Agrupar por cliente
  const porCliente = useMemo(() => {
    const m = new Map<string, { total: number; itens: Aluguer[] }>()
    for (const a of doMes) {
      const k = a.cliente_nome ?? '—'
      const g = m.get(k) ?? { total: 0, itens: [] }
      g.total += a.valor || 0
      g.itens.push(a)
      m.set(k, g)
    }
    return [...m.entries()].sort((x, y) => y[1].total - x[1].total)
  }, [doMes])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres por mês</h1>
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
      ) : doMes.length === 0 ? (
        <p style={c.estado}>Não há alugueres registados em {nomeMes(mes)}.</p>
      ) : (
        <>
          <div style={c.resumo}>
            <span>Total: <strong>{formatarEuro(total)}</strong></span>
            <span>Nacional: <strong>{formatarEuro(nacional)}</strong></span>
            <span>Internacional: <strong>{formatarEuro(internacional)}</strong></span>
            <span>Alugueres: <strong>{doMes.length}</strong></span>
          </div>

          {porCliente.map(([cliente, g]) => (
            <div key={cliente} style={c.blocoCliente}>
              <div style={c.clienteCabecalho}>
                <strong>{cliente}</strong>
                <span>{formatarEuro(g.total)}</span>
              </div>
              <div style={c.tabela}>
                <div style={{ ...c.linha, ...c.linhaCab }}>
                  <span>Equipamento</span>
                  <span>Tipo</span>
                  <span>Entrega</span>
                  <span>Recolha</span>
                  <span>Método</span>
                  <span style={{ textAlign: 'right' }}>Valor</span>
                </div>
                {g.itens.map((a) => (
                  <div key={a.id} style={c.linha}>
                    <span>{[a.modelo, a.serial_number].filter(Boolean).join(' · ') || '—'}</span>
                    <span>{a.tipo_aluguer ?? '—'}</span>
                    <span>{formatarData(a.data_entrega)}</span>
                    <span>{a.data_recolha ? formatarData(a.data_recolha) : 'em curso'}</span>
                    <span>{a.metodo_pagamento ?? '—'}</span>
                    <span style={{ textAlign: 'right' }}>{formatarEuro(a.valor || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </main>
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
  resumo: { display: 'flex', gap: 20, flexWrap: 'wrap', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: 14, marginBottom: 16 },
  blocoCliente: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 },
  clienteCabecalho: { display: 'flex', justifyContent: 'space-between', fontSize: 16, color: 'var(--primary)', marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 },
  tabela: { display: 'flex', flexDirection: 'column' },
  linha: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f5f5f5' },
  linhaCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12 },
}
