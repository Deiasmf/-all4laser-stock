'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Protege todas as páginas: sem sessão -> vai para /login
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, carregando } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const ehLogin = pathname === '/login'

  useEffect(() => {
    if (carregando) return
    if (!session && !ehLogin) router.replace('/login')
    if (session && ehLogin) router.replace('/')
  }, [session, carregando, ehLogin, router])

  if (carregando) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }

  // Enquanto redireciona, não mostra conteúdo protegido
  if (!session && !ehLogin) return null
  if (session && ehLogin) return null

  return <>{children}</>
}
