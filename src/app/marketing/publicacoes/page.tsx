'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarPosts, type PostListItem } from '@/lib/marketing'
import { ESTADO_POST_LABEL, LINHA_NEGOCIO_LABEL, ESTRATEGIA_LABEL } from '@/types/marketing'
import type { EstadoPost } from '@/types/marketing'

const ESTADO_COR: Partial<Record<EstadoPost, { c: string; bg: string }>> = {
  idea: { c: '#6B7280', bg: '#F3F4F6' },
  draft: { c: '#3A3870', bg: '#EEEDFB' },
  in_review: { c: '#92400E', bg: '#FEF3C7' },
  approved: { c: '#166534', bg: '#DCFCE7' },
  scheduled: { c: '#1E40AF', bg: '#DBEAFE' },
  published: { c: '#065F46', bg: '#D1FAE5' },
  changes_requested: { c: '#9A3412', bg: '#FFEDD5' },
  failed: { c: '#B91C1C', bg: '#FEE2E2' },
  cancelled: { c: '#6B7280', bg: '#F3F4F6' },
  archived: { c: '#6B7280', bg: '#F3F4F6' },
}
const ESTADOS: (EstadoPost | 'todos')[] = ['todos', 'draft', 'in_review', 'approved', 'scheduled', 'published']

export default function PublicacoesPage() {
  const [posts, setPosts] = useState<PostListItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<EstadoPost | 'todos'>('todos')

  useEffect(() => {
    listarPosts().then(setPosts).catch((e) => setErro(String(e))).finally(() => setCarregando(false))
  }, [])

  const filtrados = posts.filter((p) => {
    if (filtro !== 'todos' && p.estado_global !== filtro) return false
    const txt = `${p.titulo_interno} ${p.numero ?? ''} ${p.campanha_nome ?? ''}`.toLowerCase()
    return !q.trim() || txt.includes(q.toLowerCase())
  })

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Publicações</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/marketing/publicacoes/importar" style={s.btnImportar}>⬆ Importar plano</Link>
          <Link href="/marketing/publicacoes/novo" style={s.btnNovo}>+ Nova publicação</Link>
        </div>
      </div>

      <input style={s.pesquisa} placeholder="Pesquisar por título, número ou campanha…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div style={s.pills}>
        {ESTADOS.map((e) => (
          <button key={e} onClick={() => setFiltro(e)} style={{ ...s.pill, ...(filtro === e ? s.pillOn : {}) }}>
            {e === 'todos' ? 'Todas' : ESTADO_POST_LABEL[e]}
          </button>
        ))}
      </div>

      {erro && <p style={{ ...s.estado, color: 'var(--danger)' }}>Erro: {erro}</p>}
      {carregando && <p style={s.estado}>A carregar…</p>}
      {!carregando && !erro && filtrados.length === 0 && (
        <p style={s.estado}>Sem publicações neste filtro. Cria uma com “+ Nova publicação”.</p>
      )}

      {!carregando && !erro && filtrados.length > 0 && (
        <table style={s.tabela}>
          <thead>
            <tr>
              <th style={s.th}>Número</th>
              <th style={s.th}>Título</th>
              <th style={s.th}>Campanha</th>
              <th style={s.th}>Linha</th>
              <th style={s.th}>Variantes</th>
              <th style={s.th}>Promoção</th>
              <th style={s.th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const cor = ESTADO_COR[p.estado_global] ?? ESTADO_COR.draft!
              return (
                <tr key={p.id} style={s.tr} onClick={() => { window.location.href = `/marketing/publicacoes/${p.id}` }}>
                  <td style={s.td}>{p.numero ?? '—'}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{p.titulo_interno}</td>
                  <td style={s.td}>{p.campanha_nome ?? '—'}</td>
                  <td style={s.td}>{p.linha_negocio ? LINHA_NEGOCIO_LABEL[p.linha_negocio] : '—'}</td>
                  <td style={s.td}>{p.n_variantes}</td>
                  <td style={s.td}>{ESTRATEGIA_LABEL[p.estrategia_promocao]}</td>
                  <td style={s.td}><span style={{ ...s.badge, color: cor.c, background: cor.bg }}>{ESTADO_POST_LABEL[p.estado_global]}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  btnNovo: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '10px 16px', fontWeight: 700, textDecoration: 'none' },
  btnImportar: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, textDecoration: 'none' },
  pesquisa: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', marginBottom: 12 },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  pill: { border: '1px solid var(--border)', background: '#fff', borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' },
  pillOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  estado: { color: 'var(--muted)', textAlign: 'center', padding: 30 },
  tabela: { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  th: { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '11px 12px', fontSize: 14 },
  badge: { padding: '3px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 },
}
