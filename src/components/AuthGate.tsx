'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

// Protege as páginas internas (staff):
//  • sem sessão -> /login
//  • sessão de cliente do portal (sem perfil de staff) -> /reservas
// As rotas do portal (/reservas/*) têm a sua própria guarda e são tratadas como públicas aqui.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, carregando, perfil, perfilCarregado } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const ehLogin = pathname === '/login'
  const ehPublico =
    ehLogin ||
    pathname === '/redefinir-password' ||
    pathname.startsWith('/assinar') ||
    pathname.startsWith('/reservas') ||
    pathname.startsWith('/registo-cliente') ||
    pathname.startsWith('/p/')

  // Rota interna: exige sessão E perfil de staff.
  const ehInterna = !ehPublico

  useEffect(() => {
    if (carregando) return
    if (!session && ehInterna) { router.replace('/login'); return }
    if (session && ehLogin) { router.replace('/'); return }
    // Cliente do portal autenticado a tentar abrir uma rota interna -> portal.
    if (session && ehInterna && perfilCarregado && !perfil) router.replace('/reservas')
  }, [session, carregando, perfil, perfilCarregado, ehLogin, ehInterna, router])

  if (carregando) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }

  // Enquanto redireciona, não mostra conteúdo protegido
  if (!session && ehInterna) return null
  if (session && ehLogin) return null
  // Numa rota interna, espera saber se é staff antes de mostrar (evita "flash" de dados).
  if (session && ehInterna) {
    if (!perfilCarregado) {
      return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
    }
    if (!perfil) return null // cliente do portal -> a redirecionar para /reservas
  }

  return <>{children}</>
}
