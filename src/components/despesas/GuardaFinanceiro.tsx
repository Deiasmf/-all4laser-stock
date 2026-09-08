'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

// Guarda de rota para as páginas de gestão das Despesas de Alugueres. O bloqueio
// real é a RLS; isto só mostra uma mensagem amigável a quem não é financeiro
// (o menu Alugueres é visível a todo o staff, ao contrário do Financeiro).
export default function GuardaFinanceiro({ children }: { children: React.ReactNode }) {
  const { isFinanceiro, perfil } = useAuth()
  if (!perfil) return <main style={s.page}><p style={s.muted}>A carregar…</p></main>
  if (!isFinanceiro) {
    return (
      <main style={s.page}>
        <h1 style={s.titulo}>Sem acesso</h1>
        <p style={s.muted}>Esta área é só para o Financeiro. Podes registar as tuas despesas na tua área.</p>
        <Link href="/alugueres/despesas" style={s.link}>← As minhas despesas</Link>
      </main>
    )
  }
  return <>{children}</>
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '0 0 8px' },
  muted: { color: 'var(--muted)', fontSize: 14, marginBottom: 12 },
  link: { color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 },
}
