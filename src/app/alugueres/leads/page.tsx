'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AlugueresNav from '@/components/AlugueresNav'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { atualizarLead, eliminarLead } from '@/lib/leads'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import {
  CANAL_CONFIG, ESTADO_CONFIG, CANAL_OPCOES, ESTADO_OPCOES,
  type Lead, type EstadoLead,
} from '@/types/lead'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

const colunasExport: ColunaExport<Lead>[] = [
  { cabecalho: 'Nome', valor: (l) => l.nome },
  { cabecalho: 'Estado', valor: (l) => ESTADO_CONFIG[l.estado].label },
  { cabecalho: 'Canal', valor: (l) => CANAL_CONFIG[l.canal].label },
  { cabecalho: 'Interesse', valor: (l) => l.modelo_interesse },
  { cabecalho: 'Data início', valor: (l) => formatarData(l.data_inicio) },
  { cabecalho: 'Data fim', valor: (l) => formatarData(l.data_fim) },
  { cabecalho: 'Cidade', valor: (l) => l.cidade },
  { cabecalho: 'Email', valor: (l) => l.email },
  { cabecalho: 'Telefone', valor: (l) => l.telefone },
  { cabecalho: 'Recebida', valor: (l) => formatarData(l.created_at) },
]

function CanalTag({ canal }: { canal: Lead['canal'] }) {
  const cfg = CANAL_CONFIG[canal]
  return <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cfg.icone} {cfg.label}</span>
}

