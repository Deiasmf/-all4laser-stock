'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ProcessosNav from '@/components/processos/ProcessosNav'
import GapsBadge from '@/components/processos/GapsBadge'
import { listarAreasComResumo, listarGapsAtivos, type AreaComResumo, type GapComArea } from '@/lib/processos'
import { NIVEL_CONFIG } from '@/types/processo'

export default function ProcessosDashboard() {
  const [areas, setAreas] = useState<AreaComResumo[]>([])
  const [gaps, setGaps] = useState<GapComArea[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([listarAreasComResumo(), listarGapsAtivos()]).then(([a, g]) => {
      setAreas(a)
      setGaps(g)
      setCarregando(false)
    })
  }, [])

  const totais = useMemo(
    () => ({
      critico: gaps.filter((g) => g.nivel === 'critico').length,
      medio: gaps.filter((g) => g.nivel === 'medio').length,
      baixo: gaps.filter((g) => g.nivel === 'baixo').length,
    }),
    [gaps]
  )

  const criticos = gaps.filter((g) => g.nivel === 'critico')

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>📋 Processos</h1>
        <Link href="/" style={c.voltar}>← Stock</Link>
      </div>
      <ProcessosNav />

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : (
        <>
          {/* Contadores de gaps */}
          <div style={c.contadores}>
            <Contador label="Gaps críticos" valor={totais.critico} cfg={NIVEL_CONFIG.critico} />
            <Contador label="Gaps médios" valor={totais.medio} cfg={NIVEL_CONFIG.medio} />
            <Contador label="Baixa prioridade" valor={totais.baixo} cfg={NIVEL_CONFIG.baixo} />
          </div>

          {/* Gaps críticos */}
          {criticos.length > 0 && (
            <section style={{ marginBottom: 22 }}>
              <h2 style={c.subtitulo}>Gaps críticos a resolver</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {criticos.map((g) => (
                  <Link key={g.id} href={`/processos/${g.area_slug}`} style={c.gapLinha}>
                    <span style={{ ...c.gapTag, color: NIVEL_CONFIG.critico.color, background: NIVEL_CONFIG.critico.bg }}>
                      {g.area_icone} {g.area_nome}
                    </span>
                    <span style={{ fontSize: 14 }}>{g.texto}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Grelha de áreas */}
          <h2 style={c.subtitulo}>Áreas</h2>
          <div style={c.grelha}>
            {areas.map((a) => (
              <Link key={a.id} href={`/processos/${a.slug}`} style={{ ...c.areaCard, borderTop: `4px solid #${a.cor_accent}` }}>
                <div style={{ fontSize: 30 }}>{a.icone}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>{a.nome}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  {a.totalProcessos} processo{a.totalProcessos === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <GapsBadge total={a.gapsCriticos} />
                  {a.gapsMedios > 0 && (
                    <span style={{ ...c.miniGap, color: NIVEL_CONFIG.medio.color, background: NIVEL_CONFIG.medio.bg }}>
                      {a.gapsMedios} médio{a.gapsMedios === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

function Contador({ label, valor, cfg }: { label: string; valor: number; cfg: { color: string; bg: string } }) {
  return (
    <div style={{ ...c.contador, background: cfg.bg }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: cfg.color }}>{valor}</div>
      <div style={{ fontSize: 13, color: 'var(--foreground)' }}>{label}</div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  estado: { color: 'var(--muted)', padding: 8 },
  subtitulo: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 },
  contadores: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 },
  contador: { borderRadius: 12, padding: 16, textAlign: 'center' },
  gapLinha: {
    display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
    textDecoration: 'none', color: 'inherit', flexWrap: 'wrap',
  },
  gapTag: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 },
  areaCard: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 16, textDecoration: 'none', color: 'inherit',
  },
  miniGap: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
}
