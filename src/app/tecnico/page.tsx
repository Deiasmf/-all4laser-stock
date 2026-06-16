import Link from 'next/link'

export default function TecnicoPage() {
  return (
    <main style={s.page}>
      <h1 style={s.titulo}>Técnico</h1>
      <p style={s.sub}>Ferramentas da área técnica.</p>

      <div style={s.grelha}>
        <Link href="/tecnico/folhas-obra" style={s.cartao}>
          <span style={s.icone}>📋</span>
          <span style={s.cartaoTitulo}>Folhas de Obra</span>
          <span style={s.cartaoDesc}>Registar intervenções, reparações e manutenções.</span>
        </Link>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 2, marginBottom: 20 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  cartao: { display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, textDecoration: 'none', color: 'inherit' },
  icone: { fontSize: 26 },
  cartaoTitulo: { fontWeight: 700, fontSize: 16, color: 'var(--foreground)' },
  cartaoDesc: { fontSize: 13, color: 'var(--muted)' },
}
