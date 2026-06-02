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

export default function ListaAlugueres() {
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [pesquisa, setPesquisa] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .order('data_entrega', { ascending: false })
      .then(({ data }) => {
        const lista = (data as Aluguer[]) ?? []
        setAlugueres(lista)
        setCarregando(false)
        // abrir no mês mais recente que tenha registos
        const ms = lista.map((a) => (a.data_entrega ?? '').slice(0, 7)).filter(Boolean).sort()
        if (ms.length) setMes(ms[ms.length - 1])
      })
  }, [])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return alugueres
      .filter((a) => (a.data_entrega ?? '').startsWith(mes))
      .filter((a) => !q || (a.cliente_nome ?? '').toLowerCase().includes(q))
  }, [alugueres, mes, pesquisa])

  const total = somar(filtrados, (a) => a.valor)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Alugueres</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.inputMes} />
        <input
          placeholder="Procurar cliente..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.inputPesq}
        />
      </div>

      <div style={c.resumo}>
        <span style={{ textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
        <span>{filtrados.length} aluguer(es) · <strong>{formatarEuro(total)}</strong></span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem alugueres neste mês.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Cliente</span>
            <span>Data</span>
            <span>Método</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
          </div>
          {filtrados.map((a) => (
            <div key={a.id} style={c.linha}>
              <span style={{ fontWeight: 600 }}>
                {a.cliente_nome ?? '—'}
                {!a.nacional && <span style={c.intl}>Internacional</span>}
              </span>
              <span>{formatarData(a.data_entrega)}</span>
              <span>{a.metodo_pagamento ?? '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(a.valor || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputMes: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  inputPesq: { flex: 1, minWidth: 160, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8 },
  linha: { display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.3fr 1fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  intl: { marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent, #3552eb)', borderRadius: 999, padding: '1px 6px' },
}
