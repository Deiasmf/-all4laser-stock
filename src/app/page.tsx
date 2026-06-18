'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { contarFluxoNotas, type FluxoContagem } from '@/lib/neFluxo'
import { iniciais, saudacao, dataPorExtenso, tempoRelativo } from '@/lib/ui'
import {
  carregarMetricas,
  listarComunicados,
  criarComunicado,
  listarTarefasHoje,
  alternarTarefa,
  criarTarefa,
  listarChat,
  enviarMensagem,
  listarAlugueresFora,
  listarReservasHoje,
  type Metricas,
  type AluguerFora,
  type ReservaHoje,
} from '@/lib/dashboard'
import { AREAS, corArea, type Comunicado, type Tarefa, type ChatMensagem } from '@/types/dashboard'

export default function Home() {
  const { perfil } = useAuth()
  const primeiroNome = (perfil?.nome ?? '').split(/\s+/)[0] || 'equipa'

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      {/* 1. Saudação */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>
          {saudacao()}, {primeiroNome}
        </h1>
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 13, marginTop: 2 }}>{dataPorExtenso()}</p>
      </div>

      {/* 2. Métricas */}
      <Metricas />

      {/* 2b. Fluxo das Notas de Encomenda */}
      <FluxoNotas />

      {/* 3. Grid principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ComunicadosCard />
          <TarefasCard />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ChatCard />
          <ADecorrerCard />
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────── Métricas
function Metricas() {
  const [m, setM] = useState<Metricas>({ alugueresFora: 0, leadsNovas: 0, emPrep: 0, entregasHoje: 0 })

  useEffect(() => {
    carregarMetricas().then(setM)
  }, [])

  const cards = [
    { label: 'Alugueres a decorrer', valor: m.alugueresFora },
    { label: 'Leads novas', valor: m.leadsNovas },
    { label: 'Equipamentos em prep.', valor: m.emPrep },
    { label: 'Entregas hoje', valor: m.entregasHoje },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} className="a4l-card" style={{ padding: '16px 20px' }}>
          <div className="a4l-gradient-text" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
            {c.valor}
          </div>
          <div style={{ color: 'var(--a4l-text-light)', fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
            {c.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────────────────── Fluxo das Notas de Encomenda
function FluxoNotas() {
  const [c, setC] = useState<FluxoContagem | null>(null)

  useEffect(() => {
    contarFluxoNotas().then(setC)
  }, [])

  const etapas = [
    { label: 'Notas de Encomenda', valor: c?.notas ?? 0, href: '/comercial/notas-encomenda' },
    { label: 'Prep. Logística', valor: c?.prepLogistica ?? 0, href: '/logistico/preparacao' },
    { label: 'Prep. Técnica', valor: c?.prepTecnica ?? 0, href: '/tecnico/preparacao' },
    { label: 'Para encaixotar', valor: c?.encaixotar ?? 0, href: '/logistico/encaixotamento' },
    { label: 'Para expedir', valor: c?.expedir ?? 0, href: '/admin-dept/expedicao' },
    { label: 'Expedidas', valor: c?.expedida ?? 0, href: '/comercial/notas-encomenda' },
  ]

  return (
    <div className="a4l-card" style={{ marginTop: 14 }}>
      <CardHead titulo="Fluxo das Notas de Encomenda" />
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {etapas.map((e, i) => (
          <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link
              href={e.href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minWidth: 120, padding: '14px 12px', borderRadius: 12, textDecoration: 'none',
                background: '#F7F6FF', border: '0.5px solid var(--a4l-border)',
              }}
            >
              <span className="a4l-gradient-text" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                {e.valor}
              </span>
              <span style={{ color: 'var(--a4l-text-light)', fontSize: 12, fontWeight: 600, marginTop: 4, textAlign: 'center' }}>
                {e.label}
              </span>
            </Link>
            {i < etapas.length - 1 && (
              <span style={{ color: 'var(--a4l-text-light)', fontSize: 20, fontWeight: 700 }}>›</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────────────────── Cabeçalho de card
function CardHead({ titulo, acao }: { titulo: string; acao?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--a4l-text-dark)' }}>{titulo}</h2>
      {acao}
    </div>
  )
}

function PrioPill({ p }: { p: string }) {
  return <span className={`a4l-prio a4l-prio-${p}`}>{p}</span>
}

function Avatar({ ini }: { ini: string }) {
  return <div className="a4l-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{ini}</div>
}

// ───────────────────────────────────────── Comunicados
function ComunicadosCard() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<Comunicado[]>([])
  const [modal, setModal] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [area, setArea] = useState('')
  const [prioridade, setPrioridade] = useState('normal')
  const [aGuardar, setAGuardar] = useState(false)

  function carregar() {
    listarComunicados(5).then(setLista)
  }
  useEffect(carregar, [])

  async function guardar() {
    if (!titulo.trim() || !corpo.trim()) return
    setAGuardar(true)
    await criarComunicado({
      titulo: titulo.trim(),
      corpo: corpo.trim(),
      area: area || null,
      prioridade,
      autor_id: perfil?.id ?? null,
      autor_nome: perfil?.nome ?? perfil?.email ?? 'Equipa',
      autor_iniciais: iniciais(perfil?.nome, perfil?.email),
    })
    setAGuardar(false)
    setModal(false)
    setTitulo(''); setCorpo(''); setArea(''); setPrioridade('normal')
    carregar()
  }

  return (
    <div className="a4l-card">
      <CardHead
        titulo="Comunicados da equipa"
        acao={<button className="a4l-btn" onClick={() => setModal(true)}>+ Comunicado</button>}
      />
      {lista.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}>Sem comunicados.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map((c) => (
            <div key={c.id} style={{ borderTop: '0.5px solid var(--a4l-border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <PrioPill p={c.prioridade} />
                {c.area && (
                  <span style={{ fontSize: 11, color: 'var(--a4l-text-light)' }}>{c.area}</span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--a4l-text-dark)' }}>{c.titulo}</div>
              <p style={{
                fontSize: 13, color: 'var(--a4l-text-mid)', margin: '2px 0 6px',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {c.corpo}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--a4l-text-light)', fontSize: 11.5 }}>
                <Avatar ini={c.autor_iniciais} />
                <span>{c.autor_nome}</span>
                <span>·</span>
                <span>{tempoRelativo(c.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal titulo="Novo comunicado" onFechar={() => setModal(false)}>
          <Campo label="Título">
            <input className="a4l-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Campo>
          <Campo label="Mensagem">
            <textarea className="a4l-input" rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Área">
              <select className="a4l-input" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">— nenhuma —</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select className="a4l-input" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="urgente">Urgente</option>
              </select>
            </Campo>
          </div>
          <BotoesModal onCancelar={() => setModal(false)} onGuardar={guardar} aGuardar={aGuardar} />
        </Modal>
      )}
    </div>
  )
}

// ───────────────────────────────────────── Tarefas
function TarefasCard() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<Tarefa[]>([])
  const [modal, setModal] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [area, setArea] = useState<string>(AREAS[0])
  const [dataLimite, setDataLimite] = useState('')
  const [prioridade, setPrioridade] = useState('normal')
  const [aGuardar, setAGuardar] = useState(false)

  function carregar() {
    listarTarefasHoje().then(setLista)
  }
  useEffect(carregar, [])

  async function concluir(id: string) {
    setLista((l) => l.filter((t) => t.id !== id)) // otimista
    await alternarTarefa(id, 'concluida')
  }

  async function guardar() {
    if (!titulo.trim()) return
    setAGuardar(true)
    await criarTarefa({
      titulo: titulo.trim(),
      descricao: null,
      area,
      data_limite: dataLimite || null,
      prioridade,
      assignee_id: perfil?.id ?? null,
      assignee_nome: perfil?.nome ?? null,
    })
    setAGuardar(false)
    setModal(false)
    setTitulo(''); setDataLimite(''); setPrioridade('normal'); setArea(AREAS[0])
    carregar()
  }

  // Agrupar por área
  const grupos = lista.reduce<Record<string, Tarefa[]>>((acc, t) => {
    (acc[t.area] ??= []).push(t)
    return acc
  }, {})

  return (
    <div className="a4l-card">
      <CardHead
        titulo="Tarefas do dia"
        acao={<button className="a4l-btn" onClick={() => setModal(true)}>+ Tarefa</button>}
      />
      {lista.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}>Sem tarefas para hoje. 🎉</p>
      ) : (
        Object.entries(grupos).map(([area, tarefas]) => {
          const cor = corArea(area)
          return (
            <div key={area} style={{ marginBottom: 10 }}>
              <span style={{
                display: 'inline-block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                color: cor.color, background: cor.bg, borderRadius: 999, padding: '2px 8px', marginBottom: 6,
              }}>
                {area}
              </span>
              {tarefas.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', cursor: 'pointer' }}>
                  <input type="checkbox" onChange={() => concluir(t.id)} style={{ width: 16, height: 16, accentColor: 'var(--a4l-3)' }} />
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--a4l-text-mid)' }}>{t.titulo}</span>
                  {t.prioridade !== 'normal' && <PrioPill p={t.prioridade} />}
                </label>
              ))}
            </div>
          )
        })
      )}

      {modal && (
        <Modal titulo="Nova tarefa" onFechar={() => setModal(false)}>
          <Campo label="Tarefa">
            <input className="a4l-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo label="Área">
              <select className="a4l-input" value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select className="a4l-input" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="importante">Importante</option>
                <option value="urgente">Urgente</option>
              </select>
            </Campo>
          </div>
          <Campo label="Data limite (opcional)">
            <input className="a4l-input" type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />
          </Campo>
          <BotoesModal onCancelar={() => setModal(false)} onGuardar={guardar} aGuardar={aGuardar} />
        </Modal>
      )}
    </div>
  )
}

// ───────────────────────────────────────── Chat
function ChatCard() {
  const { perfil } = useAuth()
  const [msgs, setMsgs] = useState<ChatMensagem[]>([])
  const [texto, setTexto] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  const meuId = perfil?.id ?? null

  useEffect(() => {
    listarChat(30).then(setMsgs)
    const canal = supabase
      .channel('chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens' }, (payload) => {
        setMsgs((m) => {
          const nova = payload.new as ChatMensagem
          if (m.some((x) => x.id === nova.id)) return m
          return [...m, nova]
        })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function enviar() {
    const t = texto.trim()
    if (!t) return
    setTexto('')
    await enviarMensagem({
      mensagem: t,
      autor_id: meuId,
      autor_nome: perfil?.nome ?? perfil?.email ?? 'Equipa',
      autor_iniciais: iniciais(perfil?.nome, perfil?.email),
    })
  }

  return (
    <div className="a4l-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <CardHead titulo="Chat de equipa" />
      <div style={{ height: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
        {msgs.length === 0 && <p style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}>Sê o primeiro a escrever.</p>}
        {msgs.map((m) => {
          const meu = meuId && m.autor_id === meuId
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: meu ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
              <Avatar ini={m.autor_iniciais} />
              <div style={{ maxWidth: '75%' }}>
                <div style={{
                  fontSize: 10.5, color: 'var(--a4l-text-light)', marginBottom: 2,
                  textAlign: meu ? 'right' : 'left',
                }}>
                  {meu ? 'Eu' : m.autor_nome} · {tempoRelativo(m.created_at)}
                </div>
                <div style={{
                  padding: '8px 11px', borderRadius: 12, fontSize: 13, lineHeight: 1.35,
                  background: meu ? 'var(--a4l-gradient)' : '#F7F6FF',
                  color: meu ? '#fff' : 'var(--a4l-text-mid)',
                }}>
                  {m.mensagem}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          className="a4l-input"
          style={{ flex: 1 }}
          placeholder="Escrever mensagem..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
        />
        <button className="a4l-btn" onClick={enviar}>Enviar</button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────── A decorrer + reservas hoje
function badgeDias(dias: number) {
  if (dias <= 2) return { txt: 'URGENTE', color: '#fff', bg: 'var(--a4l-5)' }
  if (dias <= 7) return { txt: `${dias}d`, color: '#fff', bg: '#D4820A' }
  return { txt: `${dias}d`, color: '#fff', bg: '#00A87A' }
}

function ADecorrerCard() {
  const [fora, setFora] = useState<AluguerFora[]>([])
  const [reservas, setReservas] = useState<ReservaHoje[]>([])

  useEffect(() => {
    listarAlugueresFora(8).then(setFora)
    listarReservasHoje(8).then(setReservas)
  }, [])

  return (
    <div className="a4l-card">
      <CardHead titulo="Alugueres a decorrer" />

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--a4l-text-light)', marginBottom: 6 }}>
        Fora agora
      </div>
      {fora.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 13, marginBottom: 12 }}>Nenhum aluguer fora.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
          {fora.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--a4l-text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.cliente_nome ?? '—'}
                </div>
                <div style={{ color: 'var(--a4l-text-light)', fontSize: 12 }}>
                  {[a.modelo, a.serial_number].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <span style={{ color: 'var(--a4l-text-light)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                desde {a.data_entrega ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--a4l-text-light)', marginBottom: 6 }}>
        Reservados para hoje
      </div>
      {reservas.length === 0 ? (
        <p style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}>Nenhuma reserva para hoje.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {reservas.map((r) => {
            const b = badgeDias(r.diasRestantes)
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--a4l-text-dark)' }}>{r.cliente_nome ?? '—'}</div>
                  <div style={{ color: 'var(--a4l-text-light)', fontSize: 12 }}>{r.modelo_nome} · até {r.data_fim}</div>
                </div>
                <span style={{ color: b.color, background: b.bg, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  {b.txt}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────── Modal + campos
function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onFechar}
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,11,43,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="a4l-card" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 14 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--a4l-text-mid)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function BotoesModal({ onCancelar, onGuardar, aGuardar }: { onCancelar: () => void; onGuardar: () => void; aGuardar: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
      <button className="a4l-btn-ghost" onClick={onCancelar}>Cancelar</button>
      <button className="a4l-btn" onClick={onGuardar} disabled={aGuardar} style={{ opacity: aGuardar ? 0.6 : 1 }}>
        {aGuardar ? 'A guardar...' : 'Guardar'}
      </button>
    </div>
  )
}
