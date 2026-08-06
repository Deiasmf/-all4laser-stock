'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { listarPackingLists, criarPackingList, cabecalhoVazio } from '@/lib/packingList'
import type { PackingList } from '@/types/packing'

export default function PackingListsPage() {
  const { isAdministrativo, perfil, perfilCarregado } = useAuth()
  const router = useRouter()
  const [lista, setLista] = useState<PackingList[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aCriar, setACriar] = useState(false)

  const carregar = useCallback(async () => {
    setACarregar(true); setLista(await listarPackingLists()); setACarregar(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function criarNova() {
    setACriar(true)
    const { data, error } = await criarPackingList(cabecalhoVazio(), perfil?.id ?? null)
    setACriar(false)
    if (error || !data) return
    router.push(`/admin-dept/cotacoes-transporte/packing-lists/${(data as PackingList).id}`)
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso à Área Administrativa.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
          <h1 style={c.titulo}>📦 Packing Lists</h1>
        </div>
        <button style={c.btnPrimario} onClick={criarNova} disabled={aCriar}>{aCriar ? 'A criar…' : '+ Nova packing list'}</button>
      </div>

      {aCarregar ? (
        <p style={c.muted}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>Sem packing lists. Cria uma nova ou gera a partir de um pedido de cotação.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead><tr>
              <th style={c.th}>Nº</th><th style={c.th}>Destinatário</th><th style={c.th}>Idioma</th>
              <th style={c.th}>Origem</th><th style={c.th}>Data</th>
            </tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} style={c.tr}>
                  <td style={c.td}><Link href={`/admin-dept/cotacoes-transporte/packing-lists/${p.id}`} style={c.link}>{p.numero ?? '—'}</Link></td>
                  <td style={c.td}>{p.destinatario_nome || p.destinatario_morada || '—'}</td>
                  <td style={c.td}>{p.idioma.toUpperCase()}</td>
                  <td style={c.td}>{p.request_id ? 'Pedido de cotação' : 'Independente'}</td>
                  <td style={c.td}>{p.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1080, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0' },
  tabelaWrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px', verticalAlign: 'top' },
  link: { color: '#2563EB', textDecoration: 'none', fontWeight: 700 },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
}
