'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS: { href: string; label: string }[] = [
  { href: '/alugueres/despesas/gestao', label: 'Despesas' },
  { href: '/alugueres/despesas/mapa', label: 'Mapa mensal' },
  { href: '/alugueres/despesas/fundos', label: 'Fundos' },
  { href: '/alugueres/despesas/tipos', label: 'Tipos' },
]

// Barra de navegação entre as páginas de gestão das Despesas de Alugueres.
export default function NavGestao() {
  const path = usePathname()
  return (
    <div style={s.wrap}>
      <Link href="/alugueres/despesas" style={s.voltar}>← A minha área</Link>
      <nav style={s.tabs}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} style={{ ...s.tab, ...(path === l.href ? s.tabOn : {}) }}>{l.label}</Link>
        ))}
      </nav>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tab: { padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 },
  tabOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
}
