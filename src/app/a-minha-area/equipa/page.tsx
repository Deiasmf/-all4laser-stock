'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import ComentariosTarefa from '@/components/ComentariosTarefa'
import HistoricoTarefa from '@/components/HistoricoTarefa'
import AnexosTarefa from '@/components/AnexosTarefa'
import {
  listarColaboradores, listarTodasTarefas, resumoPorPessoa,
  prioridadeInfo, listarEstados, estadoInfo, SLUG_AGUARDA,
  type Colaborador, type TarefaComAssignees, type EstadoInfo,
} from '@/lib/minhaArea'

function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}
function hoje() { return new Date().toISOString().slice(0, 10) }

export default function EquipaPage() {
  const { perfil, perfilCarregado } = useAuth()
  const autor = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [todas, setTodas] = useState<TarefaComAssignees[]>([])
  const [estados, setEstados] = useState<EstadoInfo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPessoa, setFiltroPessoa] = useState<string>('')   // '' = todas
  const [verConcluidas, setVerConcluidas] = useState(false)
  const [comentariosAberto, setComentariosAberto] = useState<string | null>(null)
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null)
  const [anexosAberto, setAnexosAberto] = useState<string | null>(null)

  const nomeDe = useCallback(
    (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? colaboradores.find((c) => c.id === id)?.email ?? '—',
    [colaboradores],
  )

  const carregar = useCallback(async () => {
    const [cs, ts, es] = await Promise.all([listarColaboradores(), listarTodasTarefas(), listarEstados()])
    setColaboradores(cs); setTodas(ts); setEstados(es); setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (perfil?.id) carregar() }, [perfil?.id, carregar])

  const resumo = useMemo(() => resumoPorPessoa(todas, colaboradores, estados), [todas, colaboradores, estados])

  // Tarefas visíveis: aplica filtro por pessoa e o toggle de concluídas.
  // Uma tarefa conta como "em aberto" se algum destinatário ainda não concluiu.
  const tarefasVisiveis = useMemo(() => {
    return todas.filter((t) => {
      if (filtroPessoa && !t.assignees.some((a) => a.user_id === filtroPessoa)) return false
      const emAberto = t.assignees.some((a) => !estadoInfo(a.estado, estados).is_concluido)
      return verConcluidas ? true : emAberto
    })
  }, [todas, filtroPessoa, verConcluidas, estados])

  if (!perfilCarregado) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>
  if (!perfil?.id) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/a-minha-area" style={c.voltar}>← A Minha Área</Link>
        <h1 style={c.titulo}>👥 Equipa</h1>
        <p style={c.sub}>As tarefas de toda a equipa e o progresso de cada pessoa.</p>
      </div>

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          {/* Resumo de desempenho por pessoa */}
          <section style={c.secao}>
            <h2 style={c.h2}>Desempenho por pessoa</h2>
            {resumo.length === 0 ? <p style={c.muted}>Ainda não há tarefas atribuídas.</p> : (
              <div style={c.cards}>
                {resumo.map((r) => {
                  const ativo = filtroPessoa === r.userId
                  return (
                    <button
                      key={r.userId}
                      onClick={() => setFiltroPessoa(ativo ? '' : r.userId)}
                      style={{ ...c.card, ...(ativo ? c.cardAtivo : {}) }}
                      title={ativo ? 'Mostrar todos' : `Ver só as tarefas de ${r.nome}`}
                    >
                      <div style={c.cardNome}>{r.nome}</div>
                      <div style={c.cardNums}>
                        <span style={c.num}><b>{r.emAberto}</b> em aberto</span>
                        <span style={c.num}><b>{r.concluidas}</b> concluídas</span>
                        {r.atrasadas > 0 && <span style={c.numAtraso}>⚠ {r.atrasadas} atrasada{r.atrasadas > 1 ? 's' : ''}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Lista de tarefas */}
          <section style={c.secao}>
            <div style={c.h2Linha}>
              <h2 style={c.h2}>
                {filtroPessoa ? `Tarefas de ${nomeDe(filtroPessoa)}` : 'Todas as tarefas'} ({tarefasVisiveis.length})
              </h2>
              <div style={c.filtros}>
                {filtroPessoa && <button style={c.btnSec} onClick={() => setFiltroPessoa('')}>✕ Limpar filtro</button>}
                <label style={c.check}>
                  <input type="checkbox" checked={verConcluidas} onChange={(e) => setVerConcluidas(e.target.checked)} />
                  Mostrar concluídas
                </label>
              </div>
            </div>

            {tarefasVisiveis.length === 0 ? <p style={c.muted}>Nada a mostrar.</p> : (
              <div style={c.lista}>
                {tarefasVisiveis.map((t) => {
                  const pi = prioridadeInfo(t.prioridade)
                  const atrasada = !!t.data_limite && t.data_limite < hoje() && t.assignees.some((a) => !estadoInfo(a.estado, estados).is_concluido)
                  const tudoFeito = t.assignees.length > 0 && t.assignees.every((a) => estadoInfo(a.estado, estados).is_concluido)
                  return (
                    <div key={t.id} style={{ ...c.tarefa, ...(tudoFeito ? c.tarefaFeita : {}) }}>
                      <div style={c.tarefaTopo}>
                        <span style={{ ...c.pill, color: pi.cor, background: pi.bg }}>{pi.label}</span>
                        <span style={{ flex: 1, fontWeight: 600 }}>{t.titulo}</span>
                        {t.data_limite && <span style={{ ...c.prazo, ...(atrasada ? c.prazoAtraso : {}) }}>{atrasada ? '⚠ ' : ''}{formatarData(t.data_limite)}</span>}
                        <button style={c.btnSecMini} onClick={() => setComentariosAberto((v) => (v === t.id ? null : t.id))} title="Ver respostas">💬</button>
                        <button style={c.btnSecMini} onClick={() => setHistoricoAberto((v) => (v === t.id ? null : t.id))} title="Ver histórico">🕘</button>
                        <button style={c.btnSecMini} onClick={() => setAnexosAberto((v) => (v === t.id ? null : t.id))} title="Ver anexos">📎</button>
                      </div>
                      {t.descricao && <div style={c.desc}>{t.descricao}</div>}
                      <div style={c.assignees}>
                        {t.assignees.length === 0 ? <span style={c.muted}>Sem destinatários.</span> : t.assignees.map((a) => {
                          const ei = estadoInfo(a.estado, estados)
                          return (
                            <span key={a.id} style={{ ...c.assignee, color: ei.cor, background: ei.bg }}>
                              {ei.is_concluido ? '✓ ' : '○ '}
                              {nomeDe(a.user_id)} <span style={c.assigneeEstado}>· {ei.label}</span>
                              {a.estado === SLUG_AGUARDA && a.aguarda_o_que ? <span style={c.assigneeEstado}> (⏳ {a.aguarda_o_que})</span> : null}
                            </span>
                          )
                        })}
                      </div>
                      <div style={c.criador}>Criada por {t.created_by ? nomeDe(t.created_by) : '—'}</div>
                      {comentariosAberto === t.id && <ComentariosTarefa taskId={t.id} autor={autor} soLeitura />}
                      {historicoAberto === t.id && <HistoricoTarefa taskId={t.id} />}
                      {anexosAberto === t.id && <AnexosTarefa taskId={t.id} autorId={autor.id} soLeitura />}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  topo: { marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  secao: { marginBottom: 24 },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: 'var(--foreground)' },
  h2Linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  filtros: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  check: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--foreground)' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 },
  card: { textAlign: 'left', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', font: 'inherit' },
  cardAtivo: { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px var(--primary)' },
  cardNome: { fontWeight: 700, fontSize: 14.5, marginBottom: 6 },
  cardNums: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12.5, color: 'var(--muted)' },
  num: { whiteSpace: 'nowrap' },
  numAtraso: { whiteSpace: 'nowrap', color: '#B91C1C', fontWeight: 700 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  tarefa: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' },
  tarefaFeita: { opacity: 0.72 },
  tarefaTopo: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  prazo: { fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' },
  prazoAtraso: { color: '#B91C1C', fontWeight: 700 },
  desc: { color: 'var(--muted)', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' },
  assignees: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  assignee: { fontSize: 12.5, background: '#f4f5f7', borderRadius: 999, padding: '3px 10px', color: '#374151' },
  assigneeCurso: { background: '#FEF3C7', color: '#92400E' },
  assigneeFeito: { background: '#D1FAE5', color: '#065F46' },
  assigneeEstado: { color: 'var(--muted)' },
  criador: { fontSize: 11.5, color: 'var(--muted)', marginTop: 8 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
}
