// Placeholder com o design All4laser para departamentos ainda por preencher.
export default function EmConstrucao({ nome, icon }: { nome: string; icon: string }) {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="a4l-card" style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: 46, marginBottom: 12 }}>{icon}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
          <span className="a4l-gradient-text">{nome}</span>
        </h1>
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 14 }}>
          Em construção — vamos preencher esta área em breve.
        </p>
      </div>
    </div>
  )
}
