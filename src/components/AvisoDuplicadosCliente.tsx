'use client'

// Aviso em tempo real de clientes semelhantes (por nome/NIF/email), com a ação
// [Usar este cliente]. Reutilizável em qualquer formulário de criação de cliente.
import { useEffect, useState } from 'react'
import { clientesSemelhantes, type ClienteSemelhante } from '@/lib/clientes'

type Props = {
  nome?: string
  nif?: string
  email?: string
  onUsar: (c: ClienteSemelhante) => void
  // Não avisar sobre o próprio registo (em edição).
  excluirId?: string | null
}

export default function AvisoDuplicadosCliente({ nome, nif, email, onUsar, excluirId }: Props) {
  const [cands, setCands] = useState<ClienteSemelhante[]>([])

  useEffect(() => {
    let ativo = true
    const t = setTimeout(async () => {
      const r = await clientesSemelhantes({ nome, nif, email })
      if (ativo) setCands(r.filter((c) => c.id !== excluirId))
    }, 400)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [nome, nif, email, excluirId])

  if (cands.length === 0) return null

  const forte = cands.some((c) => c.por_nif)
  return (
    <div style={forte ? st.boxForte : st.box}>
      <div style={st.titulo}>
        {forte ? '⚠️ Já existe um cliente com este NIF' : 'ℹ️ Já existe um cliente parecido'}
      </div>
      {cands.slice(0, 5).map((c) => (
        <div key={c.id} style={st.linha}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={st.nome}>{c.nome}</div>
            <div style={st.meta}>
              {[
                c.por_nif && c.nif ? `NIF ${c.nif}` : null,
                c.cidade,
                c.pais,
                c.por_email && c.email ? c.email : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
          </div>
          <button type="button" style={st.btn} onClick={() => onUsar(c)}>
            Usar este cliente
          </button>
        </div>
      ))}
      <div style={st.rodape}>Se for mesmo um cliente diferente, continua a preencher para criar um novo.</div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  box: { border: '1px solid #F59E0B', background: '#FFFBEB', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  boxForte: { border: '1px solid #DC2626', background: '#FEF2F2', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  titulo: { fontSize: 13, fontWeight: 700, color: '#92400E' },
  linha: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  nome: { fontWeight: 700, fontSize: 14, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 12, color: 'var(--muted)' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  rodape: { fontSize: 12, color: 'var(--muted)' },
}
