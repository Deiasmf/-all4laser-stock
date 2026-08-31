'use client'

import { useEffect, useState } from 'react'
import { listarEnviosLead, type EnvioFichaLead } from '@/lib/fichaProduto'

// Histórico das fichas enviadas a uma lead (contexto para o follow-up).
function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HistoricoEnviosLead({ leadId, refreshKey = 0 }: { leadId: string; refreshKey?: number }) {
  const [itens, setItens] = useState<EnvioFichaLead[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    let ativo = true
    listarEnviosLead(leadId).then((r) => { if (ativo) { setItens(r); setCarregado(true) } })
    return () => { ativo = false }
  }, [leadId, refreshKey])

  if (!carregado || itens.length === 0) return null

  return (
    <div style={s.box}>
      <div style={s.tit}>Fichas enviadas ({itens.length})</div>
      {itens.map((e, i) => (
        <div key={i} style={s.linha}>
          <div style={s.eq}>{e.equipamentos.join(', ') || '—'}</div>
          <div style={s.meta}>{fmt(e.criado_em)} · {e.enviado_por_nome ?? '—'}{e.idioma ? ` · ${e.idioma.toUpperCase()}` : ''}</div>
        </div>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  box: { marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 12 },
  tit: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  linha: { padding: '6px 0', borderTop: '1px solid #f0f1f3' },
  eq: { fontSize: 13.5, fontWeight: 600 },
  meta: { fontSize: 11.5, color: 'var(--muted)', marginTop: 1 },
}
