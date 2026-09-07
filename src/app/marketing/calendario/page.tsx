'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarPostsCalendario, atualizarDataPrevista, type PostCalendario } from '@/lib/marketing'
import { useCanais, resolverCanais } from '@/lib/useCanais'
import { ESTADO_POST_LABEL } from '@/types/marketing'
import type { EstadoPost } from '@/types/marketing'

// Cor por estado (mesmo mapa da lista de publicações).
const ESTADO_COR: Partial<Record<EstadoPost, { c: string; bg: string }>> = {
  idea: { c: '#6B7280', bg: '#F3F4F6' }, draft: { c: '#3A3870', bg: '#EEEDFB' },
  in_review: { c: '#92400E', bg: '#FEF3C7' }, approved: { c: '#166534', bg: '#DCFCE7' },
  scheduled: { c: '#1E40AF', bg: '#DBEAFE' }, published: { c: '#065F46', bg: '#D1FAE5' },
  changes_requested: { c: '#9A3412', bg: '#FFEDD5' }, cancelled: { c: '#6B7280', bg: '#F3F4F6' },
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const hoje = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local

export default function CalendarioPage() {
  const router = useRouter()
  const [itens, setItens] = useState<PostCalendario[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ref, setRef] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() } })
  const [sobre, setSobre] = useState<string | null>(null) // dia sob o cursor a arrastar
  const { emoji: emojiCanal } = resolverCanais(useCanais())

  const recarregar = useCallback(() => {
    setCarregando(true)
    listarPostsCalendario().then(setItens).catch((e) => setErro(String(e))).finally(() => setCarregando(false))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  const porDia = useMemo(() => {
    const m = new Map<string, PostCalendario[]>()
    for (const it of itens) {
      const k = it.data_prevista.slice(0, 10)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return m
  }, [itens])

  // Largar uma publicação num dia → muda a data prevista (otimista).
  async function largarEm(dia: string, postId: string) {
    setSobre(null)
    const it = itens.find((x) => x.id === postId)
    if (!it || it.data_prevista.slice(0, 10) === dia) return
    setItens((prev) => prev.map((x) => x.id === postId ? { ...x, data_prevista: dia } : x))
    const { error } = await atualizarDataPrevista(postId, dia)
    if (error) { setErro('Não foi possível mover: ' + error.message); recarregar() }
  }

  const primeiro = new Date(ref.ano, ref.mes, 1)
  const offset = (primeiro.getDay() + 6) % 7 // segunda = 0
  const nDias = new Date(ref.ano, ref.mes + 1, 0).getDate()
  const celulas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => i + 1)]
  while (celulas.length % 7 !== 0) celulas.push(null)

  return (
    <main style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Calendário editorial</h1>
        </div>
        <Link href="/marketing/publicacoes/novo" style={s.btnNovo}>+ Nova publicação</Link>
      </div>

      <p style={s.dica}>Arrasta uma publicação para outro dia para mudar a data prevista. No telemóvel, abre a publicação para alterar a data.</p>

      {erro && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{erro}</p>}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, margin: '14px 0 12px' }}>
        <button onClick={() => setRef((r) => r.mes === 0 ? { ano: r.ano - 1, mes: 11 } : { ...r, mes: r.mes - 1 })} style={s.nav}>←</button>
        <strong style={{ fontSize: 16, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>{MESES[ref.mes]} {ref.ano}</strong>
        <button onClick={() => setRef((r) => r.mes === 11 ? { ano: r.ano + 1, mes: 0 } : { ...r, mes: r.mes + 1 })} style={s.nav}>→</button>
      </div>

      {carregando && <p style={{ color: 'var(--muted)', marginTop: 8 }}>A carregar…</p>}

      <div style={s.grelha}>
        {DIAS.map((d) => <div key={d} style={s.cabDia}>{d}</div>)}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={i} style={{ ...s.cel, background: 'transparent', border: 'none' }} />
          const k = `${ref.ano}-${String(ref.mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const items = porDia.get(k) ?? []
          const ehHoje = k === hoje()
          return (
            <div key={i}
              onDragOver={(e) => { e.preventDefault(); setSobre(k) }}
              onDragLeave={() => setSobre((atual) => atual === k ? null : atual)}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) largarEm(k, id) }}
              style={{ ...s.cel, ...(sobre === k ? s.celSobre : {}), ...(ehHoje ? s.celHoje : {}) }}>
              <div style={{ fontSize: 12, color: ehHoje ? 'var(--primary)' : 'var(--muted)', fontWeight: ehHoje ? 700 : 400, marginBottom: 3 }}>{dia}</div>
              {items.map((it) => {
                const cor = ESTADO_COR[it.estado_global] ?? ESTADO_COR.draft!
                return (
                  <div key={it.id} draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
                    onClick={() => router.push(`/marketing/publicacoes/${it.id}`)}
                    title={`${it.titulo_interno} · ${ESTADO_POST_LABEL[it.estado_global]}`}
                    style={{ ...s.chip, background: cor.bg, color: cor.c }}>
                    <span style={{ marginRight: 3 }}>{it.canais.map((c) => emojiCanal(c)).join('')}</span>
                    {it.titulo_interno}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  btnNovo: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '10px 16px', fontWeight: 700, textDecoration: 'none' },
  dica: { fontSize: 13, color: 'var(--muted)', marginTop: 10 },
  nav: { border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '4px 14px', cursor: 'pointer', fontSize: 16 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 },
  cabDia: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' },
  cel: { minHeight: 96, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 6, overflow: 'hidden' },
  celSobre: { background: '#EEF2FF', borderColor: 'var(--primary)' },
  celHoje: { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 1px var(--primary)' },
  chip: { fontSize: 11.5, borderRadius: 6, padding: '3px 6px', marginBottom: 3, cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 },
}
