'use client'

import Link from 'next/link'

// Dashboard do módulo Financeiro. Cartões placeholder — os próximos prompts
// preenchem cada secção. O acesso já está protegido pela guarda (layout) e,
// sobretudo, pela RLS na base de dados.
type Cartao = { href: string; titulo: string; icon: string; descricao: string }

const CARTOES: Cartao[] = [
  { href: '/financeiro/contas-correntes', titulo: 'Contas Correntes', icon: '📊', descricao: 'Saldos por cliente e fornecedor.' },
  { href: '/financeiro/keyinvoice', titulo: 'Keyinvoice', icon: '🔗', descricao: 'Integração e sincronização de faturação.' },
  { href: '/financeiro/documentos', titulo: 'Documentos', icon: '🧾', descricao: 'Faturas, recibos e notas de crédito.' },
  { href: '/financeiro/recolhas', titulo: 'Recolhas', icon: '💰', descricao: 'Cobranças e recolha de valores.' },
  { href: '/financeiro/alertas', titulo: 'Alertas', icon: '🔔', descricao: 'Vencimentos, saldos e divergências.' },
]

export default function FinanceiroDashboard() {
  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>💶 Financeiro</h1>
        <p style={c.sub}>Área restrita a administração e financeiro.</p>
      </div>

      <div style={c.grelha}>
        {CARTOES.map((k) => (
          <Link key={k.href} href={k.href} style={c.cartao}>
            <span style={c.cartaoIcon}>{k.icon}</span>
            <span style={c.cartaoTitulo}>{k.titulo}</span>
            <span style={c.cartaoDesc}>{k.descricao}</span>
            <span style={c.cartaoTag}>Em breve</span>
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
  cartao: {
    display: 'flex', flexDirection: 'column', gap: 6, background: '#fff',
    border: '1px solid var(--border)', borderRadius: 14, padding: 18,
    textDecoration: 'none', color: 'var(--foreground)', position: 'relative',
  },
  cartaoIcon: { fontSize: 28 },
  cartaoTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--primary)' },
  cartaoDesc: { fontSize: 13, color: 'var(--muted)' },
  cartaoTag: {
    alignSelf: 'flex-start', marginTop: 6, fontSize: 11, fontWeight: 700,
    color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '2px 10px',
  },
}
