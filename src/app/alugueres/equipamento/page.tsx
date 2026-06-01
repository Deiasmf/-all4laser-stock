'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'
import { formatarEuro, mesAtual, nomeMes, somar } from '@/lib/alugueres'
import type { Aluguer } from '@/types/aluguer'

type LinhaEquip = {
  serial: string
  modelo: string
  marca: string
  total: number
  num: number
}

export default function FaturacaoPorEquipamento() {
  const [alugueres, setAlugueres] = useState<Aluguer[]>([])
  const [tudo, setTudo] = useState(true)
  const [mes, setMes] = useState(mesAtual())
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase
      .from('alugueres')
      .select('*')
      .then(({ data }) => {
        setAlugueres((data as Aluguer[]) ?? [])
        setCarregando(false)
      })
  }, [])

  const filtrados = useMemo(
    () => (tudo ? alugueres : alugueres.filter((a) => (a.data_entrega ?? '').startsWith(mes))),
    [alugueres, tudo, mes]
  )

  const linhas: LinhaEquip[] = useMemo(() => {
    const m = new Map<string, LinhaEquip>()
    for (const a of filtrados) {
      const serial = a.serial_number ?? '—'
      const l = m.get(serial) ?? {
        serial,
        modelo: a.modelo ?? '',
        marca: a.marca ?? '',
        total: 0,
        num: 0,
      }
      l.total += a.valor || 0
      l.num += 1
      if (!l.modelo && a.modelo) l.modelo = a.modelo
      if (!l.marca && a.marca) l.marca = a.marca
      m.set(serial, l)
    }
    return [...m.values()].sort((x, y) => y.total - x.total)
  }, [filtrados])

  const totalGeral = somar(filtrados, (a) => a.valor)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Faturação por equipamento</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <AlugueresNav />

      <div style={c.filtro}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <input type="checkbox" checked={tudo} onChange={(e) => setTudo(e.target.checked)} />
          Todo o histórico
        </label>
        {!tudo && (
          <>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.inputMes} />
            <span style={c.mesNome}>{nomeMes(mes)}</span>
          </>
        )}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : linhas.length === 0 ? (
        <p style={c.estado}>Sem alugueres no período selecionado.</p>
      ) : (
        <>
          <div style={c.resumo}>
            Total faturado: <strong>{formatarEuro(totalGeral)}</strong> · {linhas.length} equipamento(s)
          </div>
          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.linhaCab }}>
              <span>Serial</span>
              <span>Modelo</span>
              <span>Marca</span>
              <span style={{ textAlign: 'center' }}>Nº alugueres</span>
              <span style={{ textAlign: 'right' }}>Faturado</span>
            </div>
            {linhas.map((l) => (
              <div key={l.serial} style={c.linha}>
                <span style={{ fontWeight: 600 }}>{l.serial}</span>
                <span>{l.modelo || '—'}</span>
                <span>{l.marca || '—'}</span>
                <span style={{ textAlign: 'center' }}>{l.num}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(l.total)}</span>
              </div>
            ))}
          </div>
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
  filtro: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  inputMes: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  mesNome: { color: 'var(--muted)', textTransform: 'capitalize' },
  estado: { color: 'var(--muted)', padding: 8 },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: 14, marginBottom: 16 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  linha: { display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr', gap: 8, padding: '8px 0', fontSize: 14, borderBottom: '1px solid #f5f5f5' },
  linhaCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12 },
}
