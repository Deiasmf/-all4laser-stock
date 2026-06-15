import { STATUS_CONFIG, type StatusProcesso } from '@/types/processo'

export default function StatusBadge({ status }: { status: StatusProcesso }) {
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        background: cfg.color,
        borderRadius: 999,
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
