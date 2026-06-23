import { corStatus } from '@/lib/statusEquipamento'

// Etiqueta colorida do status de um equipamento. Cor atribuída por
// palavra-chave (ver corStatus). Auto-suficiente: não depende de CSS externo.
export default function StatusEquipamento({ status }: { status: string | null | undefined }) {
  if (!status) return null
  const c = corStatus(status)
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 700,
        padding: '2px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}`,
      }}
    >
      {status}
    </span>
  )
}
