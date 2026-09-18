'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { diaSemanaPt, dataCurta, type TransportStop } from '@/lib/transportes'
import { listarMotoristas, listarCarrinhas, type Motorista, type Carrinha } from '@/lib/transportesRecursos'
import {
  listarParagensDia, atribuirMotorista, listarDriverDays, definirCarrinha,
  carrinhaEmConflito, publicarDia, despublicarDia, otimizarRotaDia, type DriverDay,
} from '@/lib/transportesPlaneamento'

function hojeISO(): string { return new Date().toISOString().slice(0, 10) }
function somarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export default function PlaneamentoPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [carrinhas, setCarrinhas] = useState<Carrinha[]>([])
  const [stops, setStops] = useState<TransportStop[]>([])
  const [driverDays, setDriverDays] = useState<DriverDay[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const carregarDia = useCallback(async () => {
    setACarregar(true)
    const [s, dd] = await Promise.all([listarParagensDia(data), listarDriverDays(data)])
    setStops(s); setDriverDays(dd); setACarregar(false)
  }, [data])
  const carregarBase = useCallback(async () => {
    const [m, c] = await Promise.all([listarMotoristas(), listarCarrinhas()])
    setMotoristas(m.filter((x) => x.ativo)); setCarrinhas(c.filter((x) => x.ativo))
  }, [])

  useEffect(() => { carregarBase() }, [carregarBase])
  useEffect(() => { carregarDia() }, [carregarDia])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const ddPorDriver = useMemo(() => new Map(driverDays.map((d) => [d.driver_id, d])), [driverDays])
  const nomeCarrinha = (id: string | null) => carrinhas.find((c) => c.id === id)?.nome ?? '—'

  // Colunas: Por atribuir + motoristas internos + Algarve.
  const colunas = useMemo(() => {
    const internos = motoristas.map((m) => ({ tipo: 'motorista' as const, id: m.id, nome: m.nome, sub: m.tipo === 'reforco' ? 'reforço' : (m.zona_principal ?? '') }))
    return [{ tipo: 'pool' as const, id: 'pool', nome: 'Por atribuir', sub: '' }, ...internos, { tipo: 'algarve' as const, id: 'algarve', nome: 'Algarve · Gonçalo', sub: 'externo' }]
  }, [motoristas])

  function stopsDaColuna(col: { tipo: string; id: string }): TransportStop[] {
    if (col.tipo === 'algarve') return stops.filter((s) => s.zona === 'algarve')
    if (col.tipo === 'pool') return stops.filter((s) => s.zona !== 'algarve' && !s.motorista_id)
    // Motorista: ordenar pela rota (ordem) quando existir.
    return stops.filter((s) => s.motorista_id === col.id)
      .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999))
  }

  const [aOtimizar, setAOtimizar] = useState<string | null>(null)
  async function otimizar(driverId: string) {
    setAOtimizar(driverId)
    const r = await otimizarRotaDia(data, driverId)
    setAOtimizar(null)
    if (!r.ok) { setToast('Erro: ' + (r.erro ?? '')); return }
    const metodo = r.metodo === 'ors' ? '' : ' (aprox., por proximidade)'
    const sem = r.semCoords ? ` · ${r.semCoords} sem morada` : ''
    setToast(`Rota — ${r.km ?? 0} km${metodo}${sem}.`)
    carregarDia()
  }

  async function mover(stop: TransportStop, destino: string) {
    const alvo = destino === 'pool' ? null : destino
    const { error } = await atribuirMotorista(stop.id, alvo)
    if (error) { setToast('Erro: ' + error.message); return }
    carregarDia()
  }

  async function mudarCarrinha(driverId: string, vehicleId: string) {
    if (vehicleId) {
      const conflito = await carrinhaEmConflito(data, vehicleId, driverId)
      if (conflito && !window.confirm(`Essa carrinha já está atribuída a ${conflito} neste dia. Atribuir mesmo assim?`)) return
    }
    const { error } = await definirCarrinha(data, driverId, vehicleId || null)
    if (error) { setToast('Erro: ' + error.message); return }
    setToast('Carrinha atualizada.'); carregarDia()
  }

  async function publicar() {
    const comStops = motoristas.filter((m) => stops.some((s) => s.motorista_id === m.id)).map((m) => m.id)
    if (comStops.length === 0) { setToast('Nada para publicar neste dia.'); return }
    const r = await publicarDia(data, comStops)
    if (!r.ok) { setToast('Erro: ' + (r.erro ?? '')); return }
    setToast('Dia publicado (visível como plano provisório).'); carregarDia()
  }
  async function despublicar() {
    await despublicarDia(data); setToast('Dia reposto a rascunho.'); carregarDia()
  }

  const algumPublicado = driverDays.some((d) => d.estado === 'publicado')

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda/paragens" style={c.voltar}>← Paragens</Link>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Planeamento do dia</h1>
          <p style={c.sub}>Atribui paragens a motoristas e carrinhas. <Link href="/alugueres/agenda/revisao" style={c.link}>Revisão de véspera ↗</Link> · <Link href="/alugueres/agenda/recursos" style={c.link}>Motoristas & carrinhas ↗</Link></p>
        </div>
        <div style={c.navDia}>
          <button style={c.btnNav} onClick={() => setData((d) => somarDias(d, -1))}>←</button>
          <input style={c.data} type="date" value={data} onChange={(e) => setData(e.target.value || hojeISO())} />
          <button style={c.btnNav} onClick={() => setData((d) => somarDias(d, 1))}>→</button>
        </div>
      </div>

      <div style={c.barra}>
        <strong style={c.diaTit}>{diaSemanaPt(data)} · {dataCurta(data)}</strong>
        <span style={c.contagem}>{stops.length} paragem(ns)</span>
        {algumPublicado
          ? <><span style={c.badgePub}>Publicado</span><button style={c.btnSec} onClick={despublicar}>Repor rascunho</button></>
          : <button style={c.btnPrim} onClick={publicar}>Publicar dia</button>}
      </div>

      {aCarregar ? <p style={c.muted}>A carregar…</p> : (
        <div style={c.board}>
          {colunas.map((col) => {
            const lista = stopsDaColuna(col)
            const dd = col.tipo === 'motorista' ? ddPorDriver.get(col.id) : undefined
            const publicado = dd?.estado === 'publicado'
            return (
              <div key={col.id} style={{ ...c.coluna, ...(col.tipo === 'pool' ? c.colPool : {}), ...(col.tipo === 'algarve' ? c.colAlgarve : {}) }}>
                <div style={c.colHead}>
                  <div style={c.colNome}>{col.nome} {publicado && <span style={c.pubMini} title="Publicado">●</span>}</div>
                  <div style={c.colSub}>{col.sub}{col.sub ? ' · ' : ''}{lista.length} paragem(ns)</div>
                  {col.tipo === 'motorista' && (
                    <>
                      <select style={c.selCarrinha} value={dd?.vehicle_id ?? ''} onChange={(e) => mudarCarrinha(col.id, e.target.value)} title="Carrinha do dia">
                        <option value="">🚐 Carrinha —</option>
                        {carrinhas.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.matricula ? ` (${v.matricula})` : ''}</option>)}
                      </select>
                      <div style={c.rotaLinha}>
                        <button style={c.btnRota} onClick={() => otimizar(col.id)} disabled={aOtimizar === col.id || lista.length === 0} title="Otimizar a ordem das paragens (OpenRouteService)">
                          {aOtimizar === col.id ? '…' : '🧭 Otimizar'}
                        </button>
                        {dd?.km_total != null && <span style={c.km}>{dd.km_total} km</span>}
                      </div>
                    </>
                  )}
                </div>
                <div style={c.cards}>
                  {lista.length === 0 ? <p style={c.vazioCol}>—</p> : lista.map((s) => (
                    <div key={s.id} style={{ ...c.card, ...(s.tipo === 'entrega' ? c.cardEntrega : c.cardRecolha) }}>
                      <div style={c.cardTopo}>
                        <span style={c.cardTipo}>{col.tipo === 'motorista' && s.ordem != null && <span style={c.ordemBadge}>{s.ordem}</span>}{s.tipo === 'entrega' ? '📦 Entrega' : s.tipo === 'recolha' ? '↩ Recolha' : '❓'}</span>
                        {s.notas && <span style={c.cardNota} title={s.notas}>⏰ 13h</span>}
                      </div>
                      <div style={c.cardCliente}>{s.cliente_nome ?? '(sem cliente)'}</div>
                      {s.morada && <div style={c.cardMorada}>{s.morada}{s.aviso_morada && <span style={c.avisoM} title="Morada pode não bater com a zona"> ⚠</span>}</div>}
                      <div style={c.cardEquip}>{s.calendario?.nome ?? ''}</div>
                      {col.tipo !== 'algarve' && (
                        <select style={c.selMover} value={col.tipo === 'motorista' ? col.id : 'pool'} onChange={(e) => mover(s, e.target.value)}>
                          <option value="pool">Por atribuir</option>
                          {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1400, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '4px 0 10px' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  link: { color: '#2563EB', textDecoration: 'none' },
  navDia: { display: 'flex', gap: 6, alignItems: 'center' },
  btnNav: { width: 34, height: 34, border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 16 },
  data: { padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit' },
  barra: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#F9FAFB', border: '1px solid #eee', borderRadius: 10 },
  diaTit: { fontSize: 15 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  badgePub: { background: '#D1FAE5', color: '#065F46', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  btnPrim: { marginLeft: 'auto', padding: '8px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSec: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  board: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' },
  coluna: { flex: '0 0 240px', width: 240, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', display: 'flex', flexDirection: 'column', maxHeight: '72vh' },
  colPool: { background: '#FFFBEB', borderColor: '#FDE68A' },
  colAlgarve: { background: '#EFF6FF', borderColor: '#BFDBFE' },
  colHead: { padding: 10, borderBottom: '1px solid #eee' },
  colNome: { fontWeight: 700, fontSize: 14 },
  colSub: { color: 'var(--muted)', fontSize: 12, margin: '2px 0 6px', textTransform: 'capitalize' },
  pubMini: { color: '#065F46' },
  selCarrinha: { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff', fontSize: 12 },
  rotaLinha: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 },
  btnRota: { padding: '5px 8px', border: '1px solid #2563EB', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  km: { fontSize: 12, fontWeight: 700, color: '#065F46' },
  ordemBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 999, background: '#111827', color: '#fff', fontSize: 10, fontWeight: 700, marginRight: 4, padding: '0 4px' },
  cards: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' },
  vazioCol: { color: 'var(--muted)', textAlign: 'center', fontSize: 12, padding: 8 },
  card: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' },
  cardEntrega: { borderLeft: '3px solid #1D4ED8' },
  cardRecolha: { borderLeft: '3px solid #92400E' },
  cardTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTipo: { fontSize: 12, fontWeight: 700 },
  cardNota: { fontSize: 11, color: '#B45309' },
  cardCliente: { fontWeight: 700, fontSize: 13, marginTop: 2 },
  cardMorada: { fontSize: 12, color: '#374151', marginTop: 2 },
  avisoM: { color: '#B45309' },
  cardEquip: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  selMover: { width: '100%', marginTop: 6, padding: '5px 6px', border: '1px solid #e5e7eb', borderRadius: 6, font: 'inherit', background: '#fff', fontSize: 12 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60, maxWidth: '90%', textAlign: 'center' },
}
