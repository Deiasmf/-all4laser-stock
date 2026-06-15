// Pequeno badge vermelho com a contagem de gaps críticos.
export default function GapsBadge({
  total,
  titulo = 'gaps críticos',
}: {
  total: number
  titulo?: string
}) {
  if (!total) return null
  return (
    <span
      title={`${total} ${titulo}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--danger)',
        background: 'var(--danger-bg)',
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      ⚠ {total}
    </span>
  )
}
