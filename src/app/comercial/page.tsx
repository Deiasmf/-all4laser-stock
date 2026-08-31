'use client'

import Link from 'next/link'

const ATALHOS = [
  { href: '/comercial/clientes', icon: '👥', titulo: 'Clientes', desc: 'Fichas de cliente, contactos e histórico (CRM).' },
  { href: '/comercial/notas-encomenda', icon: '📋', titulo: 'Notas de Encomenda', desc: 'Emitir e acompanhar notas de encomenda.' },
  { href: '/comercial/leads', icon: '🔔', titulo: 'Leads', desc: 'Pedidos recebidos do site, redes sociais e email.' },
]

export default function ComercialPage() {
  return (
    <main style={s.page}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={s.titulo}><span className="a4l-gradient-text">Comercial</span></h1>
        <p style={s.sub}>Gestão de clientes, encomendas e oportunidades.</p>
      </div>
      <div style={s.grid}>
        {ATALHOS.map((a) => (
          <Link key={a.href} href={a.href} className="a4l-card" style={s.card}>
            <div style={s.icon}>{a.icon}</div>
            <div>
              <div style={s.cardTitulo}>{a.titulo}</div>
              <div style={s.cardDesc}>{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 24, fontWeight: 800 },
  sub: { color: 'var(--a4l-text-light, var(--muted))', fontSize: 14, marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  card: { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, textDecoration: 'none', color: 'inherit' },
  icon: { fontSize: 28, lineHeight: 1 },
  cardTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: 'var(--muted)' },
}
