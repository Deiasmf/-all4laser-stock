'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Guarda de rota do módulo Contas Correntes. O acesso é de todo o staff interno
// (espelha a RLS is_staff() das tabelas cc_*). Quem não é staff é reenviado ao
// Dashboard. A proteção REAL é a RLS na base de dados — esta guarda só evita
// mostrar o ecrã a quem não deve.
export default function ContasCorrentesLayout({ children }: { children: React.ReactNode }) {
  const { perfilCarregado, isAdmin } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (perfilCarregado && !isAdmin) router.replace('/')
  }, [perfilCarregado, isAdmin, router])

  if (!perfilCarregado) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>🔒</p>
        <p>Não tens acesso às Contas Correntes.</p>
      </div>
    )
  }
  return <>{children}</>
}
