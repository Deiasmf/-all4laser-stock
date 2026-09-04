'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listarCampanhas } from '@/lib/marketing'
import type { Campanha } from '@/types/marketing'
import { LINHA_NEGOCIO_LABEL } from '@/types/marketing'

const ESTADO_COR: Record<string, { c: string; bg: string }> = {
  rascunho: { c: '#3A3870', bg: '#EEEDFB' },
  ativa: { c: '#166534', bg: '#DCFCE7' },
  encerrada: { c: '#6B7280', bg: '#F3F4F6' },
}

export default function CampanhasPage() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    listarCampanhas()
      .then(setCampanhas)
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false))
  }, [])

  const filtradas = campanhas.filter((c) =>
    !q.trim() || `${c.nome} ${c.numero ?? ''} ${c.oferta ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Campanhas</h1>
        </div>
        <Link href="/marketing/campanhas/nova" style={s.btnNovo}>+ Nova campanha</Link>
      </div>

      <input style={s.pesquisa} placeholder="Pesquisar por nome, número ou oferta…" value={q} onChange={(e) => setQ(e.target.value)} />

      {erro && <p style={{ ...s.estado, color: 'var(--danger)' }}>Erro: {erro}</p>}
      {carregando && <p style={s.estado}>A carregar…</p>}
      {!carregando && !erro && filtradas.length === 0 && (
        <p style={s.estado}>Ainda não há campanhas. Cria a primeira com “+ Nova campanha”.</p>
      )}

      {!carregando && !erro && filtradas.length > 0 && (
        <table style={s.tabela}>
          <thead>
            <tr>
              <th style={s.th}>Número</th>
              <th style={s.th}>Nome</th>
              <th style={s.th}>Linha</th>
              <th style={s.th}>Período</th>
              <th style={s.th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => {
              const cor = ESTADO_COR[c.estado] ?? ESTADO_COR.rascunho
              return (
                <tr key={c.id} style={s.tr} onClick={() => { window.location.href = `/marketing/campanhas/${c.id}` }}>
                  <td style={s.td}>{c.numero ?? '—'}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{c.nome}</td>
                  <td style={s.td}>{c.linha_negocio ? LINHA_NEGOCIO_LABEL[c.linha_negocio] : '—'}</td>
                  <td style={s.td}>{c.data_inicio ?? '—'}{c.data_fim ? ` → ${c.data_fim}` : ''}</td>
                  <td style={s.td}><span style={{ ...s.badge, color: cor.c, background: cor.bg }}>{c.estado}</span></td>
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
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  btnNovo: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '10px 16px', fontWeight: 700, textDecoration: 'none' },
  pesquisa: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', marginBottom: 16 },
  estado: { color: 'var(--muted)', textAlign: 'center', padding: 30 },
  tabela: { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  th: { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '11px 12px', fontSize: 14 },
  badge: { padding: '3px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 },
}
