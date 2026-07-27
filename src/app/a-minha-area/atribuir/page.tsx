'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  criarTarefa, criarRecado, notificarRecadoUrgente,
  listarColaboradores, listarTodasTarefas, prioridadeInfo, estadoTarefaLabel,
  PRIORIDADES, type Prioridade, type Colaborador, type Tarefa,
} from '@/lib/minhaArea'

function formatarData(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

export default function AtribuirPage() {
  const { perfil, isAdmin, perfilCarregado } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (perfilCarregado && !isAdmin) router.replace('/a-minha-area')
  }, [perfilCarregado, isAdmin, router])

  const [tab, setTab] = useState<'tarefa' | 'recado'>('tarefa')
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [todas, setTodas] = useState<Tarefa[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  // Tarefa
  const [tPara, setTPara] = useState('')
  const [tTitulo, setTTitulo] = useState('')
  const [tDesc, setTDesc] = useState('')
  const [tPrio, setTPrio] = useState<Prioridade>('normal')
  const [tPrazo, setTPrazo] = useState('')
  // Recado
  const [rPara, setRPara] = useState('')
  const [rMsg, setRMsg] = useState('')
  const [rUrgente, setRUrgente] = useState(false)

  const nomePorId = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? colaboradores.find((c) => c.id === id)?.email ?? '—'

  const carregar = useCallback(async () => {
    const [cs, ts] = await Promise.all([listarColaboradores(), listarTodasTarefas()])
    setColaboradores(cs); setTodas(ts)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  async function guardarTarefa() {
    if (!perfil?.id || !tPara || !tTitulo.trim()) return
    const { error } = await criarTarefa(
      { assigned_to: tPara, titulo: tTitulo.trim(), descricao: tDesc.trim() || null, prioridade: tPrio, data_limite: tPrazo || null },
      perfil.id,
    )
    if (error) { setMsg(`Erro: ${error.message}`); return }
    setMsg(`Tarefa atribuída a ${nomePorId(tPara)} ✓`)
    setTTitulo(''); setTDesc(''); setTPrio('normal'); setTPrazo('')
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

  const ativas = todas.filter((t) => t.estado !== 'concluida')

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/a-minha-area" style={c.voltar}>← A Minha Área</Link>
          <h1 style={c.titulo}>Atribuir tarefa / recado</h1>
          <p style={c.sub}>Escolhe o colaborador e cria a tarefa ou o recado.</p>
        </div>
      </div>

      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'tarefa' ? c.tabAtiva : {}) }} onClick={() => setTab('tarefa')}>Tarefa</button>
        <button style={{ ...c.tab, ...(tab === 'recado' ? c.tabAtiva : {}) }} onClick={() => setTab('recado')}>Recado</button>
      </div>

      {msg && <div style={c.msg}>{msg}</div>}

      {tab === 'tarefa' ? (
        <div style={c.form}>
          <label style={c.campo}><span style={c.rot}>Colaborador</span>
            <select value={tPara} onChange={(e) => setTPara(e.target.value)} style={c.input}>
              <option value="">— escolher —</option>
              {colaboradores.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome ?? cl.email}</option>)}
            </select>
          </label>
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
          <button style={c.btnPrimario} disabled={!tPara || !tTitulo.trim()} onClick={guardarTarefa}>Atribuir tarefa</button>
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

      {/* Acompanhamento: todas as tarefas ativas (admin vê tudo) */}
      <section style={{ marginTop: 26 }}>
        <h2 style={c.h2}>📋 Acompanhamento — tarefas em aberto ({ativas.length})</h2>
        {ativas.length === 0 ? <p style={c.muted}>Nada em aberto.</p> : (
          <div style={c.lista}>
            {ativas.map((t) => {
              const pi = prioridadeInfo(t.prioridade)
              return (
                <div key={t.id} style={c.linha}>
                  <span style={{ ...c.pill, color: pi.cor, background: pi.bg }}>{pi.label}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{t.titulo}</span>
                    <span style={c.muted}> · {nomePorId(t.assigned_to)}</span>
                  </span>
                  <span style={c.muted}>{estadoTarefaLabel(t.estado)}</span>
                  <span style={c.muted}>{formatarData(t.data_limite)}</span>
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
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  checkLinha: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px' },
  lista: { display: 'flex', flexDirection: 'column', gap: 6 },
  linha: { display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  muted: { color: 'var(--muted)', fontSize: 13 },
}
