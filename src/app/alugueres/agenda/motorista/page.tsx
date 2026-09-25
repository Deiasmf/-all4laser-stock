'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { diaSemanaPt, dataCurta, equipamentoParagem, type TransportStop } from '@/lib/transportes'
import {
  motoristaDoUtilizador, listarMotoristasAtivos, diaDoMotorista, paragensDoMotorista,
  marcarParagem, guardarNotaMotorista, linkMapa,
  type MotoristaLogado,
} from '@/lib/transportesMotorista'

// Vista mobile do motorista: as suas paragens do dia, marcar feita e nota.

function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function somaDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}
function horas(iso: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}
function janelaTexto(s: TransportStop): string {
  const a = horas(s.janela_inicio), b = horas(s.janela_fim)
  if (a && b) return `${a}–${b}`
  return a || b || ''
}

export default function MotoristaAgendaPage() {
  const { session, perfilCarregado } = useAuth()
  const [motoristas, setMotoristas] = useState<MotoristaLogado[]>([])
  const [ownId, setOwnId] = useState<string | null>(null)
  const [driverId, setDriverId] = useState<string | null>(null)
  const [data, setData] = useState(hojeLocal())
  const [diaEstado, setDiaEstado] = useState<string | null>(null)
  const [carrinha, setCarrinha] = useState<string | null>(null)
  const [kmTotal, setKmTotal] = useState<number | null>(null)
  const [paragens, setParagens] = useState<TransportStop[]>([])
  const [carregando, setCarregando] = useState(true)

  const uid = session?.user?.id ?? null

  // Carrega a lista de motoristas e o motorista do próprio login. Por omissão
  // abre na agenda do próprio; se não for motorista, no 1.º da lista.
  useEffect(() => {
    if (!uid) return
    Promise.all([motoristaDoUtilizador(uid), listarMotoristasAtivos()]).then(([own, lista]) => {
      setMotoristas(lista)
      setOwnId(own?.id ?? null)
      setDriverId((cur) => cur ?? own?.id ?? lista[0]?.id ?? null)
    })
  }, [uid])

  const carregar = useCallback(async (id: string, dia: string) => {
    setCarregando(true)
    const [dd, ps] = await Promise.all([diaDoMotorista(id, dia), paragensDoMotorista(id, dia)])
    setDiaEstado(dd?.estado ?? null)
    setCarrinha(dd?.carrinha?.nome ?? null)
    setKmTotal(dd?.km_total ?? null)
    setParagens(ps)
    setCarregando(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (driverId) carregar(driverId, data) }, [driverId, data, carregar])

  const motoristaAtual = motoristas.find((m) => m.id === driverId) ?? null
  const isOwn = !!driverId && driverId === ownId

  // Só mostra o plano quando publicado/confirmado (não rascunhos).
  const planoVisivel = diaEstado === 'publicado' || diaEstado === 'confirmado'
  const feitas = paragens.filter((p) => p.estado === 'concluida').length

  async function alternarFeita(p: TransportStop) {
    const feita = p.estado !== 'concluida'
    setParagens((prev) => prev.map((x) => x.id === p.id
      ? { ...x, estado: feita ? 'concluida' : 'confirmada', concluida_em: feita ? new Date().toISOString() : null }
      : x))
    const { error } = await marcarParagem(p.id, feita)
    if (error && driverId) carregar(driverId, data) // reverte se falhar
  }

  if (perfilCarregado && !uid) {
    return <main style={c.wrap}><p style={c.info}>Inicia sessão para veres a agenda do motorista.</p></main>
  }
  if (perfilCarregado && uid && motoristas.length === 0) {
    return <main style={c.wrap}><p style={c.info}>Ainda não há motoristas configurados na Agenda de Transportes.</p></main>
  }

  return (
    <main style={c.wrap}>
      <header style={c.header}>
        <div style={c.topoMotorista}>
          {motoristas.length > 1 ? (
            <select value={driverId ?? ''} onChange={(e) => setDriverId(e.target.value)} style={c.driverSelect} aria-label="Escolher motorista">
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}{m.id === ownId ? ' (tu)' : ''}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 800 }}>{motoristaAtual?.nome ?? 'Motorista'}</div>
          )}
          {!isOwn && <span style={c.soLeitura}>👁 Só leitura</span>}
        </div>
        <div style={c.navData}>
          <button onClick={() => setData((d) => somaDias(d, -1))} style={c.navBtn} aria-label="Dia anterior">‹</button>
          <div style={{ textAlign: 'center', minWidth: 150 }}>
            <div style={{ fontWeight: 700 }}>{diaSemanaPt(data)}, {dataCurta(data)}</div>
            <input type="date" value={data} onChange={(e) => setData(e.target.value || hojeLocal())} style={c.dateInput} />
          </div>
          <button onClick={() => setData((d) => somaDias(d, +1))} style={c.navBtn} aria-label="Dia seguinte">›</button>
        </div>
        {planoVisivel && (
          <div style={c.resumo}>
            <span>{feitas}/{paragens.length} feitas</span>
            {carrinha && <span>🚐 {carrinha}</span>}
            {kmTotal != null && <span>≈ {Math.round(kmTotal)} km</span>}
          </div>
        )}
      </header>

      {carregando ? (
        <p style={c.info}>A carregar…</p>
      ) : !planoVisivel ? (
        <p style={c.info}>O plano deste dia ainda não foi publicado.</p>
      ) : paragens.length === 0 ? (
        <p style={c.info}>Sem paragens para este dia.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {paragens.map((p, i) => (
            <ParagemCard key={p.id} p={p} ordem={p.ordem ?? i + 1} onAlternar={() => alternarFeita(p)} readOnly={!isOwn} />
          ))}
        </div>
      )}
    </main>
  )
}

