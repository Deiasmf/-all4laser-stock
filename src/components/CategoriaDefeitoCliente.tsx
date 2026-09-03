'use client'

import { useEffect, useState } from 'react'
import {
  listarCategorias, listarSubcategorias, opcoesPlanas, resolverValor, valorDe,
  type CategoriaFin, type Subcategoria,
} from '@/lib/categoriasFin'
import { obterCategoriaDefeitoCliente, definirCategoriaDefeitoCliente } from '@/lib/clientesCategoria'

// Categoria-defeito do cliente (Item 3): faturas futuras deste cliente entram
// pré-categorizadas com ela (marca "automática"), sempre alteráveis por documento.
// Só faz sentido para quem tem acesso ao Financeiro — o pai decide se renderiza.
export default function CategoriaDefeitoCliente({ clienteId }: { clienteId: string }) {
  const [cats, setCats] = useState<CategoriaFin[]>([])
  const [subs, setSubs] = useState<Subcategoria[]>([])
  const [value, setValue] = useState('')
  const [inicial, setInicial] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([listarCategorias(), listarSubcategorias(), obterCategoriaDefeitoCliente(clienteId)])
      .then(([c, s, def]) => {
        if (!vivo) return
        setCats(c); setSubs(s)
        const v = valorDe({ categoria: def.categoria_defeito, subcategoria_id: def.subcategoria_defeito_id })
        setValue(v); setInicial(v)
      })
    return () => { vivo = false }
  }, [clienteId])

  const opcoes = opcoesPlanas(cats, subs)

  async function guardar() {
    setAGuardar(true); setMsg(null)
    const { categoria_chave, subcategoria_id } = resolverValor(value, subs, cats)
    const r = await definirCategoriaDefeitoCliente(clienteId, categoria_chave, subcategoria_id)
    setAGuardar(false)
    if (!r.ok) { setMsg('Erro: ' + (r.erro ?? '')); return }
    setInicial(value)
    setMsg(categoria_chave ? 'Categoria-defeito guardada ✓' : 'Categoria-defeito removida ✓')
  }

  return (
    <div style={s.wrap}>
      <div style={s.titulo}>Categoria-defeito (faturação)</div>
      <p style={s.ajuda}>Novas faturas deste cliente entram já com esta categoria (marca “automática”, sempre alterável).</p>
      <div style={s.linha}>
        <select value={value} onChange={(e) => setValue(e.target.value)} style={s.select}>
          <option value="">— Sem categoria-defeito —</option>
          {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button style={s.btn} disabled={aGuardar || value === inicial} onClick={guardar}>
          {aGuardar ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
      {msg && <div style={s.msg}>{msg}</div>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  titulo: { fontSize: 13, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.4 },
  ajuda: { fontSize: 12.5, color: 'var(--muted)', margin: 0 },
  linha: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, minWidth: 220 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  msg: { fontSize: 13, color: '#00875f', fontWeight: 600 },
}
