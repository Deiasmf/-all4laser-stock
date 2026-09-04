'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarAgendadas, type AgendadaItem } from '@/lib/marketing'
import { PLATAFORMA_LABEL } from '@/types/marketing'

const COR_PLAT: Record<string, string> = {
  instagram_feed: '#C13584', instagram_story: '#C13584', instagram_reel: '#C13584',
  facebook: '#1877F2', linkedin: '#0A66C2',
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// Chave YYYY-MM-DD na hora de Lisboa (para agrupar por dia sem saltos de fuso).
function chaveDia(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
}
function horaLisboa(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })
}

export default function CalendarioPage() {
  const [itens, setItens] = useState<AgendadaItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [vista, setVista] = useState<'lista' | 'mes'>('lista')
  const [ref, setRef] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() } })

  useEffect(() => {
    listarAgendadas().then(setItens).catch((e) => setErro(String(e))).finally(() => setCarregando(false))
  }, [])

  const porDia = useMemo(() => {
    const m = new Map<string, AgendadaItem[]>()
    for (const it of itens) {
      const k = chaveDia(it.data_agendada)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return m
  }, [itens])

  return (
    <main style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Calendário editorial</h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setVista('lista')} style={{ ...s.toggle, ...(vista === 'lista' ? s.toggleOn : {}) }}>Lista</button>
          <button onClick={() => setVista('mes')} style={{ ...s.toggle, ...(vista === 'mes' ? s.toggleOn : {}) }}>Mês</button>
        </div>
      </div>

      {erro && <p style={{ color: 'var(--danger)', marginTop: 16 }}>Erro: {erro}</p>}
      {carregando && <p style={{ color: 'var(--muted)', marginTop: 16 }}>A carregar…</p>}
      {!carregando && itens.length === 0 && (
        <p style={{ color: 'var(--muted)', marginTop: 16 }}>Nada agendado. Define data e hora nas variantes das publicações.</p>
      )}

      {!carregando && itens.length > 0 && vista === 'lista' && (
        <div style={{ marginTop: 18 }}>
          {[...porDia.keys()].sort().map((dia) => (
            <div key={dia} style={{ marginBottom: 18 }}>
              <div style={s.diaTitulo}>{new Date(dia + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="a4l-card" style={{ padding: 0, overflow: 'hidden' }}>
                {porDia.get(dia)!.map((it) => (
                  <Link key={it.id} href={`/marketing/publicacoes/${it.post_id}`} style={s.item}>
                    <span style={{ ...s.ponto, background: COR_PLAT[it.plataforma] }} />
                    <span style={{ minWidth: 44, color: 'var(--muted)', fontSize: 13 }}>{horaLisboa(it.data_agendada)}</span>
                    <span style={{ fontWeight: 600, flex: 1 }}>{it.titulo_post}</span>
                    <span style={s.tag}>{PLATAFORMA_LABEL[it.plataforma]}</span>
                    {it.mercados.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{it.mercados.join(', ')}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!carregando && vista === 'mes' && (
        <VistaMes ano={ref.ano} mes={ref.mes} porDia={porDia}
          onAnterior={() => setRef((r) => r.mes === 0 ? { ano: r.ano - 1, mes: 11 } : { ...r, mes: r.mes - 1 })}
          onSeguinte={() => setRef((r) => r.mes === 11 ? { ano: r.ano + 1, mes: 0 } : { ...r, mes: r.mes + 1 })} />
      )}
    </main>
  )
}

function VistaMes({ ano, mes, porDia, onAnterior, onSeguinte }: {
  ano: number; mes: number; porDia: Map<string, AgendadaItem[]>
  onAnterior: () => void; onSeguinte: () => void
}) {
  const primeiro = new Date(ano, mes, 1)
  const offset = (primeiro.getDay() + 6) % 7 // segunda = 0
  const nDias = new Date(ano, mes + 1, 0).getDate()
  const celulas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => i + 1)]
  while (celulas.length % 7 !== 0) celulas.push(null)

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <button onClick={onAnterior} style={ms.nav}>←</button>
        <strong style={{ fontSize: 16, textTransform: 'capitalize' }}>{MESES[mes]} {ano}</strong>
        <button onClick={onSeguinte} style={ms.nav}>→</button>
      </div>
      <div style={ms.grelha}>
        {DIAS.map((d) => <div key={d} style={ms.cabDia}>{d}</div>)}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={i} style={{ ...ms.cel, background: 'transparent', border: 'none' }} />
          const k = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const items = porDia.get(k) ?? []
          return (
            <div key={i} style={ms.cel}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{dia}</div>
              {items.slice(0, 3).map((it) => (
                <Link key={it.id} href={`/marketing/publicacoes/${it.post_id}`} style={ms.chip} title={it.titulo_post}>
                  <span style={{ ...mns.pt, background: COR_PLAT[it.plataforma] }} />{it.titulo_post}
                </Link>
              ))}
              {items.length > 3 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>+{items.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  toggle: { border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' },
  toggleOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  diaTitulo: { fontSize: 13.5, fontWeight: 700, color: 'var(--primary)', textTransform: 'capitalize', marginBottom: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--foreground)', fontSize: 14 },
  ponto: { width: 9, height: 9, borderRadius: 999, flexShrink: 0 },
  tag: { padding: '3px 10px', borderRadius: 999, fontSize: 12.5, background: '#F3F4F6', color: '#3A3870' },
}
const mns = { pt: { display: 'inline-block', width: 6, height: 6, borderRadius: 999, marginRight: 4 } as React.CSSProperties }
const ms: Record<string, React.CSSProperties> = {
  nav: { border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 16 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 },
  cabDia: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' },
  cel: { minHeight: 84, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 6, overflow: 'hidden' },
  chip: { display: 'flex', alignItems: 'center', fontSize: 11, background: '#F5F4FE', borderRadius: 6, padding: '2px 5px', marginBottom: 3, textDecoration: 'none', color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}
