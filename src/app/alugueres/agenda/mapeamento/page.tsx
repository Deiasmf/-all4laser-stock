'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarCalendariosMapa, equipamentosPorModelo, atualizarCalendarioMapa,
  criarCalendarioMapa, eliminarCalendarioMapa, zonaLabel, ZONAS_TRANSPORTE,
  type TransportCalendar, type EquipamentoOpcao, type ZonaTransporte,
} from '@/lib/transportes'

// Ecrã de mapeamento (Fase A): tabela gerível calendário Google → zona →
// modelo → equipamento (serial). Permite acrescentar calendários novos sem código.

export default function MapeamentoCalendariosPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [lista, setLista] = useState<TransportCalendar[]>([])
  const [opcoes, setOpcoes] = useState<Record<string, EquipamentoOpcao[]>>({})
  const [aCarregar, setACarregar] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)

  const carregar = useCallback(async () => {
    setACarregar(true)
    const cals = await listarCalendariosMapa()
    setLista(cals)
    // Pré-carrega as opções de equipamento por modelo (uma vez por modelo).
    const modelos = Array.from(new Set(cals.map((c) => c.modelo).filter(Boolean))) as string[]
    const mapa: Record<string, EquipamentoOpcao[]> = {}
    await Promise.all(modelos.map(async (m) => { mapa[m] = await equipamentosPorModelo(m) }))
    setOpcoes(mapa)
    setACarregar(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  async function ligarEquipamento(cal: TransportCalendar, equipamentoId: string) {
    const { error } = await atualizarCalendarioMapa(cal.id, { equipamento_id: equipamentoId || null })
    if (error) { setToast('Erro: ' + error.message); return }
    setToast('Equipamento ligado.'); carregar()
  }
  async function alternarAtivo(cal: TransportCalendar) {
    const { error } = await atualizarCalendarioMapa(cal.id, { ativo: !cal.ativo })
    if (error) { setToast('Erro: ' + error.message); return }
    carregar()
  }
  async function apagar(cal: TransportCalendar) {
    if (!window.confirm(`Remover o calendário "${cal.nome}" do mapeamento? (não apaga nada no Google)`)) return
    const { error } = await eliminarCalendarioMapa(cal.id)
    if (error) { setToast('Erro: ' + error.message); return }
    setToast('Calendário removido.'); carregar()
  }

  const porZona = useMemo(() => {
    const g: Record<string, TransportCalendar[]> = { lisboa: [], norte: [], algarve: [] }
    for (const c of lista) (g[c.zona] ??= []).push(c)
    return g
  }, [lista])

  const porMapear = lista.filter((c) => !c.equipamento_id).length

  if (perfilCarregado && !isAdministrativo) {
    return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>
  }

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda" style={c.voltar}>← Agenda</Link>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Mapeamento de calendários</h1>
          <p style={c.sub}>Cada calendário Google = um equipamento da frota. Liga cada um ao serial (dropdown filtrado pelo modelo). <Link href="/alugueres/agenda/validar-calendarios" style={c.link}>Validar acesso ↗</Link></p>
        </div>
        <button style={c.btnPrim} onClick={() => setNovoAberto((v) => !v)}>{novoAberto ? 'Fechar' : '+ Novo calendário'}</button>
      </div>

      {porMapear > 0 && <p style={c.aviso}>⚠ {porMapear} calendário(s) ainda sem equipamento (serial) atribuído.</p>}

      {novoAberto && <NovoCalendario onCriado={() => { setNovoAberto(false); setToast('Calendário adicionado.'); carregar() }} onErro={(m) => setToast(m)} />}

      {aCarregar ? <p style={c.muted}>A carregar…</p> : (
        ZONAS_TRANSPORTE.map((z) => (
          <section key={z.valor} style={c.seccao}>
            <h2 style={c.zonaTit}>{z.label} <span style={c.zonaN}>({(porZona[z.valor] ?? []).length})</span></h2>
            <div style={c.wrap}>
              <table style={c.tabela}>
                <thead><tr>
                  <th style={c.th}>Calendário</th><th style={c.th}>Modelo</th><th style={c.th}>Equipamento (serial)</th><th style={c.th}>Ativo</th><th style={c.th}></th>
                </tr></thead>
                <tbody>
                  {(porZona[z.valor] ?? []).map((cal) => {
                    const ops = cal.modelo ? (opcoes[cal.modelo] ?? []) : []
                    return (
                      <tr key={cal.id} style={c.tr}>
                        <td style={c.td}>{cal.nome}</td>
                        <td style={c.td}>{cal.modelo ?? '—'}</td>
                        <td style={c.td}>
                          <select style={c.select} value={cal.equipamento_id ?? ''} onChange={(e) => ligarEquipamento(cal, e.target.value)}>
                            <option value="">— escolher serial —</option>
                            {ops.map((o) => <option key={o.id} value={o.id}>{o.serial_number ?? o.id.slice(0, 8)} · {o.status}{o.destino ? ` · ${o.destino}` : ''}</option>)}
                          </select>
                          {cal.equipamento?.serial_number && <div style={c.serialAtual}>ligado: {cal.equipamento.serial_number}</div>}
                          {cal.modelo && ops.length === 0 && <div style={c.avisoMini}>sem unidades em aluguer para “{cal.modelo}”</div>}
                        </td>
                        <td style={c.td}>
                          <button style={cal.ativo ? c.pillOn : c.pillOff} onClick={() => alternarAtivo(cal)}>{cal.ativo ? 'Ativo' : 'Inativo'}</button>
                        </td>
                        <td style={c.td}><button style={c.btnDel} title="Remover do mapeamento" onClick={() => apagar(cal)}>🗑️</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

function NovoCalendario({ onCriado, onErro }: { onCriado: () => void; onErro: (m: string) => void }) {
  const [googleId, setGoogleId] = useState('')
  const [nome, setNome] = useState('')
  const [zona, setZona] = useState<ZonaTransporte>('lisboa')
  const [modelo, setModelo] = useState('')
  const [aGravar, setAGravar] = useState(false)

  async function guardar() {
    if (!googleId.trim() || !nome.trim()) { onErro('Preenche o ID do calendário e o nome.'); return }
    setAGravar(true)
    const { error } = await criarCalendarioMapa({ google_calendar_id: googleId, nome, zona, modelo: modelo || null })
    setAGravar(false)
    if (error) { onErro('Erro: ' + error.message); return }
    onCriado()
  }

  return (
    <div style={c.novoBox}>
      <div style={c.novoGrid}>
        <label style={c.campo}><span style={c.rot}>ID do calendário Google</span>
          <input style={c.input} value={googleId} placeholder="…@group.calendar.google.com" onChange={(e) => setGoogleId(e.target.value)} /></label>
        <label style={c.campo}><span style={c.rot}>Nome</span>
          <input style={c.input} value={nome} placeholder="Ex.: Alex P - Gpro" onChange={(e) => setNome(e.target.value)} /></label>
        <label style={c.campo}><span style={c.rot}>Zona</span>
          <select style={c.input} value={zona} onChange={(e) => setZona(e.target.value as ZonaTransporte)}>
            {ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}
          </select></label>
        <label style={c.campo}><span style={c.rot}>Modelo</span>
          <input style={c.input} value={modelo} placeholder="Ex.: Gentle Pro" onChange={(e) => setModelo(e.target.value)} /></label>
      </div>
      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <button style={c.btnPrim} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Adicionar'}</button>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4, maxWidth: 640, lineHeight: 1.5 },
  link: { color: '#2563EB', textDecoration: 'none' },
  aviso: { background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  seccao: { marginBottom: 18 },
  zonaTit: { fontSize: 16, fontWeight: 700, margin: '0 0 8px' },
  zonaN: { color: 'var(--muted)', fontWeight: 400, fontSize: 13 },
  wrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px', verticalAlign: 'top' },
  select: { padding: '7px 8px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff', minWidth: 240, maxWidth: 360 },
  serialAtual: { fontSize: 11, color: '#065F46', marginTop: 3 },
  avisoMini: { fontSize: 11, color: '#B45309', marginTop: 3 },
  pillOn: { padding: '4px 10px', borderRadius: 999, border: '1px solid #065F46', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  pillOff: { padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#6B7280', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  btnDel: { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, padding: '4px 8px' },
  btnPrim: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  novoBox: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 14, background: '#F9FAFB' },
  novoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
