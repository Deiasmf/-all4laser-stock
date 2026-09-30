'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Guarda de rota do módulo Contas Correntes. Os valores da parceria (custos,
// margens, pagamentos) são sensíveis → acesso só a admin/financeiro (espelha a
// RLS has_financeiro_access() das tabelas cc_*). A proteção REAL é a RLS na BD;
// esta guarda só evita mostrar o ecrã a quem não deve.
export default function ContasCorrentesLayout({ children }: { children: React.ReactNode }) {
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
        <p>Não tens acesso às Contas Correntes.</p>
      </div>
    )
  }
  return <>{children}</>
}
