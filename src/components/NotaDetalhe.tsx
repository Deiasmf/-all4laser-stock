'use client'

import { useEffect, useState } from 'react'
import { listarMateriais } from '@/lib/notasEncomenda'
import type { NotaEncomenda, NotaMaterial } from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

// Detalhe completo (só leitura) de uma nota de encomenda, para cada
// departamento consultar tudo o que precisa de fazer. Inclui o material que
// acompanha, agrupado por categoria.
export default function NotaDetalhe({ nota }: { nota: NotaEncomenda }) {
  const [materiais, setMateriais] = useState<NotaMaterial[]>([])

  useEffect(() => {
    let activo = true
    listarMateriais(nota.id).then((m) => { if (activo) setMateriais(m) })
    return () => { activo = false }
  }, [nota.id])

  // Agrupa o material por categoria, mantendo a ordem.
  const grupos: { categoria: string; itens: string[] }[] = []
  for (const m of materiais) {
    if (!m.item) continue
    const cat = m.categoria ?? 'Outros'
    const g = grupos.find((x) => x.categoria === cat)
    if (g) g.itens.push(m.item)
    else grupos.push({ categoria: cat, itens: [m.item] })
  }

  return (
    <div style={s.wrap}>
      <div style={s.grid}>
        <Campo r="Data do pedido" v={formatarData(nota.data_pedido)} />
        <Campo r="Cliente" v={nota.cliente_nome ?? '—'} />
        <Campo r="País de destino" v={nota.pais_destino ?? '—'} />
        <Campo r="Equipamento" v={`${nota.equipamento_modelo ?? '—'}${nota.equipamento_ano ? ' · ' + nota.equipamento_ano : ''}`} />
        <Campo r="Serial number" v={nota.equipamento_sn ?? '—'} />
        <Campo r="Capas" v={nota.capas ?? '—'} />
      </div>

      {nota.detalhes_tecnicos && (
        <div style={s.bloco}>
          <div style={s.rot}>Detalhes técnicos</div>
          <div style={s.texto}>{nota.detalhes_tecnicos}</div>
        </div>
      )}

      <div style={s.bloco}>
        <div style={s.rot}>Material que acompanha</div>
        {grupos.length === 0 ? (
          <div style={s.vazio}>Sem material registado.</div>
        ) : (
          grupos.map((g) => (
            <div key={g.categoria} style={s.catBloco}>
              <div style={s.catTitulo}>{g.categoria}</div>
              <ul style={s.lista}>
                {g.itens.map((it, i) => <li key={i} style={s.li}>{it}</li>)}
              </ul>
            </div>
          ))
        )}
      </div>

      {nota.observacoes && (
        <div style={s.bloco}>
          <div style={s.rot}>Observações</div>
          <div style={s.texto}>{nota.observacoes}</div>
        </div>
      )}
    </div>
  )
}

function Campo({ r, v }: { r: string; v: string }) {
  return (
    <div style={s.campo}>
      <span style={s.rot}>{r}</span>
      <span style={s.valor}>{v}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 2 },
  bloco: { display: 'flex', flexDirection: 'column', gap: 6 },
  rot: { color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  valor: { fontSize: 14, color: 'var(--foreground)' },
  texto: { fontSize: 14, color: 'var(--foreground)', whiteSpace: 'pre-wrap' },
  vazio: { fontSize: 13, color: 'var(--muted)' },
  catBloco: { display: 'flex', flexDirection: 'column', gap: 2 },
  catTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--primary)' },
  lista: { margin: '2px 0 6px', paddingLeft: 18 },
  li: { fontSize: 14, color: 'var(--foreground)', lineHeight: 1.5 },
}