function EstadoTag({ estado }: { estado: EstadoLead }) {
  const cfg = ESTADO_CONFIG[estado]
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function LeadsPage() {
  const { isAdmin } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fCanal, setFCanal] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [aberta, setAberta] = useState<Lead | null>(null)

  useEffect(() => {
    supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setLeads((data as Lead[]) ?? [])
        setCarregando(false)
      })
  }, [])

  const filtradas = useMemo(
    () => leads.filter((l) => (!fCanal || l.canal === fCanal) && (!fEstado || l.estado === fEstado)),
    [leads, fCanal, fEstado]
  )

  const contagens = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of leads) m[l.estado] = (m[l.estado] ?? 0) + 1
    return m
  }, [leads])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Leads</h1>
        <Link href="/alugueres/lista" style={c.voltar}>← Alugueres</Link>
      </div>
      <AlugueresNav />

      <div style={c.resumoLinha}>
        {ESTADO_OPCOES.map((e) => (
          <button
            key={e}
            onClick={() => setFEstado(fEstado === e ? '' : e)}
            style={{
              ...c.pill,
              color: ESTADO_CONFIG[e].color,
              background: fEstado === e ? ESTADO_CONFIG[e].bg : 'transparent',
              borderColor: fEstado === e ? ESTADO_CONFIG[e].color : 'var(--border)',
            }}
          >
            {ESTADO_CONFIG[e].label} · {contagens[e] ?? 0}
          </button>
        ))}
      </div>

      <div style={c.filtros}>
        <select value={fCanal} onChange={(e) => setFCanal(e.target.value)} style={c.select}>
          <option value="">Todos os canais</option>
          {CANAL_OPCOES.map((v) => <option key={v} value={v}>{CANAL_CONFIG[v].label}</option>)}
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {ESTADO_OPCOES.map((v) => <option key={v} value={v}>{ESTADO_CONFIG[v].label}</option>)}
        </select>
        {(fCanal || fEstado) && (
          <button onClick={() => { setFCanal(''); setFEstado('') }} style={c.limpar}>Limpar</button>
        )}
        <BotaoExportar nome="leads" colunas={colunasExport} linhas={filtradas} />
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 14, alignSelf: 'center' }}>
          {filtradas.length} de {leads.length}
        </span>
      </div>

      {erro ? (
        <p style={{ ...c.estado, color: 'var(--danger)' }}>
          Não foi possível carregar as leads. {erro.includes('does not exist') || erro.includes('relation') ? 'A tabela ainda não foi criada na base de dados.' : erro}
        </p>
      ) : carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>Sem leads.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map((l) => (
            <button key={l.id} onClick={() => setAberta(l)} style={c.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{l.nome}</span>
                <EstadoTag estado={l.estado} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <CanalTag canal={l.canal} />
                {l.modelo_interesse && <span style={c.meta}>🔧 {l.modelo_interesse}</span>}
                {(l.data_inicio || l.data_fim) && (
                  <span style={c.meta}>📅 {formatarData(l.data_inicio)} – {formatarData(l.data_fim)}</span>
                )}
                {l.cidade && <span style={c.meta}>📍 {l.cidade}</span>}
                <span style={{ ...c.meta, marginLeft: 'auto' }}>{formatarData(l.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {aberta && (
        <LeadDrawer
          key={aberta.id}
          lead={aberta}
          isAdmin={isAdmin}
          onClose={() => setAberta(null)}
          onGuardado={(atualizada) => {
            setLeads((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)))
            setAberta(atualizada)
          }}
          onEliminado={(id) => {
            setLeads((prev) => prev.filter((x) => x.id !== id))
            setAberta(null)
          }}
        />
      )}
    </main>
  )
}

function LeadDrawer({
  lead, isAdmin, onClose, onGuardado, onEliminado,
}: {
  lead: Lead
  isAdmin: boolean
  onClose: () => void
  onGuardado: (l: Lead) => void
  onEliminado: (id: string) => void
}) {
  const [estado, setEstado] = useState<EstadoLead>(lead.estado)
  const [nota, setNota] = useState(lead.nota_interna ?? '')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function eliminar() {
    if (!confirm('Eliminar esta lead? Esta ação não pode ser anulada.')) return
    setAGravar(true)
    const { error } = await eliminarLead(lead.id)
    setAGravar(false)
    if (error) { setMsg('Erro ao eliminar: ' + error.message); return }
    onEliminado(lead.id)
  }

  async function guardar() {
    setAGravar(true)
    setMsg(null)
    const { error } = await atualizarLead(lead.id, { estado, nota_interna: nota.trim() || null })
    setAGravar(false)
    if (error) { setMsg('Erro ao guardar: ' + error.message); return }
    onGuardado({ ...lead, estado, nota_interna: nota.trim() || null })
    setMsg('Guardado ✓')
  }

  return (
    <div style={c.backdrop} onClick={onClose}>
      <div style={c.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{lead.nome}</h2>
          <button onClick={onClose} style={c.fechar}>✕</button>
        </div>
        <div style={{ marginTop: 4 }}><CanalTag canal={lead.canal} /></div>

        <div style={c.dados}>
          {lead.email && <Linha rotulo="Email" valor={<a href={`mailto:${lead.email}`} style={c.link}>{lead.email}</a>} />}
          {lead.telefone && <Linha rotulo="Telefone" valor={<a href={`tel:${lead.telefone}`} style={c.link}>{lead.telefone}</a>} />}
          {lead.cidade && <Linha rotulo="Cidade" valor={lead.cidade} />}
          {lead.modelo_interesse && <Linha rotulo="Interesse" valor={lead.modelo_interesse} />}
          {(lead.data_inicio || lead.data_fim) && (
            <Linha rotulo="Datas pretendidas" valor={`${formatarData(lead.data_inicio)} – ${formatarData(lead.data_fim)}`} />
          )}
          <Linha rotulo="Recebida" valor={formatarData(lead.created_at)} />
        </div>

        {lead.mensagem && (
          <div style={c.mensagem}>
            <div style={c.rotulo}>Mensagem</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{lead.mensagem}</p>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <label style={c.rotulo}>Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoLead)} style={{ ...c.select, width: '100%', marginTop: 6 }}>
            {ESTADO_OPCOES.map((e) => <option key={e} value={e}>{ESTADO_CONFIG[e].label}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={c.rotulo}>Nota interna</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Notas da equipa..." style={c.textarea} />
        </div>

        {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('Erro') ? 'var(--danger)' : 'var(--primary)', fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button onClick={guardar} disabled={aGravar} style={c.btnPrimario}>{aGravar ? 'A guardar...' : 'Guardar'}</button>
          <button onClick={onClose} style={c.btnSecundario}>Fechar</button>
          {isAdmin && (
            <button onClick={eliminar} disabled={aGravar} style={c.btnEliminar}>Eliminar</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14 }}>
      <span style={{ color: 'var(--muted)', minWidth: 130 }}>{rotulo}</span>
      <span style={{ fontWeight: 500 }}>{valor}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  resumoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  pill: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  filtros: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  select: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)' },
  limpar: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0 14px', fontWeight: 600, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer', width: '100%', font: 'inherit', color: 'inherit' },
  meta: { fontSize: 12, color: 'var(--muted)' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' },
  drawer: { width: 440, maxWidth: '92vw', height: '100%', background: 'var(--surface)', padding: 22, overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 },
  dados: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' },
  link: { color: 'var(--primary)', textDecoration: 'none' },
  mensagem: { marginTop: 16, background: 'var(--accent-bg)', borderRadius: 10, padding: 12 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  textarea: { width: '100%', marginTop: 6, minHeight: 90, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical', font: 'inherit' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' },
  btnSecundario: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' },
  btnEliminar: { marginLeft: 'auto', background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
