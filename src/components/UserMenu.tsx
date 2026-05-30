'use client'

import { useAuth } from '@/lib/auth'

export default function UserMenu() {
  const { session, perfil, sair } = useAuth()

  if (!session) return null

  return (
    <div className="usermenu">
      <span className="usermenu-nome">
        {perfil?.nome ?? perfil?.email}
        {perfil?.role === 'admin' && <span className="usermenu-badge">Admin</span>}
      </span>
      <button className="usermenu-sair" onClick={sair}>
        Sair
      </button>
    </div>
  )
}
