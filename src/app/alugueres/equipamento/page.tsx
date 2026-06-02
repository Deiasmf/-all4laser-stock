'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, somar } from '@/lib/alugueres'
import type { FaturacaoEquip } from '@/types/aluguer'

export default function FaturacaoPorEquipamento() {
  const [linhas, setLinhas] = useState<FaturacaoEquip[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [estado, setEstado] = useState('todos')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('faturacao_equipamento')
      .select('*')
      .order('total_acumulado', { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        setLinhas((data as FaturacaoEquip[]) ?? [])
        setCarregando(false)
      })
  }, [])

  const estados = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.estado).filter(Boolean))) as string[],
    [linhas]
  )

  const filtradas = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return linhas
      .filter((l) => estado === 'todos' || (l.estado ?? '') === estado)
      .filter(
        (l) =>
          !q ||
          (l.serial_number ?? '').toLowerCase().includes(q) ||
          (l.modelo ?? '').toLowerCase().includes(q)
      )
  }, [linhas, pesquisa, estado])

  const totalAcc = somar(filtradas, (l) => l.total_acumulado)
  const totalMensal = somar(filtradas, (l) => l.valor_mensal)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Faturação por equipamento</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtros}>
        <input
          placeholder="Procurar serial ou modelo..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={c.inputPesq}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.select}>
          <option value="todos">Todos os estados</option>
          {estados.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div style={c.resumo}>
        <span>{filtradas.length} equipamento(s)</span>
        <span>Mensal: <strong>{formatarEuro(totalMensal)}</strong></span>
        <span>Acumulado: <strong>{formatarEuro(totalAcc)}</strong></span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>Sem equipamentos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Serial</span>
            <span>Modelo</span>
            <span>Localização</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Mensal</span>
            <span style={{ textAlign: 'right' }}>Acumulado</span>
          </div>
          {filtradas.map((l) => (
            <div key={l.id} style={c.linha}>
              <span style={{ fontWeight: 600 }}>
                {l.equipamento_id ? (
                  <Link href={`/equipamentos/${l.equipamento_id}`} style={c.link}>{l.serial_number}</Link>
                ) : (
                  l.serial_number
                )}
              </span>
              <span>{l.modelo || '—'}</span>
              <span>{l.localizacao || '—'}{!l.nacional && ' 🌍'}</span>
              <span>{l.estado || '—'}</span>
              <span style={{ textAlign: 'right' }}>{l.valor_mensal != null ? formatarEuro(l.valor_mensal) : '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{l.total_acumulado != null ? formatarEuro(l.total_acumulado) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  inputPesq: { flex: 1, minWidth: 180, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { display: 'flex', gap: 20, flexWrap: 'wrap', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8 },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1.2fr 0.9fr 1fr 1.1fr', gap: 8, padding: '9px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  link: { color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' },
}
