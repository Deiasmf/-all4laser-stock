'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import ComentariosTarefa from '@/components/ComentariosTarefa'
import {
  criarTarefa, criarRecado, notificarRecadoUrgente,
  listarColaboradores, listarTodasTarefas, prioridadeInfo, estadoTarefaLabel,
  PRIORIDADES, type Prioridade, type Colaborador, type TarefaComAssignees,
} from '@/lib/minhaArea'

function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

export default function AtribuirPage() {
  const { perfil, isAdmin, perfilCarregado } = useAuth()
  const router = useRouter()
  const autor = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }

  useEffect(() => {
    if (perfilCarregado && !isAdmin) router.replace('/a-minha-area')
  }, [perfilCarregado, isAdmin, router])

  const [tab, setTab] = useState<'tarefa' | 'recado'>('tarefa')
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [todas, setTodas] = useState<TarefaComAssignees[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [comentariosAberto, setComentariosAberto] = useState<string | null>(null)

  // Tarefa (vários destinatários)
  const [tParas, setTParas] = useState<string[]>([])
  const [tTitulo, setTTitulo] = useState('')
  const [tDesc, setTDesc] = useState('')
  const [tPrio, setTPrio] = useState<Prioridade>('normal')
  const [tPrazo, setTPrazo] = useState('')
  // Recado (um destinatário)
  const [rPara, setRPara] = useState('')
  const [rMsg, setRMsg] = useState('')
  const [rUrgente, setRUrgente] = useState(false)

  const nomePorId = (id: string) => colaboradores.find((x) => x.id === id)?.nome ?? colaboradores.find((x) => x.id === id)?.email ?? '—'
  function togglePara(id: string) { setTParas((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id])) }

  const carregar = useCallback(async () => {
    const [cs, ts] = await Promise.all([listarColaboradores(), listarTodasTarefas()])
    setColaboradores(cs); setTodas(ts)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  async function guardarTarefa() {
    if (!perfil?.id || tParas.length === 0 || !tTitulo.trim()) return
    const { error } = await criarTarefa(
      { titulo: tTitulo.trim(), descricao: tDesc.trim() || null, prioridade: tPrio, data_limite: tPrazo || null, assignees: tParas },
      perfil.id,
    )
    if (error) { setMsg(`Erro: ${error.message}`); return }
    const nomes = tParas.map(nomePorId).join(', ')
    setMsg(`Tarefa atribuída a ${nomes} ✓`)
    setTTitulo(''); setTDesc(''); setTPrio('normal'); setTPrazo(''); setTParas([])
    await carregar()
  }

  async function guardarRecado() {
    if (!perfil?.id || !rPara || !rMsg.trim()) return
    const { data, error } = await criarRecado({ to_user: rPara, mensagem: rMsg.trim(), urgente: rUrgente }, perfil.id)
    if (error) { setMsg(`Erro: ${error.message}`); return }
    if (rUrgente && data) await notificarRecadoUrgente((data as { id: string }).id)
    setMsg(`Recado enviado a ${nomePorId(rPara)}${rUrgente ? ' (urgente)' : ''} ✓`)
    setRMsg(''); setRUrgente(false)
  }

  if (!perfilCarregado) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>
  if (!isAdmin) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  const emAberto = todas.filter((t) => t.assignees.some((a) => a.estado !== 'concluida'))

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/a-minha-area" style={c.voltar}>← A Minha Área</Link>
          <h1 style={c.titulo}>Atribuir tarefa / recado</h1>
          <p style={c.sub}>Escolhe o(s) colaborador(es) e cria a tarefa ou o recado.</p>
        </div>
      </div>

      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'tarefa' ? c.tabAtiva : {}) }} onClick={() => setTab('tarefa')}>Tarefa</button>
        <button style={{ ...c.tab, ...(tab === 'recado' ? c.tabAtiva : {}) }} onClick={() => setTab('recado')}>Recado</button>
      </div>

      {msg && <div style={c.msg}>{msg}</div>}

      {tab === 'tarefa' ? (
        <div style={c.form}>
          <div style={c.campo}>
            <span style={c.rot}>Colaboradores <span style={c.opc}>(podes escolher vários)</span></span>
            <div style={c.pessoas}>
              {colaboradores.map((cl) => {
                const on = tParas.includes(cl.id)
                return (
                  <button key={cl.id} type="button" onClick={() => togglePara(cl.id)}
                    style={{ ...c.chip, ...(on ? c.chipOn : {}) }}>
                    {on ? '✓ ' : ''}{cl.nome ?? cl.email}
                  </button>
                )
              })}
            </div>
          </div>
          <label style={c.campo}><span style={c.rot}>Título</span>
            <input value={tTitulo} onChange={(e) => setTTitulo(e.target.value)} placeholder="O que é preciso fazer" style={c.input} />
          </label>
          <label style={c.campo}><span style={c.rot}>Descrição <span style={c.opc}>(opcional)</span></span>
            <textarea value={tDesc} onChange={(e) => setTDesc(e.target.value)} style={{ ...c.input, minHeight: 60, resize: 'vertical' }} />
          </label>
          <div style={c.grelha}>
            <label style={c.campo}><span style={c.rot}>Prioridade</span>
              <select value={tPrio} onChange={(e) => setTPrio(e.target.value as Prioridade)} style={c.input}>
                {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </select>
            </label>
            <label style={c.campo}><span style={c.rot}>Data limite <span style={c.opc}>(opcional)</span></span>
              <input type="date" value={tPrazo} onChange={(e) => setTPrazo(e.target.value)} style={c.input} />
            </label>
          </div>
          <button style={c.btnPrimario} disabled={tParas.length === 0 || !tTitulo.trim()} onClick={guardarTarefa}>
            Atribuir tarefa{tParas.length > 1 ? ` (${tParas.length} pessoas)` : ''}
          </button>
        </div>
      ) : (
        <div style={c.form}>
          <label style={c.campo}><span style={c.rot}>Colaborador</span>
            <select value={rPara} onChange={(e) => setRPara(e.target.value)} style={c.input}>
              <option value="">— escolher —</option>
              {colaboradores.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome ?? cl.email}</option>)}
            </select>
          </label>
          <label style={c.campo}><span style={c.rot}>Mensagem</span>
            <textarea value={rMsg} onChange={(e) => setRMsg(e.target.value)} placeholder="Escreve o recado…" style={{ ...c.input, minHeight: 80, resize: 'vertical' }} />
          </label>
          <label style={c.checkLinha}>
            <input type="checkbox" checked={rUrgente} onChange={(e) => setRUrgente(e.target.checked)} />
            <span>Marcar como <strong>urgente</strong> (avisa por email quem tiver ativado essa opção).</span>
          </label>
          <button style={c.btnPrimario} disabled={!rPara || !rMsg.trim()} onClick={guardarRecado}>Enviar recado</button>
        </div>
      )}

      {/* Acompanhamento: tarefas com progresso por pessoa */}
      <section style={{ marginTop: 26 }}>
        <h2 style={c.h2}>📋 Acompanhamento — tarefas em aberto ({emAberto.length})</h2>
        {emAberto.length === 0 ? <p style={c.muted}>Nada em aberto.</p> : (
          <div style={c.lista}>
            {emAberto.map((t) => {
              const pi = prioridadeInfo(t.prioridade)
              return (
                <div key={t.id} style={c.card}>
                  <div style={c.cardTopo}>
                    <span style={{ ...c.pill, color: pi.cor, background: pi.bg }}>{pi.label}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{t.titulo}</span>
                    <span style={c.muted}>{formatarData(t.data_limite)}</span>
                    <button style={c.btnSecMini} onClick={() => setComentariosAberto((v) => (v === t.id ? null : t.id))}>💬</button>
                  </div>
                  <div style={c.assignees}>
                    {t.assignees.map((a) => (
                      <span key={a.id} style={{ ...c.assignee, ...(a.estado === 'concluida' ? c.assigneeFeito : {}) }}>
                        {a.estado === 'concluida' ? '✓ ' : a.estado === 'em_curso' ? '◐ ' : '○ '}
                        {nomePorId(a.user_id)} <span style={c.assigneeEstado}>· {estadoTarefaLabel(a.estado)}</span>
                      </span>
                    ))}
                  </div>
                  {comentariosAberto === t.id && <ComentariosTarefa taskId={t.id} autor={autor} />}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  topo: { marginBottom: 12 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { padding: '8px 18px', border: '1px solid var(--border)', background: '#fff', borderRadius: 999, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  msg: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '9px 12px', fontSize: 13.5, marginBottom: 12 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rot: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  pessoas: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid var(--border)', background: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer', font: 'inherit' },
  chipOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700 },
  checkLinha: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px' },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' },
  cardTopo: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  assignees: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  assignee: { fontSize: 12.5, background: '#f4f5f7', borderRadius: 999, padding: '3px 10px', color: '#374151' },
  assigneeFeito: { background: '#D1FAE5', color: '#065F46' },
  assigneeEstado: { color: 'var(--muted)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
}
