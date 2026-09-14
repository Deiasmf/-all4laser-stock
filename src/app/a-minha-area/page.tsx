'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import TarefasTabela from '@/components/TarefasTabela'
import TarefasLista from '@/components/TarefasLista'
import TarefaDetalheModal from '@/components/TarefaDetalheModal'
import GestorEtiquetasModal from '@/components/GestorEtiquetasModal'
import {
  listarMinhasTarefas, criarTarefa, mudarMeuEstado, atualizarTarefa, notificarConclusaoTarefa,
  listarMeusRecados, marcarRecadoLido, listarRecadosEnviados, listarColaboradores,
  atualizarRecado, listarEstados, estadoInfo, slugConcluido, slugAberto,
  obterPrefNotificacao, guardarPrefNotificacao, listarEtiquetas, obterVista, guardarVista,
  reordenarMinhasTarefas, ordenarTarefas,
  PRIORIDADES, type Prioridade, type MinhaTarefa, type Recado, type Colaborador,
  type EstadoInfo, type Etiqueta, type Vista,
} from '@/lib/minhaArea'

function formatarDataHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function hoje() { return new Date().toISOString().slice(0, 10) }
function daquiA(dias: number) { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }

type FiltroRapido = 'todas' | 'hoje' | 'semana' | 'atrasadas'

