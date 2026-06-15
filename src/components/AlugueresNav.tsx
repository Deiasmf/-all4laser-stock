'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/alugueres/lista', label: 'Lista' },
  { href: '/alugueres/leads', label: 'Leads' },
  { href: '/alugueres/disponibilidade', label: 'Disponibilidade' },
  { href: '/alugueres/reservas', label: 'Reservas' },
  { href: '/alugueres', label: 'Registar' },
  { href: '/alugueres/dashboard', label: 'Dashboard' },
  { href: '/alugueres/equipamento', label: 'Por equipamento' },
]

export default function AlugueresNav() {
  const path = usePathname()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
      {LINKS.map((l) => {
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
