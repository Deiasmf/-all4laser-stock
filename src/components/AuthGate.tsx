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
  // Rotas públicas (sem sessão): login, redefinição de password, o link de assinatura
  // do cliente e TODO o portal de reservas (/reservas/*), que tem a sua própria guarda.
  const ehPublico =
    ehLogin ||
    pathname === '/redefinir-password' ||
    pathname.startsWith('/assinar') ||
    pathname.startsWith('/reservas')

  useEffect(() => {
    if (carregando) return
    if (!session && !ehPublico) router.replace('/login')
    if (session && ehLogin) router.replace('/')
  }, [session, carregando, ehLogin, ehPublico, router])

  if (carregando) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }

  // Enquanto redireciona, não mostra conteúdo protegido
  if (!session && !ehPublico) return null
  if (session && ehLogin) return null

  return <>{children}</>
}