function ParagemCard({ p, ordem, onAlternar, readOnly }: { p: TransportStop; ordem: number; onAlternar: () => void; readOnly?: boolean }) {
  const [nota, setNota] = useState(p.nota_motorista ?? '')
  const [aGuardarNota, setAGuardarNota] = useState(false)
  const [notaMsg, setNotaMsg] = useState<string | null>(null)
  const feita = p.estado === 'concluida'
  const eEntrega = p.tipo === 'entrega'
  const maps = linkMapa(p)
  const janela = janelaTexto(p)
  const equip = equipamentoParagem(p)

  async function guardar() {
    setAGuardarNota(true); setNotaMsg(null)
    const { error } = await guardarNotaMotorista(p.id, nota)
    setAGuardarNota(false)
    setNotaMsg(error ? 'Erro ao guardar' : 'Nota guardada ✓')
  }

  return (
    <div style={{ ...c.card, ...(feita ? c.cardFeita : null) }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={c.ordem}>{ordem}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...c.tipo, background: eEntrega ? '#DBEAFE' : '#FEF3C7', color: eEntrega ? '#1D4ED8' : '#92400E' }}>
              {eEntrega ? '📦 Entrega' : '↩ Recolha'}
            </span>
            {janela && <span style={c.janela}>🕒 {janela}</span>}
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>{p.cliente_nome ?? '(sem cliente)'}</div>
          {equip && <div style={c.linhaMeta}>🔧 {equip}</div>}
          {p.morada && <div style={c.linhaMeta}>📍 {p.morada}</div>}
          {p.notas && <div style={c.notasEvento}>📝 {p.notas}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" style={c.btnMapa}>🧭 Abrir no Maps</a>}
        {readOnly ? (
          <span style={{ ...c.estadoLido, ...(feita ? c.estadoLidoFeita : c.estadoLidoPend) }}>
            {feita ? `✓ Feita${p.concluida_em ? ' · ' + horas(p.concluida_em) : ''}` : '○ Por fazer'}
          </span>
        ) : (
          <button onClick={onAlternar} style={feita ? c.btnDesfazer : c.btnFeita}>
            {feita ? `✓ Feita${p.concluida_em ? ' · ' + horas(p.concluida_em) : ''} — desfazer` : 'Marcar feita'}
          </button>
        )}
      </div>

      {readOnly ? (
        p.nota_motorista ? <div style={c.notaLida}>📝 {p.nota_motorista}</div> : null
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={nota}
            onChange={(e) => { setNota(e.target.value); setNotaMsg(null) }}
            placeholder="Nota do motorista (ex.: cliente ausente)…"
            style={c.notaInput}
          />
          {(nota !== (p.nota_motorista ?? '')) && (
            <button onClick={guardar} disabled={aGuardarNota} style={c.btnNota}>{aGuardarNota ? 'A guardar…' : 'Guardar nota'}</button>
          )}
          {notaMsg && <span style={{ marginLeft: 8, fontSize: 12, color: notaMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--primary)' }}>{notaMsg}</span>}
        </div>
      )}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 560, margin: '0 auto', padding: 14 },
  header: { position: 'sticky', top: 0, background: 'var(--background)', paddingBottom: 10, marginBottom: 8, zIndex: 5, borderBottom: '1px solid var(--border)' },
  topoMotorista: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  driverSelect: { font: 'inherit', fontSize: 17, fontWeight: 800, color: 'var(--foreground)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', maxWidth: '100%' },
  soLeitura: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' },
  estadoLido: { flex: 1, textAlign: 'center', borderRadius: 10, padding: '12px 10px', fontWeight: 700, fontSize: 14 },
  estadoLidoFeita: { background: '#DCFCE7', color: '#166534' },
  estadoLidoPend: { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' },
  notaLida: { marginTop: 10, fontSize: 13, color: 'var(--foreground)', background: 'var(--accent-bg)', borderRadius: 8, padding: '8px 10px' },
  navData: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  navBtn: { fontSize: 26, lineHeight: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: 44, height: 44, cursor: 'pointer' },
  dateInput: { border: 'none', background: 'transparent', font: 'inherit', color: 'var(--muted)', fontSize: 12, textAlign: 'center' },
  resumo: { display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8, fontSize: 13, color: 'var(--muted)', fontWeight: 600 },
  info: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  cardFeita: { opacity: 0.7, background: '#F3F4F6' },
  ordem: { flexShrink: 0, width: 30, height: 30, borderRadius: 999, background: 'var(--primary)', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 },
  tipo: { fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 10px' },
  janela: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  linhaMeta: { fontSize: 14, color: 'var(--foreground)', marginTop: 4 },
  notasEvento: { fontSize: 13, color: 'var(--muted)', marginTop: 6, background: 'var(--accent-bg)', borderRadius: 8, padding: '6px 8px' },
  btnMapa: { flex: 1, textAlign: 'center', textDecoration: 'none', background: '#1D4ED8', color: '#fff', borderRadius: 10, padding: '12px 10px', fontWeight: 700, fontSize: 14 },
  btnFeita: { flex: 1, background: '#00A87A', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 10px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnDesfazer: { flex: 1, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  notaInput: { width: '100%', minHeight: 44, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical', font: 'inherit', boxSizing: 'border-box' },
  btnNota: { marginTop: 6, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
}
