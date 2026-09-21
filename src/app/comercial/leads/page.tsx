'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  criarLead, atualizarLead, eliminarLead, mudarEstadoLeads, definirResponsavelLead,
  listarResponsaveisLeads, listarHistoricoLead, type ResponsavelLead,
} from '@/lib/leads'
import BotaoExportar from '@/components/BotaoExportar'
import EnviarFichaLead from '@/components/EnviarFichaLead'
import HistoricoEnviosLead from '@/components/HistoricoEnviosLead'
import type { ColunaExport } from '@/lib/exportar'
import {
  CANAL_CONFIG, ESTADO_CONFIG, CANAL_OPCOES, ESTADO_OPCOES, ESTADOS_COM_FOLLOWUP,
  type Lead, type EstadoLead, type LeadStatusHistory,
} from '@/types/lead'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

function formatarDataHora(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Nº de dias inteiros desde uma data (para "no estado há X dias").
function diasDesde(d: string | null): number | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000))
}

function textoNoEstado(estadoDesde: string | null): string {
  const dias = diasDesde(estadoDesde)
  if (dias == null) return ''
  if (dias === 0) return 'no estado desde hoje'
  return `no estado há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
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
  const [nova, setNova] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [responsaveis, setResponsaveis] = useState<ResponsavelLead[]>([])
  const [bulkModal, setBulkModal] = useState<EstadoLead | null>(null)

  const recarregar = () =>
    supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setLeads((data as Lead[]) ?? [])
        setCarregando(false)
      })

  useEffect(() => { recarregar() }, [])
  useEffect(() => { listarResponsaveisLeads().then(setResponsaveis) }, [])

  const filtradas = useMemo(
    () => leads.filter((l) => (!fCanal || l.canal === fCanal) && (!fEstado || l.estado === fEstado)),
    [leads, fCanal, fEstado]
  )

  // Seleção múltipla (respeita os filtros ativos: só age sobre as visíveis).
  const idsVisiveis = useMemo(() => filtradas.map((l) => l.id), [filtradas])
  const selecionadas = useMemo(() => filtradas.filter((l) => sel.has(l.id)), [filtradas, sel])
  const todasVisiveisSel = idsVisiveis.length > 0 && idsVisiveis.every((id) => sel.has(id))

  function toggle(id: string) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodasVisiveis() {
    setSel((prev) => {
      const n = new Set(prev)
      if (todasVisiveisSel) idsVisiveis.forEach((id) => n.delete(id))
      else idsVisiveis.forEach((id) => n.add(id))
      return n
    })
  }
  const limparSel = () => setSel(new Set())

  // Atribuir responsável em massa (também recola a tarefa de follow-up ao dono).
  async function atribuirEmMassa(respId: string) {
    if (!respId) return
    const nome = responsaveis.find((r) => r.id === respId)?.nome ?? 'este responsável'
    if (!confirm(`Atribuir ${selecionadas.length} lead(s) a ${nome}?`)) return
    for (const l of selecionadas) await definirResponsavelLead(l.id, respId)
    await recarregar()
    limparSel()
  }

  // Eliminar em massa (só admin), espelha a eliminação individual.
  async function eliminarEmMassa() {
    if (!confirm(`Eliminar ${selecionadas.length} lead(s)? Esta ação não pode ser anulada.`)) return
    for (const l of selecionadas) await eliminarLead(l.id)
    await recarregar()
    limparSel()
  }

  const contagens = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of leads) m[l.estado] = (m[l.estado] ?? 0) + 1
    return m
  }, [leads])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Leads</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setNova(true)} style={c.btnNova}>+ Nova lead</button>
          <Link href="/comercial" style={c.voltar}>← Comercial</Link>
        </div>
      </div>

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

      {sel.size > 0 && (
        <div style={c.bulkBar}>
          <strong style={{ fontSize: 14 }}>{selecionadas.length} selecionada(s)</strong>
          <select
            defaultValue=""
            onChange={(e) => { const v = e.target.value as EstadoLead; e.currentTarget.value = ''; if (v) setBulkModal(v) }}
            style={c.select}
          >
            <option value="">Mudar estado para…</option>
            {ESTADO_OPCOES.map((v) => <option key={v} value={v}>{ESTADO_CONFIG[v].label}</option>)}
          </select>
          <select
            defaultValue=""
            onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; if (v) atribuirEmMassa(v) }}
            style={c.select}
          >
            <option value="">Atribuir responsável…</option>
            {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
          {isAdmin && <button onClick={eliminarEmMassa} style={c.btnEliminar}>Eliminar</button>}
          <button onClick={limparSel} style={{ ...c.limpar, marginLeft: 'auto' }}>Limpar seleção</button>
        </div>
      )}

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
          <label style={c.selTodas}>
            <input type="checkbox" checked={todasVisiveisSel} onChange={toggleTodasVisiveis} />
            Selecionar todas as visíveis ({filtradas.length})
          </label>
          {filtradas.map((l) => (
            <div key={l.id} style={{ ...c.card, display: 'flex', gap: 12, alignItems: 'flex-start', ...(sel.has(l.id) ? c.cardSel : null) }}>
              <input
                type="checkbox"
                checked={sel.has(l.id)}
                onChange={() => toggle(l.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ marginTop: 3, flexShrink: 0 }}
                aria-label={`Selecionar ${l.nome}`}
              />
              <button onClick={() => setAberta(l)} style={c.cardBtn}>
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
                  {(l.estado === 'contactada' || l.estado === 'proposta_enviada') && (
                    <span style={c.meta}>⏱ {textoNoEstado(l.estado_desde)}</span>
                  )}
                  <span style={{ ...c.meta, marginLeft: 'auto' }}>{formatarData(l.created_at)}</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {bulkModal && (
        <BulkEstadoModal
          estado={bulkModal}
          leads={selecionadas}
          responsaveis={responsaveis}
          onClose={() => setBulkModal(null)}
          onDone={async () => { setBulkModal(null); await recarregar(); limparSel() }}
        />
      )}

      {nova && (
        <NovaLeadDrawer
          onClose={() => setNova(false)}
          onCriada={(l) => {
            setLeads((prev) => [l, ...prev])
            setNova(false)
            setAberta(l)
          }}
        />
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

function NovaLeadDrawer({
  onClose, onCriada,
}: {
  onClose: () => void
  onCriada: (l: Lead) => void
}) {
  const [nome, setNome] = useState('')
  const [canal, setCanal] = useState<Lead['canal']>('email')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [interesse, setInteresse] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function guardar() {
    if (!nome.trim()) { setMsg('Indica o nome.'); return }
    setAGravar(true)
    setMsg(null)
    const { data, error } = await criarLead({
      nome: nome.trim(),
      canal,
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cidade: cidade.trim() || null,
      modelo_interesse: interesse.trim() || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      mensagem: mensagem.trim() || null,
    })
    setAGravar(false)
    if (error) { setMsg('Erro ao criar: ' + error.message); return }
    onCriada(data as Lead)
  }

  return (
    <div style={c.backdrop} onClick={onClose}>
      <div style={c.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Nova lead</h2>
          <button onClick={onClose} style={c.fechar}>✕</button>
        </div>
        <p style={{ ...c.meta, marginTop: 4 }}>Registar manualmente uma lead (email, Bimedis, telefone, referência...).</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <div>
            <label style={c.rotulo}>Nome *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do contacto" style={c.campo} />
          </div>
          <div>
            <label style={c.rotulo}>Canal</label>
            <select value={canal} onChange={(e) => setCanal(e.target.value as Lead['canal'])} style={{ ...c.select, width: '100%', marginTop: 6 }}>
              {CANAL_OPCOES.map((v) => <option key={v} value={v}>{CANAL_CONFIG[v].label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={c.rotulo}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@exemplo.com" style={c.campo} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={c.rotulo}>Telefone</label>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="9xx xxx xxx" style={c.campo} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={c.rotulo}>Cidade</label>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" style={c.campo} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={c.rotulo}>Interesse</label>
              <input value={interesse} onChange={(e) => setInteresse(e.target.value)} placeholder="Modelo / equipamento" style={c.campo} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={c.rotulo}>Data início</label>
              <input value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} type="date" style={c.campo} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={c.rotulo}>Data fim</label>
              <input value={dataFim} onChange={(e) => setDataFim(e.target.value)} type="date" style={c.campo} />
            </div>
          </div>
          <div>
            <label style={c.rotulo}>Mensagem / notas</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="O que pediu, contexto..." style={c.textarea} />
          </div>
        </div>

        {msg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button onClick={guardar} disabled={aGravar} style={c.btnPrimario}>{aGravar ? 'A criar...' : 'Criar lead'}</button>
          <button onClick={onClose} style={c.btnSecundario}>Cancelar</button>
        </div>
      </div>
    </div>
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
  const [responsavel, setResponsavel] = useState<string>(lead.responsavel_id ?? '')
  const [motivo, setMotivo] = useState(lead.motivo_perdida ?? '')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [rkEnv, setRkEnv] = useState(0)
  const [responsaveis, setResponsaveis] = useState<ResponsavelLead[]>([])
  const [historico, setHistorico] = useState<LeadStatusHistory[]>([])

  useEffect(() => {
    listarResponsaveisLeads().then(setResponsaveis)
    listarHistoricoLead(lead.id).then(setHistorico)
  }, [lead.id])

  const exigeResponsavel = ESTADOS_COM_FOLLOWUP.includes(estado)
  const exigeMotivo = estado === 'perdida'

  async function eliminar() {
    if (!confirm('Eliminar esta lead? Esta ação não pode ser anulada.')) return
    setAGravar(true)
    const { error } = await eliminarLead(lead.id)
    setAGravar(false)
    if (error) { setMsg('Erro ao eliminar: ' + error.message); return }
    onEliminado(lead.id)
  }

  async function guardar() {
    // Validações que espelham as regras da base de dados (mensagem amigável antes do erro SQL).
    if (exigeResponsavel && !responsavel) {
      setMsg('Escolhe o responsável antes de marcar como Contactada / Proposta enviada.')
      return
    }
    if (exigeMotivo && !motivo.trim()) {
      setMsg('Indica o motivo da perda.')
      return
    }
    setAGravar(true)
    setMsg(null)

    // 1) Responsável primeiro (a mudança de estado precisa dele para o follow-up).
    if ((responsavel || null) !== (lead.responsavel_id ?? null)) {
      const { error } = await definirResponsavelLead(lead.id, responsavel || null)
      if (error) { setAGravar(false); setMsg('Erro ao atribuir responsável: ' + error.message); return }
    }
    // 2) Estado (regista histórico + trata da tarefa de follow-up).
    if (estado !== lead.estado) {
      const { error } = await mudarEstadoLeads([lead.id], estado, exigeMotivo ? motivo.trim() : null)
      if (error) { setAGravar(false); setMsg('Erro ao mudar estado: ' + error.message); return }
    }
    // 3) Nota interna (campo livre).
    if ((nota.trim() || null) !== (lead.nota_interna ?? null)) {
      const { error } = await atualizarLead(lead.id, { nota_interna: nota.trim() || null })
      if (error) { setAGravar(false); setMsg('Erro ao guardar nota: ' + error.message); return }
    }

    // Recarregar a lead (estado_desde, responsável, motivo) e o histórico.
    const { data } = await supabase.from('leads').select('*').eq('id', lead.id).single()
    setAGravar(false)
    if (data) onGuardado(data as Lead)
    listarHistoricoLead(lead.id).then(setHistorico)
    setMsg('Guardado ✓')
  }

  return (
    <div style={c.backdrop} onClick={onClose}>
      <div style={c.drawer} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{lead.nome}</h2>
          <button onClick={onClose} style={c.fechar}>✕</button>
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <CanalTag canal={lead.canal} />
          {(lead.estado === 'contactada' || lead.estado === 'proposta_enviada') && (
            <span style={c.meta}>⏱ {textoNoEstado(lead.estado_desde)}</span>
          )}
        </div>

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

        {linkWhatsapp(lead.telefone) && (
          <a
            href={linkWhatsapp(lead.telefone)!}
            target="_blank"
            rel="noopener noreferrer"
            style={c.btnWhatsapp}
          >
            <span aria-hidden>💬</span> Abrir WhatsApp
          </a>
        )}

        {lead.mensagem && (
          <div style={c.mensagem}>
            <div style={c.rotulo}>Mensagem</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{lead.mensagem}</p>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <EnviarFichaLead lead={{ id: lead.id, nome: lead.nome, email: lead.email }} onEnviado={() => setRkEnv((v) => v + 1)} />
          <HistoricoEnviosLead leadId={lead.id} refreshKey={rkEnv} />
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={c.rotulo}>Responsável {exigeResponsavel && <span style={{ color: 'var(--danger)' }}>*</span>}</label>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} style={{ ...c.select, width: '100%', marginTop: 6 }}>
            <option value="">— sem responsável —</option>
            {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={c.rotulo}>Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoLead)} style={{ ...c.select, width: '100%', marginTop: 6 }}>
            {ESTADO_OPCOES.map((e) => <option key={e} value={e}>{ESTADO_CONFIG[e].label}</option>)}
          </select>
          {exigeResponsavel && (
            <p style={{ ...c.meta, marginTop: 6 }}>Ao guardar, é criada/atualizada a tarefa de follow-up para o responsável.</p>
          )}
        </div>

        {exigeMotivo && (
          <div style={{ marginTop: 14 }}>
            <label style={c.rotulo}>Motivo da perda <span style={{ color: 'var(--danger)' }}>*</span></label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Porque é que esta lead foi perdida?" style={c.textarea} />
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={c.rotulo}>Nota interna</label>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Notas da equipa..." style={c.textarea} />
        </div>

        {historico.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={c.rotulo}>Histórico de estados</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {historico.map((h) => (
                <div key={h.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted)', minWidth: 96 }}>{formatarDataHora(h.created_at)}</span>
                  <span>
                    {h.estado_anterior ? `${ESTADO_CONFIG[h.estado_anterior].label} → ` : ''}
                    <strong style={{ color: ESTADO_CONFIG[h.estado_novo].color }}>{ESTADO_CONFIG[h.estado_novo].label}</strong>
                  </span>
                  {h.ator_nome && <span style={{ color: 'var(--muted)' }}>· {h.ator_nome}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

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

// Modal de confirmação da mudança de estado em massa. Espelha as regras da BD:
// Perdida exige motivo (aplicado a todas); Contactada/Proposta exigem responsável
// em todas — se algumas não o têm, pede um responsável para as preencher antes.
function BulkEstadoModal({
  estado, leads, responsaveis, onClose, onDone,
}: {
  estado: EstadoLead
  leads: Lead[]
  responsaveis: ResponsavelLead[]
  onClose: () => void
  onDone: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [respFalta, setRespFalta] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const exigeMotivo = estado === 'perdida'
  const exigeResponsavel = ESTADOS_COM_FOLLOWUP.includes(estado)
  const semResponsavel = leads.filter((l) => !l.responsavel_id)

  async function aplicar() {
    if (exigeMotivo && !motivo.trim()) { setMsg('Indica o motivo (aplicado a todas as leads).'); return }
    if (exigeResponsavel && semResponsavel.length > 0 && !respFalta) {
      setMsg(`${semResponsavel.length} lead(s) não têm responsável. Escolhe um para lhes atribuir antes de continuar.`)
      return
    }
    setAGravar(true); setMsg(null)
    // 1) Preencher responsável nas que faltam (o follow-up precisa dele).
    if (exigeResponsavel && respFalta) {
      for (const l of semResponsavel) {
        const { error } = await definirResponsavelLead(l.id, respFalta)
        if (error) { setAGravar(false); setMsg('Erro ao atribuir responsável: ' + error.message); return }
      }
    }
    // 2) Mudar o estado de todas (regista histórico + trata do follow-up).
    const { error } = await mudarEstadoLeads(leads.map((l) => l.id), estado, exigeMotivo ? motivo.trim() : null)
    setAGravar(false)
    if (error) { setMsg('Erro ao aplicar: ' + error.message); return }
    onDone()
  }

  return (
    <div style={c.backdrop} onClick={onClose}>
      <div style={{ ...c.drawer, width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Mudar {leads.length} lead(s) para “{ESTADO_CONFIG[estado].label}”?</h2>
          <button onClick={onClose} style={c.fechar}>✕</button>
        </div>

        {exigeResponsavel && (
          <p style={{ ...c.meta, marginTop: 8 }}>Será criada/atualizada a tarefa de follow-up de cada lead para o respetivo responsável.</p>
        )}

        {exigeResponsavel && semResponsavel.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <label style={c.rotulo}>Responsável para as {semResponsavel.length} sem responsável <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select value={respFalta} onChange={(e) => setRespFalta(e.target.value)} style={{ ...c.select, width: '100%', marginTop: 6 }}>
              <option value="">— escolher —</option>
              {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </div>
        )}

        {exigeMotivo && (
          <div style={{ marginTop: 14 }}>
            <label style={c.rotulo}>Motivo da perda (aplicado a todas) <span style={{ color: 'var(--danger)' }}>*</span></label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Porque foram perdidas?" style={c.textarea} />
          </div>
        )}

        {msg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
          <button onClick={aplicar} disabled={aGravar} style={c.btnPrimario}>{aGravar ? 'A aplicar...' : `Aplicar a ${leads.length}`}</button>
          <button onClick={onClose} style={c.btnSecundario}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// Constrói o link do WhatsApp a partir de um telefone, tratando do indicativo de Portugal.
// Devolve null se não houver dígitos suficientes para um número válido.
function linkWhatsapp(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  let digitos = telefone.replace(/\D/g, '') // só dígitos: remove espaços, traços, +, ()
  if (!digitos) return null
  if (digitos.startsWith('00')) digitos = digitos.slice(2) // 00351... -> 351...
  // Número nacional sem indicativo (9 dígitos, ex.: 912345678) -> prefixa 351
  if (digitos.length === 9 && !digitos.startsWith('351')) digitos = '351' + digitos
  if (digitos.length < 8) return null // curto demais para ser um número
  return `https://wa.me/${digitos}`
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
  btnNova: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  campo: { width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  resumoLinha: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  pill: { border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  filtros: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  select: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)' },
  limpar: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0 14px', fontWeight: 600, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, width: '100%' },
  cardBtn: { flex: 1, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '100%', font: 'inherit', color: 'inherit' },
  cardSel: { borderColor: 'var(--primary)', boxShadow: '0 0 0 1px var(--primary)' },
  selTodas: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', padding: '2px 2px 4px' },
  bulkBar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--accent-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, position: 'sticky', top: 0, zIndex: 5 },
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
  btnWhatsapp: { display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 14, textDecoration: 'none', cursor: 'pointer' },
}
