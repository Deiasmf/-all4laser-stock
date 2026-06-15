import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { Processo } from '@/types/processo'

export default function ProcessoCard({
  processo,
  areaSlug,
  accent,
}: {
  processo: Processo
  areaSlug: string
  accent: string
}) {
  return (
    <Link
      href={`/processos/${areaSlug}/${processo.id}`}
      style={{
        display: 'block',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid #${accent}`,
        borderRadius: 10,
        padding: 14,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{processo.nome}</span>
        <StatusBadge status={processo.status} />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 10px', lineHeight: 1.45 }}>
        {processo.descricao}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--foreground)' }}>Responsável:</strong> {processo.responsavel}
        </span>
        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Ver fluxo →</span>
      </div>
    </Link>
  )
}
