'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { diaSemanaPt, dataCurta, type TransportStop } from '@/lib/transportes'
import { listarMotoristas, type Motorista } from '@/lib/transportesRecursos'
import {
  listarParagensDia, listarCanceladasDia, listarDriverDays, atribuirMotorista, confirmarDia,
  type DriverDay,
} from '@/lib/transportesPlaneamento'

function amanhaISO(): string {
  const d = new Date(); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  return t.toISOString().slice(0, 10)
}
function somarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export default function RevisaoPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [data, setData] = useState(amanhaISO())
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [stops, setStops] = useState<TransportStop[]>([])
  const [canceladas, setCanceladas] = useState<TransportStop[]>([])
  const [driverDays, setDriverDays] = useState<DriverDay[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    const [s, cc, dd] = await Promise.all([listarParagensDia(data), listarCanceladasDia(data), listarDriverDays(data)])
    setStops(s); setCanceladas(cc); setDriverDays(dd); setACarregar(false)
  }, [data])
  useEffect(() => { listarMotoristas().then((m) => setMotoristas(m.filter((x) => x.ativo))) }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const alteradas = useMemo(() => stops.filter((s) => s.alterado), [stops])
  const porClassificar = useMemo(() => stops.filter((s) => s.estado === 'por_classificar'), [stops])
  const semMotorista = useMemo(() => stops.filter((s) => s.zona !== 'algarve' && !s.motorista_id), [stops])
  const confirmadoDia = driverDays.length > 0 && driverDays.every((d) => d.estado === 'confirmado')

  const grupos = useMemo(() => {
    const g: { chave: string; nome: string; lista: TransportStop[] }[] = []
    g.push({ chave: 'pool', nome: 'Por atribuir', lista: stops.filter((s) => s.zona !== 'algarve' && !s.motorista_id) })
    for (const m of motoristas) g.push({ chave: m.id, nome: m.nome, lista: stops.filter((s) => s.motorista_id === m.id) })
    g.push({ chave: 'algarve', nome: 'Algarve · Gonçalo', lista: stops.filter((s) => s.zona === 'algarve') })
    return g.filter((x) => x.lista.length > 0)
  }, [stops, motoristas])

  async function mover(stop: TransportStop, destino: string) {
    const { error } = await atribuirMotorista(stop.id, destino === 'pool' ? null : destino)
    if (error) { setToast('Erro: ' + error.message); return }
    carregar()
  }
  async function confirmar() {
    const comStops = motoristas.filter((m) => stops.some((s) => s.motorista_id === m.id)).map((m) => m.id)
    const r = await confirmarDia(data, comStops)
    if (!r.ok) { setToast('Erro: ' + (r.erro ?? '')); return }
    setToast('Agenda confirmada. As alterações foram dadas como revistas.'); carregar()
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda/planeamento" style={c.voltar}>← Planeamento</Link>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Revisão de véspera</h1>
          <p style={c.sub}>Vê o que mudou desde a publicação e confirma a agenda do dia.</p>
        </div>
        <div style={c.navDia}>
          <button style={c.btnNav} onClick={() => setData((d) => somarDias(d, -1))}>←</button>
          <input style={c.data} type="date" value={data} onChange={(e) => setData(e.target.value || amanhaISO())} />
          <button style={c.btnNav} onClick={() => setData((d) => somarDias(d, 1))}>→</button>
        </div>
      </div>

      <div style={c.barra}>
        <strong style={c.diaTit}>{diaSemanaPt(data)} · {dataCurta(data)}</strong>
        <span style={c.pill}>{stops.length} paragem(ns)</span>
        {alteradas.length > 0 && <span style={c.pillAlt}>{alteradas.length} alterada(s)</span>}
        {porClassificar.length > 0 && <span style={c.pillAviso}>{porClassificar.length} por classificar</span>}
        {semMotorista.length > 0 && <span style={c.pillAviso}>{semMotorista.length} sem motorista</span>}
        {confirmadoDia
          ? <span style={c.badgeConf}>✓ Confirmada</span>
          : <button style={c.btnPrim} onClick={confirmar} disabled={stops.length === 0}>Confirmar agenda</button>}
      </div>

      {aCarregar ? <p style={c.muted}>A carregar…</p> : (
        <>
          {/* Alterações desde a última revisão */}
          <section style={c.sec}>
            <h2 style={c.h2}>Alterações desde a última revisão</h2>
            {alteradas.length === 0 && canceladas.length === 0 ? (
              <p style={c.ok}>✓ Sem alterações.</p>
            ) : (
              <ul style={c.lista}>
                {alteradas.map((s) => (
                  <li key={s.id} style={{ ...c.item, ...c.itemAlt }}>
                    <span style={c.dot}>●</span> <strong>{s.tipo === 'entrega' ? 'Entrega' : s.tipo === 'recolha' ? 'Recolha' : '—'}</strong> · {s.cliente_nome ?? '(sem cliente)'} {s.morada ? `· ${s.morada}` : ''} <span style={c.muted2}>({s.calendario?.nome ?? ''})</span>
                  </li>
                ))}
                {canceladas.map((s) => (
                  <li key={s.id} style={{ ...c.item, ...c.itemCanc }}>
                    ✕ <s>{s.tipo === 'entrega' ? 'Entrega' : 'Recolha'} · {s.cliente_nome ?? ''}</s> <span style={c.muted2}>cancelado no Google</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Precisam de atenção */}
          {(porClassificar.length > 0 || semMotorista.length > 0) && (
            <section style={c.sec}>
              <h2 style={c.h2}>Precisam de atenção</h2>
              <ul style={c.lista}>
                {[...new Set([...porClassificar, ...semMotorista])].map((s) => (
                  <li key={s.id} style={{ ...c.item, ...c.itemAtencao }}>
                    <strong>{s.tipo === 'entrega' ? 'Entrega' : s.tipo === 'recolha' ? 'Recolha' : 'A classificar'}</strong> · {s.cliente_nome ?? '(sem cliente)'} {s.morada ? `· ${s.morada}` : ''}
                    <select style={c.selMover} value={s.motorista_id ?? 'pool'} onChange={(e) => mover(s, e.target.value)}>
                      <option value="pool">Por atribuir</option>
                      {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Agenda do dia por motorista */}
          <section style={c.sec}>
            <h2 style={c.h2}>Agenda do dia</h2>
            {grupos.length === 0 ? <p style={c.muted}>Sem paragens.</p> : grupos.map((g) => (
              <div key={g.chave} style={c.grupo}>
                <div style={c.grupoNome}>{g.nome} <span style={c.muted2}>· {g.lista.length}</span></div>
                <ul style={c.lista}>
                  {g.lista.map((s) => (
                    <li key={s.id} style={{ ...c.item, ...(s.alterado ? c.itemAlt : {}) }}>
                      {s.alterado && <span style={c.dot}>●</span>} <strong>{s.tipo === 'entrega' ? '📦' : s.tipo === 'recolha' ? '↩' : '❓'}</strong> {s.cliente_nome ?? '(sem cliente)'} {s.morada ? `· ${s.morada}` : ''} {s.notas ? <span style={c.nota}>⏰13h</span> : ''} <span style={c.muted2}>({s.calendario?.nome ?? ''})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 900, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '4px 0 10px' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  navDia: { display: 'flex', gap: 6, alignItems: 'center' },
  btnNav: { width: 34, height: 34, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 16 },
  data: { padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit' },
  barra: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '8px 12px', background: '#F9FAFB', border: '1px solid #eee', borderRadius: 10 },
  diaTit: { fontSize: 15 },
  pill: { color: 'var(--muted)', fontSize: 13 },
  pillAlt: { background: '#EDE9FE', color: '#5B21B6', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  pillAviso: { background: '#FEF3C7', color: '#92400E', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  badgeConf: { marginLeft: 'auto', background: '#D1FAE5', color: '#065F46', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 },
  btnPrim: { marginLeft: 'auto', padding: '8px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  muted2: { color: 'var(--muted)', fontSize: 12 },
  sec: { marginBottom: 18 },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 8px' },
  ok: { color: '#065F46', fontSize: 13 },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { fontSize: 13, padding: '8px 10px', border: '1px solid #eee', borderRadius: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  itemAlt: { background: '#F5F3FF', borderColor: '#DDD6FE' },
  itemCanc: { background: '#FEF2F2', borderColor: '#FECACA' },
  itemAtencao: { background: '#FFFBEB', borderColor: '#FDE68A' },
  dot: { color: '#7C3AED', fontWeight: 900 },
  nota: { fontSize: 11, color: '#B45309' },
  selMover: { marginLeft: 'auto', padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', fontSize: 12 },
  grupo: { marginBottom: 10 },
  grupoNome: { fontWeight: 700, fontSize: 13, margin: '0 0 4px' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60, maxWidth: '90%', textAlign: 'center' },
}
