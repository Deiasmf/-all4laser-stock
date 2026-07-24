'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Guarda de rota do módulo Financeiro: só admin e financeiro entram em
// /financeiro/*. Quem não tem acesso é redirecionado para o Dashboard.
//
// Nota: esta guarda é do lado do cliente (a sessão do Supabase vive em
// localStorage, não em cookies, por isso o middleware server-side não vê o
// token). A proteção REAL dos dados é a RLS na base de dados
// (has_financeiro_access()) — mesmo que alguém force o URL ou chame o Supabase
// diretamente, não obtém dados financeiros.
export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const { perfilCarregado, isFinanceiro } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (perfilCarregado && !isFinanceiro) router.replace('/')
  }, [perfilCarregado, isFinanceiro, router])

  if (!perfilCarregado) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }
  if (!isFinanceiro) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>🔒</p>
        <p>Não tens acesso à área Financeiro.</p>
      </div>
    )
  }
  return <>{children}</>
}