export default function MinhaAreaPage() {
  const { perfil, isAdmin } = useAuth()
  const uid = perfil?.id ?? null
  const autor = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }

  const [tarefas, setTarefas] = useState<MinhaTarefa[]>([])
  const [recados, setRecados] = useState<Recado[]>([])
  const [enviados, setEnviados] = useState<Recado[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [estados, setEstados] = useState<EstadoInfo[]>([])
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [vista, setVista] = useState<Vista>('tabela')
  const [pref, setPref] = useState(false)
  const [carregando, setCarregando] = useState(true)

  // Filtros / pesquisa
  const [filtro, setFiltro] = useState<FiltroRapido>('todas')
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string>('')
  const [verConcluidas, setVerConcluidas] = useState(false)
  const [pesquisa, setPesquisa] = useState('')

  // Modais / secções
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [gestorEtiquetas, setGestorEtiquetas] = useState(false)
  const [editarRecado, setEditarRecado] = useState<Recado | null>(null)
  const [verLidos, setVerLidos] = useState(false)
  const [verEnviados, setVerEnviados] = useState(false)

  // Criação rápida
  const [nTitulo, setNTitulo] = useState('')
  const [maisOpcoes, setMaisOpcoes] = useState(false)
  const [nPrio, setNPrio] = useState<Prioridade>('normal')
  const [nPrazo, setNPrazo] = useState('')

  const carregar = useCallback(async () => {
    if (!uid) return
    const [ts, rs, en, cs, es, et, v, p] = await Promise.all([
      listarMinhasTarefas(uid), listarMeusRecados(uid), listarRecadosEnviados(uid),
      listarColaboradores(), listarEstados(), listarEtiquetas(), obterVista(uid), obterPrefNotificacao(uid),
    ])
    setTarefas(ts); setRecados(rs); setEnviados(en); setColaboradores(cs)
    setEstados(es); setEtiquetas(et); setVista(v); setPref(p)
    setCarregando(false)
  }, [uid])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  // Só recarrega as tarefas (mais leve; usado após edições inline).
  const recarregarTarefas = useCallback(async () => {
    if (uid) setTarefas(await listarMinhasTarefas(uid))
  }, [uid])

  const eConcluida = useCallback((t: MinhaTarefa) => estadoInfo(t.meuEstado, estados).is_concluido, [estados])

  // Lista filtrada + pesquisada
  const filtradas = useMemo(() => {
    const h = hoje(); const fimSemana = daquiA(7); const q = pesquisa.trim().toLowerCase()
    return tarefas.filter((t) => {
      const feita = eConcluida(t)
      if (!verConcluidas && feita) return false
      if (filtro === 'hoje' && t.data_limite !== h) return false
      if (filtro === 'semana' && !(t.data_limite && t.data_limite >= h && t.data_limite <= fimSemana && !feita)) return false
      if (filtro === 'atrasadas' && !(t.data_limite && t.data_limite < h && !feita)) return false
      if (filtroEtiqueta && !t.etiquetas.some((e) => e.id === filtroEtiqueta)) return false
      if (q && !(t.titulo.toLowerCase().includes(q) || (t.descricao ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [tarefas, verConcluidas, filtro, filtroEtiqueta, pesquisa, eConcluida])

  // Vista tabela → ordenação vem da própria tabela. Vista lista → ordem manual.
  const paraLista = useMemo(() => {
    const base = ordenarTarefas(filtradas) as MinhaTarefa[]
    return [...base].sort((a, b) => {
      const oa = a.ordemManual ?? Number.MAX_SAFE_INTEGER
      const ob = b.ordemManual ?? Number.MAX_SAFE_INTEGER
      return oa - ob
    })
  }, [filtradas])

  const detalhe = detalheId ? tarefas.find((t) => t.id === detalheId) ?? null : null

  // ── Handlers das tarefas ────────────────────────────────────────────────────
  async function onEstado(t: MinhaTarefa, estado: string, aguarda: string | null) {
    const concluido = estadoInfo(estado, estados).is_concluido
    await mudarMeuEstado(t.assigneeId, estado, concluido, aguarda)
    if (concluido) await notificarConclusaoTarefa(t.id)
    await recarregarTarefas()
  }
  async function onPatch(t: MinhaTarefa, patch: { prioridade?: Prioridade; data_limite?: string | null }) {
    await atualizarTarefa(t.id, patch)
    await recarregarTarefas()
  }
  async function onToggleConcluir(t: MinhaTarefa) {
    if (eConcluida(t)) { await mudarMeuEstado(t.assigneeId, slugAberto(estados), false) }
    else { await mudarMeuEstado(t.assigneeId, slugConcluido(estados), true); await notificarConclusaoTarefa(t.id) }
    await recarregarTarefas()
  }
  async function onReordenar(ids: string[]) {
    // Otimista: aplica a nova ordem já; depois persiste.
    const pos = new Map(ids.map((id, i) => [id, i]))
    setTarefas((prev) => prev.map((t) => pos.has(t.assigneeId) ? { ...t, ordemManual: pos.get(t.assigneeId)! } : t))
    await reordenarMinhasTarefas(ids)
  }

  async function adicionarTarefa() {
    if (!uid || !nTitulo.trim()) return
    await criarTarefa(
      { titulo: nTitulo.trim(), descricao: null, prioridade: nPrio, data_limite: nPrazo || null, assignees: [uid] },
      uid,
    )
    setNTitulo(''); setNPrio('normal'); setNPrazo(''); setMaisOpcoes(false)
    await recarregarTarefas()
  }

  async function trocarVista(v: Vista) { setVista(v); if (uid) await guardarVista(uid, v) }
  async function lerRecado(r: Recado) { await marcarRecadoLido(r.id); await carregar() }
  async function togglePref() { const novo = !pref; setPref(novo); if (uid) await guardarPrefNotificacao(uid, novo) }

  const naoLidos = recados.filter((r) => !r.lida)
  const lidos = recados.filter((r) => r.lida)
  const nomeDe = (id: string | null) => {
    if (!id) return '—'
    const co = colaboradores.find((x) => x.id === id)
    return co?.nome ?? co?.email ?? '—'
  }
  const numConcluidas = tarefas.filter(eConcluida).length

  if (!uid) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>📌 A Minha Área</h1>
          <p style={c.sub}>As tuas tarefas e recados. Só tu vês esta área.</p>
        </div>
        <div style={c.topoAcoes}>
          <Link href="/a-minha-area/equipa" style={c.btnSecLink}>👥 Equipa</Link>
          <Link href="/a-minha-area/notion" style={c.btnSecLink}>🔗 Notion</Link>
          {isAdmin && <Link href="/a-minha-area/atribuir" style={c.btnPrimario}>+ Atribuir tarefa/recado</Link>}
        </div>
      </div>

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          {naoLidos.length > 0 && (
            <section style={c.secao}>
              <h2 style={c.h2}>✉️ Recados novos ({naoLidos.length})</h2>
              <div style={c.lista}>
                {naoLidos.map((r) => (
                  <div key={r.id} style={{ ...c.recado, ...(r.urgente ? c.recadoUrgente : {}) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.urgente && <span style={c.tagUrgente}>URGENTE</span>}
                      <div style={c.recadoMsg}>{r.mensagem}</div>
                      <div style={c.metaMuted}>{formatarDataHora(r.created_at)}</div>
                    </div>
                    <button style={c.btnSec} onClick={() => lerRecado(r)}>Marcar como lido</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Criação rápida — sempre no topo, fricção zero */}
          <div style={c.quickAdd}>
            <span style={c.quickPlus}>+</span>
            <input
              value={nTitulo} onChange={(e) => setNTitulo(e.target.value)}
              placeholder="Adicionar tarefa (escreve e Enter)…" style={c.quickInput}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionarTarefa() }}
            />
            <button style={c.quickMais} onClick={() => setMaisOpcoes((v) => !v)} title="Mais opções">⚙</button>
            <button style={c.btnPrimario} disabled={!nTitulo.trim()} onClick={adicionarTarefa}>Adicionar</button>
          </div>
          {maisOpcoes && (
            <div style={c.quickOpcoes}>
              <label style={c.campoN}><span style={c.rotN}>Prioridade</span>
                <select value={nPrio} onChange={(e) => setNPrio(e.target.value as Prioridade)} style={c.inputN}>
                  {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select>
              </label>
              <label style={c.campoN}><span style={c.rotN}>Data limite</span>
                <input type="date" value={nPrazo} onChange={(e) => setNPrazo(e.target.value)} style={c.inputN} />
              </label>
            </div>
          )}

          {/* Barra de vista + filtros + pesquisa */}
          <div style={c.barra}>
            <div style={c.vistaToggle}>
              <button style={{ ...c.vistaBtn, ...(vista === 'tabela' ? c.vistaAtiva : {}) }} onClick={() => trocarVista('tabela')}>▦ Tabela</button>
              <button style={{ ...c.vistaBtn, ...(vista === 'lista' ? c.vistaAtiva : {}) }} onClick={() => trocarVista('lista')}>☰ Lista</button>
            </div>
            <div style={c.filtros}>
              {([['todas', 'Todas'], ['hoje', 'Hoje'], ['semana', 'Esta semana'], ['atrasadas', 'Atrasadas']] as [FiltroRapido, string][]).map(([v, l]) => (
                <button key={v} style={{ ...c.chipFiltro, ...(filtro === v ? c.chipFiltroAtivo : {}) }} onClick={() => setFiltro(v)}>{l}</button>
              ))}
              <select value={filtroEtiqueta} onChange={(e) => setFiltroEtiqueta(e.target.value)} style={c.selEtiqueta}>
                <option value="">Todas as etiquetas</option>
                {etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <button style={{ ...c.chipFiltro, ...(verConcluidas ? c.chipFiltroAtivo : {}) }} onClick={() => setVerConcluidas((v) => !v)}>
                {verConcluidas ? '✓ ' : ''}Concluídas ({numConcluidas})
              </button>
            </div>
            <input value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="🔍 Pesquisar…" style={c.pesquisa} />
            <button style={c.btnSec} onClick={() => setGestorEtiquetas(true)}>🏷 Etiquetas</button>
          </div>

          {/* Vista */}
          <section style={c.secao}>
            {vista === 'tabela' ? (
              <TarefasTabela tarefas={filtradas} estados={estados} onAbrir={(t) => setDetalheId(t.id)} onEstado={onEstado} onPatch={onPatch} />
            ) : (
              <TarefasLista tarefas={paraLista} estados={estados} onAbrir={(t) => setDetalheId(t.id)} onToggleConcluir={onToggleConcluir} onReordenar={onReordenar} />
            )}
          </section>

          {lidos.length > 0 && (
            <section style={c.secao}>
              <button style={c.colapso} onClick={() => setVerLidos((v) => !v)}>
                {verLidos ? '▼' : '▸'} Recados lidos ({lidos.length})
              </button>
              {verLidos && (
                <div style={c.lista}>
                  {lidos.map((r) => (
                    <div key={r.id} style={{ ...c.recado, opacity: 0.75 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={c.recadoMsg}>{r.mensagem}</div>
                        <div style={c.metaMuted}>{formatarDataHora(r.created_at)} · lido {formatarDataHora(r.lida_em)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {enviados.length > 0 && (
            <section style={c.secao}>
              <button style={c.colapso} onClick={() => setVerEnviados((v) => !v)}>
                {verEnviados ? '▼' : '▸'} Recados que enviei ({enviados.length})
              </button>
              {verEnviados && (
                <div style={c.lista}>
                  {enviados.map((r) => (
                    <div key={r.id} style={{ ...c.recado, ...(r.urgente ? c.recadoUrgente : {}) }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {r.urgente && <span style={c.tagUrgente}>URGENTE</span>}
                        <div style={c.recadoMsg}>{r.mensagem}</div>
                        <div style={c.metaMuted}>
                          Para {nomeDe(r.to_user)} · {formatarDataHora(r.created_at)}
                          {' · '}
                          {r.lida
                            ? <span style={{ color: '#065F46', fontWeight: 600 }}>✓ lido {formatarDataHora(r.lida_em)}</span>
                            : <span style={{ color: '#B45309', fontWeight: 600 }}>● por ler</span>}
                        </div>
                      </div>
                      <button style={c.btnSecMini} onClick={() => setEditarRecado(r)}>✏️ Editar</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section style={c.secao}>
            <h2 style={c.h2}>🔔 Notificações</h2>
            <label style={c.prefLinha}>
              <input type="checkbox" checked={pref} onChange={togglePref} />
              <span>Avisar-me por email quando receber um <strong>recado urgente</strong>.</span>
            </label>
            <p style={c.metaMuted}>O email seria enviado para {perfil?.email ?? 'o teu email'}. Desligado por predefinição.</p>
          </section>
        </>
      )}

      {detalhe && (
        <TarefaDetalheModal
          tarefa={detalhe} estados={estados} etiquetasDisponiveis={etiquetas}
          autor={autor} uid={uid}
          onMudou={recarregarTarefas}
          onFechar={() => setDetalheId(null)}
        />
      )}
      {gestorEtiquetas && <GestorEtiquetasModal onFechar={() => { setGestorEtiquetas(false); carregar() }} />}
      {editarRecado && (
        <EditarRecadoModal recado={editarRecado} onFechar={() => setEditarRecado(null)}
          onGuardado={async () => { setEditarRecado(null); await carregar() }} />
      )}
    </main>
  )
}

// ---------------------------------------------------------- EDITAR RECADO
function EditarRecadoModal({
  recado, onFechar, onGuardado,
}: {
  recado: Recado
  onFechar: () => void
  onGuardado: () => void | Promise<void>
}) {
  const [mensagem, setMensagem] = useState(recado.mensagem)
  const [urgente, setUrgente] = useState(recado.urgente)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    if (!mensagem.trim()) { setErro('A mensagem não pode ficar vazia.'); return }
    setErro(null)
    setAGuardar(true)
    const { error } = await atualizarRecado(recado.id, { mensagem: mensagem.trim(), urgente })
    setAGuardar(false)
    if (error) { setErro('Erro a guardar: ' + error.message); return }
    await onGuardado()
  }

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modalEditar} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}>
          <h2 style={c.modalTitulo}>Editar recado</h2>
          <button onClick={onFechar} style={c.modalFechar} aria-label="Fechar">✕</button>
        </div>
        {erro && <div style={c.modalErro}>{erro}</div>}
        <label style={c.modalLabel}>Mensagem</label>
        <textarea style={{ ...c.modalInput, minHeight: 90, resize: 'vertical' }} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        <label style={c.modalCheck}>
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
          Marcar como <strong>urgente</strong>
        </label>
        <div style={c.modalAcoes}>
          <button onClick={onFechar} style={c.btnSec}>Cancelar</button>
          <button onClick={guardar} disabled={aGuardar} style={c.btnPrimario}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '0 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  secao: { marginBottom: 22 },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--foreground)' },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  metaMuted: { color: 'var(--muted)', fontSize: 12.5, marginTop: 2 },
  recado: { display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  recadoUrgente: { borderColor: '#FCA5A5', background: '#FEF2F2' },
  recadoMsg: { fontSize: 14.5, whiteSpace: 'pre-wrap' },
  tagUrgente: { display: 'inline-block', background: '#B91C1C', color: '#fff', borderRadius: 999, fontSize: 10.5, fontWeight: 800, padding: '2px 8px', marginBottom: 4, letterSpacing: 0.5 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  topoAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btnSecLink: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  colapso: { background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: '4px 0', textAlign: 'left' },
  prefLinha: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },

  // Criação rápida
  quickAdd: { display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', marginBottom: 8 },
  quickPlus: { fontSize: 20, color: 'var(--muted)', fontWeight: 700, lineHeight: 1 },
  quickInput: { flex: 1, border: 'none', outline: 'none', font: 'inherit', fontSize: 15, background: 'transparent' },
  quickMais: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 14 },
  quickOpcoes: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 12, padding: 12 },
  campoN: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotN: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  inputN: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },

  // Barra de vista + filtros
  barra: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  vistaToggle: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' },
  vistaBtn: { background: '#fff', border: 'none', padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  vistaAtiva: { background: 'var(--primary)', color: '#fff' },
  filtros: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  chipFiltro: { background: '#fff', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)' },
  chipFiltroAtivo: { background: '#EEF2FF', borderColor: '#C7D2FE', color: '#3730A3' },
  selEtiqueta: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', font: 'inherit', fontSize: 12.5, cursor: 'pointer', background: '#fff' },
  pesquisa: { flex: 1, minWidth: 140, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', font: 'inherit', fontSize: 13.5, boxSizing: 'border-box' },

  // Modal de editar recado
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modalEditar: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 480, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  modalFechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  modalErro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, marginBottom: 8 },
  modalLabel: { fontWeight: 600, fontSize: 13.5, marginTop: 8, marginBottom: 4, display: 'block' },
  modalInput: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  modalCheck: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
}
