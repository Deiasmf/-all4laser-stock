'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { resumoTracking, type ResumoTracking } from '@/lib/tracking'

export default function AdminDeptPage() {
  const { isAdministrativo } = useAuth()
  const [resumo, setResumo] = useState<ResumoTracking | null>(null)

  useEffect(() => {
    if (!isAdministrativo) return
    let ativo = true
    resumoTracking().then((r) => { if (ativo) setResumo(r) })
    return () => { ativo = false }
  }, [isAdministrativo])

  return (
    <main style={c.page}>
      <h1 style={c.titulo}>🗂️ Administrativo</h1>

      <div style={c.grelha}>
        <Link href="/admin-dept/expedicao" style={c.cartao}>
          <div style={c.cartaoIcon}>✈️</div>
          <div style={c.cartaoTitulo}>Prontos a enviar</div>
          <div style={c.cartaoSub}>Expedição de equipamentos e notas de encomenda.</div>
        </Link>

        <Link href="/admin-dept/envios-pecas" style={c.cartao}>
          <div style={c.cartaoIcon}>📬</div>
          <div style={c.cartaoTitulo}>Envios de Encomendas</div>
          <div style={c.cartaoSub}>Faturação, cartas de porte e expedição de encomendas.</div>
        </Link>

        {isAdministrativo && (
          <Link href="/admin-dept/cotacoes-transporte" style={c.cartao}>
            <div style={c.cartaoIcon}>📦</div>
            <div style={c.cartaoTitulo}>Cotações de Transporte</div>
            <div style={c.cartaoSub}>Pedidos de cotação a transitários por email, comparação e escolha.</div>
          </Link>
        )}

        {isAdministrativo && (
          <Link href="/admin-dept/tracking" style={{ ...c.cartao, ...((resumo && (resumo.atrasadosExpresso + resumo.atrasadosAerea + resumo.problema) > 0) ? c.cartaoAlerta : {}) }}>
            <div style={c.cartaoIcon}>🚚</div>
            <div style={c.cartaoTitulo}>Tracking</div>
            {resumo ? (
              <div style={c.resumoLinha}>
                <span style={c.pill}>Expresso: {resumo.emTransitoExpresso} em trânsito{resumo.atrasadosExpresso > 0 ? ` · ${resumo.atrasadosExpresso} atrasado(s)` : ''}</span>
                <span style={c.pill}>Aérea: {resumo.emTransitoAerea} em trânsito{resumo.atrasadosAerea > 0 ? ` · ${resumo.atrasadosAerea} atrasado(s)` : ''}</span>
                {resumo.problema > 0 && <span style={c.pillAlerta}>{resumo.problema} com problema</span>}
              </div>
            ) : (
              <div style={c.cartaoSub}>Todos os envios com tracking / AWB / carta de porte.</div>
            )}
          </Link>
        )}
      </div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 20, maxWidth: 1000, margin: '0 auto' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 16 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  cartao: { display: 'block', background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  cartaoAlerta: { border: '1px solid #f0c14b', background: '#FFFBEB' },
  cartaoIcon: { fontSize: 28, marginBottom: 8 },
  cartaoTitulo: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  cartaoSub: { color: 'var(--muted)', fontSize: 13 },
  resumoLinha: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { fontSize: 12, fontWeight: 600, background: '#F3F4F6', color: '#374151', borderRadius: 999, padding: '3px 10px' },
  pillAlerta: { fontSize: 12, fontWeight: 700, background: '#FEE2E2', color: '#B91C1C', borderRadius: 999, padding: '3px 10px' },
}
