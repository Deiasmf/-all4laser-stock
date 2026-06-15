'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function ProcessosNav() {
  const path = usePathname()
  const { isAdmin } = useAuth()

  const links = [
    { href: '/processos', label: 'Dashboard' },
    ...(isAdmin
      ? [
          { href: '/processos/novo', label: '+ Processo' },
          { href: '/processos/nova-area', label: '+ Área' },
        ]
      : []),
  ]

  return (
    <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
      {links.map((l) => {
        const ativo = path === l.href
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
              background: ativo ? 'var(--primary)' : '#fff',
              color: ativo ? '#fff' : 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          >
            {l.label}
          </Link>
        )
      })}
    </div>
  )
}
