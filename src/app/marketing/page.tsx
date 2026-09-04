'use client'

import Link from 'next/link'

// Overview do módulo Marketing — grelha de cartões para as secções.
// Acessível a todo o staff (não é área restrita). O conteúdo real de cada
// secção é construído por fases; ver docs/marketing-publications-implementation-plan.md
type Cartao = { href: string; titulo: string; icon: string; descricao: string }

const CARTOES: Cartao[] = [
  { href: '/marketing/dashboard', titulo: 'Dashboard', icon: '📊', descricao: 'Visão operacional: agendadas, a rever, a aprovar, publicadas e falhadas.' },
  { href: '/marketing/calendario', titulo: 'Calendário', icon: '🗓️', descricao: 'Calendário editorial por mês, semana e lista — por plataforma e mercado.' },
  { href: '/marketing/publicacoes', titulo: 'Publicações', icon: '📝', descricao: 'Conteúdos e as suas variantes por plataforma (Instagram, Facebook, LinkedIn).' },
  { href: '/marketing/campanhas', titulo: 'Campanhas', icon: '📣', descricao: 'Agrupar publicações por campanha comercial ou institucional.' },
  { href: '/marketing/biblioteca', titulo: 'Biblioteca', icon: '🖼️', descricao: 'Imagens, vídeos, documentos e ligações Canva, com direitos e etiquetas.' },
  { href: '/marketing/relatorios', titulo: 'Relatórios', icon: '📈', descricao: 'Alcance, engagement, cliques e leads — por plataforma, mercado e equipamento.' },
  { href: '/marketing/configuracoes', titulo: 'Configurações', icon: '⚙️', descricao: 'Ligações às redes sociais, contas e opções de publicação.' },
]

export default function MarketingOverview() {
  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>📣 Marketing</h1>
        <p style={c.sub}>Planeamento, aprovação, programação e análise de conteúdos.</p>
      </div>

      <div style={c.grelha}>
        {CARTOES.map((k) => (
          <Link key={k.href} href={k.href} style={c.cartao}>
            <span style={c.cartaoIcon}>{k.icon}</span>
            <span style={c.cartaoTitulo}>{k.titulo}</span>
            <span style={c.cartaoDesc}>{k.descricao}</span>
          </Link>
        ))}
      </div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 20 },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 14 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  cartao: { display: 'flex', flexDirection: 'column', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18, textDecoration: 'none', color: 'var(--foreground)' },
  cartaoIcon: { fontSize: 28 },
  cartaoTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--primary)' },
  cartaoDesc: { fontSize: 13, color: 'var(--muted)' },
}
