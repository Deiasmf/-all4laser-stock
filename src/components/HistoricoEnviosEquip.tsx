'use client'

import { useEffect, useState } from 'react'
import { listarEnviosEquipamento, type EnvioFichaEquip } from '@/lib/fichaProduto'

// Histórico inverso: a que leads/clientes a ficha deste equipamento foi enviada.
function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HistoricoEnviosEquip({ equipamentoId, refreshKey = 0 }: {
  equipamentoId: string
  refreshKey?: number
}) {
  const [itens, setItens] = useState<EnvioFichaEquip[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    let ativo = true
    listarEnviosEquipamento(equipamentoId).then((r) => { if (ativo) { setItens(r); setCarregado(true) } })
    return () => { ativo = false }
  }, [equipamentoId, refreshKey])

  if (!carregado || itens.length === 0) return null   // só aparece quando há envios

  return (
    <div style={s.seccao}>
      <div style={s.titulo}>Fichas enviadas ({itens.length})</div>
      <div style={s.lista}>
        {itens.map((e, i) => (
          <div key={i} style={s.linha}>
            <div style={{ minWidth: 0 }}>
              <div style={s.dest}><strong>{e.para_nome || e.para_email}</strong>{e.para_nome ? ` · ${e.para_email}` : ''}</div>
              <div style={s.meta}>
                {fmt(e.criado_em)} · por {e.enviado_por_nome ?? '—'}
                {e.idioma ? ` · ${e.idioma.toUpperCase()}` : ''}
                {e.views != null ? ` · 👁 ${e.views}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginTop: 16 },
  titulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  linha: { border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' },
  dest: { fontSize: 13.5, wordBreak: 'break-word' },
  meta: { fontSize: 11.5, color: 'var(--muted)', marginTop: 2 },
}
