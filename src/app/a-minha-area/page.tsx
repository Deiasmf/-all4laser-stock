'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import ComentariosTarefa from '@/components/ComentariosTarefa'
import EditarTarefaModal from '@/components/EditarTarefaModal'
import {
  listarMinhasTarefas, criarTarefa, mudarMeuEstado, ordenarTarefas, prioridadeInfo,
  listarMeusRecados, marcarRecadoLido, listarRecadosEnviados, listarColaboradores,
  atualizarRecado,
  obterPrefNotificacao, guardarPrefNotificacao,
  PRIORIDADES, type Prioridade, type MinhaTarefa, type Recado, type Colaborador,
} from '@/lib/minhaArea'

function formatarData(d: string | null): string {
  if (!d) return ''
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}
function formatarDataHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function hoje() { return new Date().toISOString().slice(0, 10) }

export default function MinhaAreaPage() {
  const { perfil, isAdmin } = useAuth()
  const uid = perfil?.id ?? null
  const autor = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
  const [tarefas, setTarefas] = useState<MinhaTarefa[]>([])
  const [recados, setRecados] = useState<Recado[]>([])
  const [enviados, setEnviados] = useState<Recado[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [pref, setPref] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [verConcluidas, setVerConcluidas] = useState(false)
  const [verLidos, setVerLidos] = useState(false)
  const [verEnviados, setVerEnviados] = useState(false)
  const [respostaAberta, setRespostaAberta] = useState<string | null>(null)
  const [editarTarefa, setEditarTarefa] = useState<MinhaTarefa | null>(null)
  const [editarRecado, setEditarRecado] = useState<Recado | null>(null)
  // Nova tarefa pessoal (o próprio adiciona-se tarefas).
  const [novaAberta, setNovaAberta] = useState(false)
  const [nTitulo, setNTitulo] = useState('')
  const [nDesc, setNDesc] = useState('')
  const [nPrio, setNPrio] = useState<Prioridade>('normal')
  const [nPrazo, setNPrazo] = useState('')

  const carregar = useCallback(async () => {
    if (!uid) return
    const [ts, rs, en, cs, p] = await Promise.all([
      listarMinhasTarefas(uid), listarMeusRecados(uid), listarRecadosEnviados(uid),
      listarColaboradores(), obterPrefNotificacao(uid),
    ])
    setTarefas(ts); setRecados(rs); setEnviados(en); setColaboradores(cs); setPref(p); setCarregando(false)
  }, [uid])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const ativas = ordenarTarefas(tarefas.filter((t) => t.meuEstado !== 'concluida'))
  const concluidas = tarefas.filter((t) => t.meuEstado === 'concluida')
    .sort((a, b) => (b.meuConcluidaEm ?? '').localeCompare(a.meuConcluidaEm ?? ''))
  const naoLidos = recados.filter((r) => !r.lida)
  const lidos = recados.filter((r) => r.lida)
  const nomeDe = (id: string | null) => {
    if (!id) return '—'
    const co = colaboradores.find((x) => x.id === id)
    return co?.nome ?? co?.email ?? '—'
  }

  async function concluir(t: MinhaTarefa) { await mudarMeuEstado(t.assigneeId, 'concluida'); await carregar() }
  async function reabrir(t: MinhaTarefa) { await mudarMeuEstado(t.assigneeId, 'pendente'); await carregar() }
  async function iniciar(t: MinhaTarefa) { await mudarMeuEstado(t.assigneeId, 'em_curso'); await carregar() }
  async function lerRecado(r: Recado) { await marcarRecadoLido(r.id); await carregar() }
  async function togglePref() { const novo = !pref; setPref(novo); if (uid) await guardarPrefNotificacao(uid, novo) }
  function toggleResposta(id: string) { setRespostaAberta((v) => (v === id ? null : id)) }

  async function adicionarTarefa() {
    if (!uid || !nTitulo.trim()) return
    await criarTarefa(
      { titulo: nTitulo.trim(), descricao: nDesc.trim() || null, prioridade: nPrio, data_limite: nPrazo || null, assignees: [uid] },
      uid,
    )
    setNTitulo(''); setNDesc(''); setNPrio('normal'); setNPrazo(''); setNovaAberta(false)
    await carregar()
  }

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

          <section style={c.secao}>
            <div style={c.h2Linha}>
              <h2 style={c.h2}>✅ Tarefas pendentes ({ativas.length})</h2>
              <button style={c.btnSec} onClick={() => setNovaAberta((v) => !v)}>{novaAberta ? 'Cancelar' : '+ Nova tarefa'}</button>
            </div>
            {novaAberta && (
              <div style={c.novaForm}>
                <input value={nTitulo} onChange={(e) => setNTitulo(e.target.value)} placeholder="O que precisas de fazer" style={c.inputN} />
                <textarea value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="Detalhes (opcional)" style={{ ...c.inputN, minHeight: 48, resize: 'vertical' }} />
                <div style={c.grelhaN}>
                  <label style={c.campoN}><span style={c.rotN}>Prioridade</span>
                    <select value={nPrio} onChange={(e) => setNPrio(e.target.value as Prioridade)} style={c.inputN}>
                      {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                    </select>
                  </label>
                  <label style={c.campoN}><span style={c.rotN}>Data limite <span style={c.opcN}>(opcional)</span></span>
                    <input type="date" value={nPrazo} onChange={(e) => setNPrazo(e.target.value)} style={c.inputN} />
                  </label>
                </div>
                <button style={c.btnPrimario} disabled={!nTitulo.trim()} onClick={adicionarTarefa}>Adicionar tarefa</button>
              </div>
            )}
            {ativas.length === 0 ? <p style={c.muted}>Sem tarefas pendentes. 🎉</p> : (
              <div style={c.lista}>
                {ativas.map((t) => {
                  const pi = prioridadeInfo(t.prioridade)
                  const atrasada = !!t.data_limite && t.data_limite < hoje()
                  return (
                    <div key={t.id} style={c.tarefaCard}>
                      <div style={c.tarefa}>
                        <button style={c.check} onClick={() => concluir(t)} title="Concluir" aria-label="Concluir tarefa">○</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={c.tarefaTitulo}>{t.titulo}</div>
                          {t.descricao && <div style={c.metaMuted}>{t.descricao}</div>}
                          <div style={c.tarefaMeta}>
                            <span style={{ ...c.pill, color: pi.cor, background: pi.bg }}>{pi.label}</span>
                            {t.meuEstado === 'em_curso' && <span style={c.pillCurso}>Em curso</span>}
                            {t.data_limite && <span style={{ ...c.prazo, ...(atrasada ? c.prazoAtraso : {}) }}>{atrasada ? '⚠ ' : ''}{formatarData(t.data_limite)}</span>}
                          </div>
                        </div>
                        <div style={c.acoes}>
                          {t.meuEstado !== 'em_curso' && <button style={c.btnSecMini} onClick={() => iniciar(t)}>Iniciar</button>}
                          <button style={c.btnSecMini} onClick={() => setEditarTarefa(t)}>✏️ Editar</button>
                          <button style={c.btnSecMini} onClick={() => toggleResposta(t.id)}>💬 Responder</button>
                        </div>
                      </div>
                      {respostaAberta === t.id && <ComentariosTarefa taskId={t.id} autor={autor} />}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section style={c.secao}>
            <button style={c.colapso} onClick={() => setVerConcluidas((v) => !v)}>
              {verConcluidas ? '▼' : '▸'} Histórico de tarefas concluídas ({concluidas.length})
            </button>
            {verConcluidas && (
              concluidas.length === 0 ? <p style={c.muted}>Ainda nada concluído.</p> : (
                <div style={c.lista}>
                  {concluidas.map((t) => (
                    <div key={t.id} style={{ ...c.tarefa, opacity: 0.7 }}>
                      <span style={c.checkFeito}>✓</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...c.tarefaTitulo, textDecoration: 'line-through' }}>{t.titulo}</div>
                        <div style={c.metaMuted}>Concluída {formatarDataHora(t.meuConcluidaEm)}</div>
                      </div>
                      <button style={c.btnSecMini} onClick={() => reabrir(t)}>Reabrir</button>
                    </div>
                  ))}
                </div>
              )
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

      {editarTarefa && (
        <EditarTarefaModal
          tarefa={{ id: editarTarefa.id, titulo: editarTarefa.titulo, descricao: editarTarefa.descricao, prioridade: editarTarefa.prioridade, data_limite: editarTarefa.data_limite }}
          onFechar={() => setEditarTarefa(null)}
          onGuardado={async () => { setEditarTarefa(null); await carregar() }}
        />
      )}
      {editarRecado && (
        <EditarRecadoModal
          recado={editarRecado}
          onFechar={() => setEditarRecado(null)}
          onGuardado={async () => { setEditarRecado(null); await carregar() }}
        />
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
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
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
  tarefaCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  tarefa: { display: 'flex', gap: 12, alignItems: 'center' },
  check: { width: 26, height: 26, borderRadius: 999, border: '2px solid var(--border)', background: '#fff', color: 'transparent', cursor: 'pointer', flexShrink: 0, fontSize: 14, lineHeight: 1 },
  checkFeito: { width: 26, height: 26, borderRadius: 999, background: '#065F46', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 },
  tarefaTitulo: { fontWeight: 600, fontSize: 14.5 },
  tarefaMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700 },
  pillCurso: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7' },
  prazo: { fontSize: 12, color: 'var(--muted)' },
  prazoAtraso: { color: '#B91C1C', fontWeight: 700 },
  acoes: { display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  topoAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btnSecLink: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  colapso: { background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: '4px 0', textAlign: 'left' },
  prefLinha: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  h2Linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 },
  novaForm: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 },
  inputN: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  grelhaN: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 },
  campoN: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotN: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  opcN: { color: 'var(--muted)', fontWeight: 400 },

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
