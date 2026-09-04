'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { dashboardMarketing, type MarketingDashboard } from '@/lib/marketing'
import { ESTADO_POST_LABEL, PLATAFORMA_LABEL } from '@/types/marketing'
import type { EstadoPost } from '@/types/marketing'

const KPIS: { estado: EstadoPost; cor: string }[] = [
  { estado: 'draft', cor: '#3A3870' },
  { estado: 'in_review', cor: '#92400E' },
  { estado: 'approved', cor: '#166534' },
  { estado: 'scheduled', cor: '#1E40AF' },
  { estado: 'published', cor: '#065F46' },
  { estado: 'failed', cor: '#B91C1C' },
]

export default function MarketingDashboardPage() {
  const [d, setD] = useState<MarketingDashboard | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { dashboardMarketing().then(setD).catch((e) => setErro(String(e))) }, [])

  return (
    <main style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/marketing/publicacoes/novo" style={s.btnPri}>+ Nova publicação</Link>
          <Link href="/marketing/campanhas/nova" style={s.btnSec}>+ Nova campanha</Link>
        </div>
      </div>

      {erro && <p style={{ color: 'var(--danger)', marginTop: 16 }}>Erro: {erro}</p>}
      {!d && !erro && <p style={{ color: 'var(--muted)', marginTop: 16 }}>A carregar…</p>}

      {d && (
        <>
          {/* Destaques */}
          <div style={s.destaques}>
            <Destaque n={d.agendadas7} rot="Agendadas · 7 dias" cor="#1E40AF" href="/marketing/calendario" />
            <Destaque n={d.agendadas30} rot="Agendadas · 30 dias" cor="#1E40AF" href="/marketing/calendario" />
            <Destaque n={d.porEstado['in_review'] ?? 0} rot="A aguardar revisão/aprovação" cor="#92400E" href="/marketing/publicacoes" />
            <Destaque n={d.candidatasPagas} rot="Candidatas a promoção paga" cor="#9A3412" href="/marketing/publicacoes" />
            <Destaque n={d.campanhasAtivas} rot="Campanhas ativas" cor="#166534" href="/marketing/campanhas" />
          </div>

          {/* Por estado */}
          <h2 style={s.h2}>Publicações por estado</h2>
          <div style={s.kpis}>
            {KPIS.map((k) => (
              <Link key={k.estado} href="/marketing/publicacoes" style={s.kpi}>
                <span style={{ ...s.kpiNum, color: k.cor }}>{d.porEstado[k.estado] ?? 0}</span>
                <span style={s.kpiRot}>{ESTADO_POST_LABEL[k.estado]}</span>
              </Link>
            ))}
          </div>

          {/* Próximas publicações agendadas */}
          <h2 style={s.h2}>Próximas agendadas</h2>
          {d.proximas.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nada agendado. Define data e hora nas variantes das publicações.</p>
          ) : (
            <div className="a4l-card" style={{ padding: 0, overflow: 'hidden' }}>
              {d.proximas.map((v) => (
                <Link key={v.id} href={`/marketing/publicacoes/${v.post_id}`} style={s.linhaProx}>
                  <span style={{ fontWeight: 600 }}>{v.titulo_post}</span>
                  <span style={s.tag}>{PLATAFORMA_LABEL[v.plataforma]}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {new Date(v.data_agendada).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

function Destaque({ n, rot, cor, href }: { n: number; rot: string; cor: string; href: string }) {
  return (
    <Link href={href} style={s.destaque}>
      <span style={{ fontSize: 28, fontWeight: 800, color: cor }}>{n}</span>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{rot}</span>
    </Link>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  btnPri: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 700, textDecoration: 'none', fontSize: 14 },
  btnSec: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, textDecoration: 'none', fontSize: 14 },
  destaques: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 18 },
  destaque: { display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textDecoration: 'none' },
  h2: { fontSize: 15, fontWeight: 700, color: 'var(--primary)', margin: '22px 0 10px' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 },
  kpi: { display: 'flex', flexDirection: 'column', gap: 2, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 14, textDecoration: 'none', alignItems: 'center' },
  kpiNum: { fontSize: 24, fontWeight: 800 },
  kpiRot: { fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' },
  linhaProx: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--foreground)', fontSize: 14 },
  tag: { padding: '3px 10px', borderRadius: 999, fontSize: 12.5, background: '#F3F4F6', color: '#3A3870' },
}
