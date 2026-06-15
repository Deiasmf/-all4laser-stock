'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ProcessoCard from '@/components/processos/ProcessoCard'
import { obterAreaPorSlug, listarProcessosDaArea, listarGapsDaArea } from '@/lib/processos'
import { NIVEL_CONFIG, type Area, type Gap, type Processo } from '@/types/processo'

export default function AreaPage() {
  const params = useParams()
  const slug = params.area as string

  const [area, setArea] = useState<Area | null>(null)
  const [processos, setProcessos] = useState<Processo[]>([])
  const [gaps, setGaps] = useState<Gap[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      const a = await obterAreaPorSlug(slug)
      setArea(a)
      if (a) {
        const [ps, gs] = await Promise.all([listarProcessosDaArea(a.id), listarGapsDaArea(a.id)])
        setProcessos(ps)
        setGaps(gs)
      }
      setCarregando(false)
    }
    carregar()
  }, [slug])

  if (carregando) return <main style={c.page}><p style={c.estado}>A carregar...</p></main>
  if (!area) return <main style={c.page}><p style={c.estado}>Área não encontrada.</p><Link href="/processos" style={c.voltar}>← Processos</Link></main>

  const gapsAtivos = gaps.filter((g) => !g.resolvido)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={{ ...c.titulo }}>
          {area.icone} {area.nome}
        </h1>
        <Link href="/processos" style={c.voltar}>← Processos</Link>
      </div>

      {gapsAtivos.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h2 style={c.subtitulo}>Gaps identificados</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gapsAtivos.map((g) => {
              const cfg = NIVEL_CONFIG[g.nivel]
              return (
                <div key={g.id} style={c.gapLinha}>
                  <span style={{ ...c.gapTag, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                  <span style={{ fontSize: 14 }}>{g.texto}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <h2 style={c.subtitulo}>Processos ({processos.length})</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {processos.map((p) => (
          <ProcessoCard key={p.id} processo={p} areaSlug={area.slug} accent={area.cor_accent} />
        ))}
      </div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--foreground)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  estado: { color: 'var(--muted)', padding: 8 },
  subtitulo: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 },
  gapLinha: {
    display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap',
  },
  gapTag: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
}
