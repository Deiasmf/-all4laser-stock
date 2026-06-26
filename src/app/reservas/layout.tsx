'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PortalAuthProvider, usePortalAuth } from '@/lib/portalAuth'
import { CONTACTOS_ALL4LASER } from '@/lib/reservasPortal'
import s from './portal.module.css'

// Rotas do portal acessíveis sem sessão de cliente.
const PUBLICAS = ['/reservas/login', '/reservas/registo']

function ehPublica(path: string) {
  return PUBLICAS.some((p) => path === p || path.startsWith(p + '/'))
}

// Guarda client-side (a app guarda a sessão em localStorage; não há middleware).
function Guarda({ children }: { children: React.ReactNode }) {
  const { session, carregando } = usePortalAuth()
  const pathname = usePathname()
  const router = useRouter()
  const publica = ehPublica(pathname)

  useEffect(() => {
    if (carregando) return
    if (!session && !publica) router.replace('/reservas/login')
  }, [session, carregando, publica, router])

  if (carregando) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar...</p>
  }
  if (!session && !publica) return null
  return <>{children}</>
}

function Cabecalho() {
  const { session, sair } = usePortalAuth()
  const router = useRouter()
  async function terminar() {
    await sair()
    router.replace('/reservas/login')
  }
  return (
    <header className={s.header}>
      <Link href={session ? '/reservas' : '/reservas/login'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="All4laser" className={s.logo} />
      </Link>
      {session && (
        <button className={s.sair} onClick={terminar}>Sair</button>
      )}
    </header>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <div className={s.portal}>
        <Cabecalho />
        <div className={s.conteudo}>
          <Guarda>{children}</Guarda>
        </div>
        <footer className={s.footer}>
          All4laser · Reservas de equipamento<br />
          {CONTACTOS_ALL4LASER.map((c, i) => (
            <span key={c.numero}>
              {i > 0 && ' · '}
              <a href={`tel:${c.numero}`}>{c.nome}: {c.display}</a>
            </span>
          ))}
          <br />
          <a href="mailto:geral@all4laser.com">geral@all4laser.com</a>
        </footer>
      </div>
    </PortalAuthProvider>
  )
}
