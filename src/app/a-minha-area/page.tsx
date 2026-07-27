'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarMinhasTarefas, mudarEstadoTarefa, ordenarTarefas, prioridadeInfo,
  listarMeusRecados, marcarRecadoLido,
  obterPrefNotificacao, guardarPrefNotificacao,
  type Tarefa, type Recado,
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
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [recados, setRecados] = useState<Recado[]>([])
  const [pref, setPref] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [verConcluidas, setVerConcluidas] = useState(false)
  const [verLidos, setVerLidos] = useState(false)

  const carregar = useCallback(async () => {
    if (!uid) return
    const [ts, rs, p] = await Promise.all([
      listarMinhasTarefas(uid), listarMeusRecados(uid), obterPrefNotificacao(uid),
    ])
    setTarefas(ts); setRecados(rs); setPref(p); setCarregando(false)
  }, [uid])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const ativas = ordenarTarefas(tarefas.filter((t) => t.estado !== 'concluida'))
  const concluidas = tarefas.filter((t) => t.estado === 'concluida')
    .sort((a, b) => (b.concluida_em ?? '').localeCompare(a.concluida_em ?? ''))
  const naoLidos = recados.filter((r) => !r.lida)
  const lidos = recados.filter((r) => r.lida)

  async function concluir(t: Tarefa) { await mudarEstadoTarefa(t.id, 'concluida'); await carregar() }
  async function reabrir(t: Tarefa) { await mudarEstadoTarefa(t.id, 'pendente'); await carregar() }
  async function iniciar(t: Tarefa) { await mudarEstadoTarefa(t.id, 'em_curso'); await carregar() }
  async function lerRecado(r: Recado) { await marcarRecadoLido(r.id); await carregar() }
  async function togglePref() { const novo = !pref; setPref(novo); if (uid) await guardarPrefNotificacao(uid, novo) }

  if (!uid) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>📌 A Minha Área</h1>
          <p style={c.sub}>As tuas tarefas e recados. Só tu vês esta área.</p>
        </div>
        {isAdmin && <Link href="/a-minha-area/atribuir" style={c.btnPrimario}>+ Atribuir tarefa/recado</Link>}
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
            <h2 style={c.h2}>✅ Tarefas pendentes ({ativas.length})</h2>
            {ativas.length === 0 ? <p style={c.muted}>Sem tarefas pendentes. 🎉</p> : (
              <div style={c.lista}>
                {ativas.map((t) => {
                  const pi = prioridadeInfo(t.prioridade)
                  const atrasada = !!t.data_limite && t.data_limite < hoje()
                  return (
                    <div key={t.id} style={c.tarefa}>
                      <button style={c.check} onClick={() => concluir(t)} title="Concluir" aria-label="Concluir tarefa">○</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={c.tarefaTitulo}>{t.titulo}</div>
                        {t.descricao && <div style={c.metaMuted}>{t.descricao}</div>}
                        <div style={c.tarefaMeta}>
                          <span style={{ ...c.pill, color: pi.cor, background: pi.bg }}>{pi.label}</span>
                          {t.estado === 'em_curso' && <span style={c.pillCurso}>Em curso</span>}
                          {t.data_limite && <span style={{ ...c.prazo, ...(atrasada ? c.prazoAtraso : {}) }}>{atrasada ? '⚠ ' : ''}{formatarData(t.data_limite)}</span>}
                        </div>
                      </div>
                      {t.estado !== 'em_curso' && <button style={c.btnSecMini} onClick={() => iniciar(t)}>Iniciar</button>}
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
                        <div style={c.metaMuted}>Concluída {formatarDataHora(t.concluida_em)}</div>
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
    </main>
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
  // recados
  recado: { display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  recadoUrgente: { borderColor: '#FCA5A5', background: '#FEF2F2' },
  recadoMsg: { fontSize: 14.5, whiteSpace: 'pre-wrap' },
  tagUrgente: { display: 'inline-block', background: '#B91C1C', color: '#fff', borderRadius: 999, fontSize: 10.5, fontWeight: 800, padding: '2px 8px', marginBottom: 4, letterSpacing: 0.5 },
  // tarefas
  tarefa: { display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  check: { width: 26, height: 26, borderRadius: 999, border: '2px solid var(--border)', background: '#fff', color: 'transparent', cursor: 'pointer', flexShrink: 0, fontSize: 14, lineHeight: 1 },
  checkFeito: { width: 26, height: 26, borderRadius: 999, background: '#065F46', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 },
  tarefaTitulo: { fontWeight: 600, fontSize: 14.5 },
  tarefaMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700 },
  pillCurso: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7' },
  prazo: { fontSize: 12, color: 'var(--muted)' },
  prazoAtraso: { color: '#B91C1C', fontWeight: 700 },
  // botões
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  colapso: { background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: '4px 0', textAlign: 'left' },
  prefLinha: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
}
