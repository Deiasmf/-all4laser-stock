'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'

export default function ContratosPage() {
  const [contagem, setContagem] = useState<{ nacional: number; internacional: number } | null>(null)

  useEffect(() => {
    async function carregar() {
      const nac = await supabase
        .from('contratos_aluguer')
        .select('id', { count: 'exact', head: true })
        .eq('nacional', true)
      const intl = await supabase
        .from('contratos_aluguer')
        .select('id', { count: 'exact', head: true })
        .eq('nacional', false)
      setContagem({ nacional: nac.count ?? 0, internacional: intl.count ?? 0 })
    }
    // setContagem só corre após os await, dentro de carregar()
    carregar()
  }, [])

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>Contratos de aluguer</h1>
        <Link href="/alugueres" style={s.voltar}>← Alugueres</Link>
      </div>
      <AlugueresNav />

      <div style={s.grelha}>
        <Link href="/alugueres/contratos/nacional" style={s.cartao}>
          <span style={s.cartaoIcone}>🇵🇹</span>
          <span style={s.cartaoTitulo}>Nacional</span>
          <span style={s.cartaoSub}>
            {contagem ? `${contagem.nacional} contrato(s)` : '—'}
          </span>
        </Link>
        <Link href="/alugueres/contratos/internacional" style={s.cartao}>
          <span style={s.cartaoIcone}>🌍</span>
          <span style={s.cartaoTitulo}>Internacional</span>
          <span style={s.cartaoSub}>
            {contagem ? `${contagem.internacional} contrato(s)` : '—'}
          </span>
        </Link>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  grelha: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  cartao: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', textDecoration: 'none', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 16px', color: 'var(--foreground)' },
  cartaoIcone: { fontSize: 36 },
  cartaoTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  cartaoSub: { fontSize: 13, color: 'var(--muted)' },
}
