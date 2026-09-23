'use client'

import { usePortalCC } from '@/lib/portalCCAuth'
import { formatarMoeda, formatarData } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, Vazio } from './_comps'

export default function ResumoPage() {
  const { contas, contaSelId, t } = usePortalCC()
  const r = contas.find((c) => c.conta_id === contaSelId) ?? null

  return (
    <Cartao titulo={r ? `${t('nav_summary')} · ${r.conta_nome}` : t('nav_summary')}>
      <AtualizadoEm />
      {!r ? <Vazio /> : (
        <>
          <div style={est.grid}>
            <Bloco titulo={t('balance')} valor={formatarMoeda(r.saldo, r.moeda)} destaque />
            <Bloco titulo={t('open_total')} valor={formatarMoeda(r.total_esperado, r.moeda)} />
            <Bloco titulo={t('received_total')} valor={formatarMoeda(r.total_recebido, r.moeda)} />
            <Bloco titulo={t('in_stock')} valor={String(r.maquinas_em_stock)} />
            <Bloco titulo={t('next_due')} valor={formatarData(r.proximo_vencimento)} />
          </div>
          <Contacto />
        </>
      )}
    </Cartao>
  )
}

function Bloco({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ ...est.bloco, ...(destaque ? est.blocoDestaque : {}) }}>
      <span style={est.blocoTitulo}>{titulo}</span>
      <span style={{ ...est.blocoValor, ...(destaque ? { color: 'var(--primary, #0b3d2e)' } : {}) }}>{valor}</span>
    </div>
  )
}

const est: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 8 },
  bloco: { border: '1px solid #eef0f3', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  blocoDestaque: { background: '#F0FDF4', borderColor: '#BBF7D0' },
  blocoTitulo: { fontSize: 12.5, color: '#6b7280', fontWeight: 600 },
  blocoValor: { fontSize: 20, fontWeight: 800, color: '#111827' },
}
