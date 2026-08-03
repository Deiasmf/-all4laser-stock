'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Guarda de rota do separador Tracking: só admin e administrativo entram.
// A proteção REAL dos dados é a RLS na BD (has_administrativo_access()) — mesmo
// que alguém force o URL ou chame o Supabase diretamente, não obtém dados.
export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  const { perfilCarregado, isAdministrativo } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (perfilCarregado && !isAdministrativo) router.replace('/')
  }, [perfilCarregado, isAdministrativo, router])

  if (!perfilCarregado) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }
  if (!isAdministrativo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 40, marginBottom: 8 }}>🔒</p>
        <p>Não tens acesso ao separador Tracking.</p>
      </div>
    )
  }
  return <>{children}</>
}
