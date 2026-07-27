'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarClientesPicker, formatarEuro, formatarData, type EntidadeOpc } from '@/lib/contasCorrentes'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import {
  listarCobrancas, criarCobranca, atualizarCobranca, apagarCobranca,
  ESTADOS_COBRANCA, estadoCobrancaInfo, type Cobranca, type EstadoCobranca,
  listarRecolhas, criarRecolha, atualizarRecolha, mudarEstadoRecolha, apagarRecolha,
  ESTADOS_RECOLHA, estadoRecolhaInfo, MOTIVOS_RECOLHA, motivoRecolhaLabel,
  listarEventosRecolha, listarFotosRecolha, carregarFotosRecolha, urlFotoRecolha, removerFotoRecolha,
  pesquisarEquipamentos, STATUS_INVENTARIO_RECOLHA, definirStatusEquipamento,
  type RecolhaEquip, type EstadoRecolha, type MotivoRecolha, type RecolhaInput,
  type RecolhaEvento, type RecolhaFoto, type EquipOpc,
} from '@/lib/recolhas'

function parseNum(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return isNaN(n) || n < 0 ? null : n
}

export default function RecolhasPage() {
  const [tab, setTab] = useState<'cobrancas' | 'equipamentos'>('cobrancas')
  const [clientes, setClientes] = useState<EntidadeOpc[]>([])
  useEffect(() => { listarClientesPicker().then(setClientes) }, [])

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>💰 Recolhas</h1>
          <p style={c.sub}>Cobranças a clientes e recolha de equipamentos.</p>
        </div>
      </div>

      <div style={c.tabs}>
        <button style={{ ...c.tab, ...(tab === 'cobrancas' ? c.tabAtiva : {}) }} onClick={() => setTab('cobrancas')}>Cobranças</button>
        <button style={{ ...c.tab, ...(tab === 'equipamentos' ? c.tabAtiva : {}) }} onClick={() => setTab('equipamentos')}>Recolha de equipamentos</button>
      </div>

      {tab === 'cobrancas' ? <CobrancasTab clientes={clientes} /> : <RecolhasTab clientes={clientes} />}
    </main>
  )
}

// ─── Cobranças ───────────────────────────────────────────────────────────────

function CobrancasTab({ clientes }: { clientes: EntidadeOpc[] }) {
  const { perfil, isAdmin } = useAuth()
  const [itens, setItens] = useState<Cobranca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [aberto, setAberto] = useState(false)
  // novo
  const [clienteId, setClienteId] = useState('')
  const [valor, setValor] = useState('')
  const [estado, setEstado] = useState<EstadoCobranca>('pendente')
  const [promessa, setPromessa] = useState('')
  const [notas, setNotas] = useState('')

  const carregar = useCallback(async () => {
    setItens(await listarCobrancas(filtro ? (filtro as EstadoCobranca) : undefined))
    setCarregando(false)
  }, [filtro])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function guardar() {
    const nome = clientes.find((x) => x.id === clienteId)?.nome ?? null
    await criarCobranca(
      { cliente_id: clienteId || null, cliente_nome: nome, valor: parseNum(valor), estado, data_promessa: promessa || null, notas: notas.trim() || null },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
    )
    setClienteId(''); setValor(''); setEstado('pendente'); setPromessa(''); setNotas(''); setAberto(false)
    await carregar()
  }
  async function mudar(id: string, patch: Partial<Cobranca>) { await atualizarCobranca(id, patch); await carregar() }
  async function remover(id: string) { if (confirm('Apagar esta cobrança?')) { await apagarCobranca(id); await carregar() } }

  return (
    <>
      <div style={c.barra}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_COBRANCA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <span style={c.contagem}>{itens.length} cobrança(s)</span>
        <button style={c.btnPrimario} onClick={() => setAberto((v) => !v)}>{aberto ? 'Cancelar' : '+ Nova cobrança'}</button>
      </div>

      {aberto && (
        <div style={c.form}>
          <div style={c.grelha}>
            <label style={c.campo}><span style={c.rot}>Cliente</span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={c.input}>
                <option value="">— escolher —</option>
                {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
              </select>
            </label>
            <label style={c.campo}><span style={c.rot}>Valor <span style={c.opc}>(opcional)</span></span>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" style={c.input} />
            </label>
            <label style={c.campo}><span style={c.rot}>Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCobranca)} style={c.input}>
                {ESTADOS_COBRANCA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </select>
            </label>
            <label style={c.campo}><span style={c.rot}>Promessa de pagamento <span style={c.opc}>(opcional)</span></span>
              <input type="date" value={promessa} onChange={(e) => setPromessa(e.target.value)} style={c.input} />
            </label>
          </div>
          <label style={c.campo}><span style={c.rot}>Notas <span style={c.opc}>(opcional)</span></span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 54, resize: 'vertical' }} />
          </label>
          <button style={{ ...c.btnPrimario, alignSelf: 'flex-start' }} disabled={!clienteId} onClick={guardar}>Guardar cobrança</button>
        </div>
      )}

      {carregando ? <p style={c.estado}>A carregar...</p> : itens.length === 0 ? <p style={c.estado}>Sem cobranças.</p> : (
        <div style={c.tabela}>
          <div style={{ ...c.linhaCob, ...c.cab }}>
            <span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Estado</span><span>Promessa</span><span>Notas</span><span></span>
          </div>
          {itens.map((it) => {
            const i = estadoCobrancaInfo(it.estado)
            return (
              <div key={it.id} style={c.linhaCob}>
                <span style={{ fontWeight: 600 }}>{it.cliente_nome ?? '—'}</span>
                <span style={{ textAlign: 'right' }}>{it.valor != null ? formatarEuro(it.valor) : '—'}</span>
                <span>
                  <select value={it.estado} onChange={(e) => mudar(it.id, { estado: e.target.value as EstadoCobranca })} style={{ ...c.miniSelect, color: i.cor, background: i.bg }}>
                    {ESTADOS_COBRANCA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                  </select>
                </span>
                <span><input type="date" defaultValue={it.data_promessa ?? ''} onBlur={(e) => mudar(it.id, { data_promessa: e.target.value || null })} style={c.miniInput} /></span>
                <span><input defaultValue={it.notas ?? ''} placeholder="—" onBlur={(e) => mudar(it.id, { notas: e.target.value.trim() || null })} style={c.miniInput} /></span>
                <span style={{ textAlign: 'right' }}>{isAdmin && <button style={c.remover} onClick={() => remover(it.id)} title="Apagar">✕</button>}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Recolha de equipamentos ─────────────────────────────────────────────────

type Autor = { id: string | null; nome: string | null }

type FormRecolha = {
  descricao: string
  equipamentoId: string
  equipamentoLabel: string
  equipRef: string
  motivo: '' | MotivoRecolha
  clienteId: string
  morada: string
  prevista: string
  estado: EstadoRecolha
  transportadora: string
  responsavel: string
  custos: string
  condicao: string
  notas: string
}

const FORM_VAZIO: FormRecolha = {
  descricao: '', equipamentoId: '', equipamentoLabel: '', equipRef: '', motivo: '',
  clienteId: '', morada: '', prevista: '', estado: 'a_agendar', transportadora: '',
  responsavel: '', custos: '', condicao: '', notas: '',
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function estaAtrasada(it: RecolhaEquip): boolean {
  if (!it.data_prevista) return false
  if (!['a_agendar', 'agendada', 'em_transporte'].includes(it.estado)) return false
  return it.data_prevista < new Date().toISOString().slice(0, 10)
}

function RecolhasTab({ clientes }: { clientes: EntidadeOpc[] }) {
  const { perfil, isAdmin } = useAuth()
  const [itens, setItens] = useState<RecolhaEquip[]>([])
  const [carregando, setCarregando] = useState(true)
  const [fEstado, setFEstado] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormRecolha>(FORM_VAZIO)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const set = <K extends keyof FormRecolha>(k: K, v: FormRecolha[K]) => setForm((f) => ({ ...f, [k]: v }))
  const autor: Autor = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }

  const carregar = useCallback(async () => {
    setItens(await listarRecolhas({
      estado: fEstado ? (fEstado as EstadoRecolha) : undefined,
      clienteId: fCliente || undefined,
      de: fDe || undefined,
      ate: fAte || undefined,
    }))
    setCarregando(false)
  }, [fEstado, fCliente, fDe, fAte])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const draft = useFormDraft<FormRecolha>('recolha:nova', form, (d) => setForm(d), {
    enabled: aberto && !editId, emptyState: FORM_VAZIO,
  })

  function abrirNovo() { setEditId(null); setForm(FORM_VAZIO); setAberto(true) }
  function abrirEditar(it: RecolhaEquip) {
    setEditId(it.id)
    setForm({
      descricao: it.descricao ?? '', equipamentoId: it.equipamento_id ?? '',
      equipamentoLabel: it.equipamento_id ? (it.equipamento_ref ?? '') : '', equipRef: it.equipamento_id ? '' : (it.equipamento_ref ?? ''),
      motivo: (it.motivo ?? '') as '' | MotivoRecolha, clienteId: it.cliente_id ?? '',
      morada: it.morada ?? '', prevista: it.data_prevista ?? '', estado: it.estado,
      transportadora: it.transportadora ?? '', responsavel: it.responsavel_nome ?? '',
      custos: it.custos != null ? String(it.custos) : '', condicao: it.condicao_chegada ?? '',
      notas: it.notas ?? '',
    })
    setAberto(true)
  }
  function fechar() { setAberto(false); setEditId(null); setForm(FORM_VAZIO) }

  async function guardar() {
    const nome = clientes.find((x) => x.id === form.clienteId)?.nome ?? null
    const payload: RecolhaInput = {
      descricao: form.descricao.trim() || null,
      equipamento_id: form.equipamentoId || null,
      equipamento_ref: (form.equipamentoId ? form.equipamentoLabel : form.equipRef).trim() || null,
      motivo: form.motivo || null,
      cliente_id: form.clienteId || null,
      origem_nome: nome,
      morada: form.morada.trim() || null,
      data_prevista: form.prevista || null,
      estado: form.estado,
      transportadora: form.transportadora.trim() || null,
      responsavel_nome: form.responsavel.trim() || null,
      custos: parseNum(form.custos),
      condicao_chegada: form.condicao.trim() || null,
      notas: form.notas.trim() || null,
    }
    if (editId) await atualizarRecolha(editId, payload)
    else await criarRecolha(payload, autor)
    draft.limpar()
    fechar()
    await carregar()
  }

  async function remover(id: string) {
    if (confirm('Apagar esta recolha? Esta ação não pode ser desfeita.')) {
      await apagarRecolha(id)
      if (detalheId === id) setDetalheId(null)
      await carregar()
    }
  }

  const temFiltros = fEstado || fCliente || fDe || fAte
  const podeGuardar = form.descricao.trim() || form.equipamentoLabel.trim() || form.equipRef.trim()

  return (
    <>
      <div style={c.barra}>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_RECOLHA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} style={c.input}>
          <option value="">Todos os clientes</option>
          {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
        </select>
        <label style={c.periodo}>De <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} style={c.miniInput} /></label>
        <label style={c.periodo}>Até <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} style={c.miniInput} /></label>
        {temFiltros && <button style={c.limpar} onClick={() => { setFEstado(''); setFCliente(''); setFDe(''); setFAte('') }}>Limpar</button>}
        <span style={c.contagem}>{itens.length} recolha(s)</span>
        <button style={c.btnPrimario} onClick={() => (aberto ? fechar() : abrirNovo())}>{aberto ? 'Cancelar' : '+ Nova recolha'}</button>
      </div>

      {aberto && (
        <div style={c.form}>
          {!editId && draft.rascunhoRecuperado && <RascunhoAviso onDescartar={draft.descartar} />}
          <RecolhaFormFields form={form} set={set} clientes={clientes} />
          <button style={{ ...c.btnPrimario, alignSelf: 'flex-start' }} disabled={!podeGuardar} onClick={guardar}>
            {editId ? 'Guardar alterações' : 'Guardar recolha'}
          </button>
        </div>
      )}

      {carregando ? <p style={c.estado}>A carregar...</p> : itens.length === 0 ? <p style={c.estado}>Sem recolhas.</p> : (
        <div style={c.lista}>
          {itens.map((it) => (
            <RecolhaItem key={it.id} it={it} autor={autor}
              aberto={detalheId === it.id}
              onToggle={() => setDetalheId((v) => (v === it.id ? null : it.id))}
              onEditar={() => abrirEditar(it)}
              onRemover={isAdmin ? () => remover(it.id) : undefined}
              onMudou={carregar}
            />
          ))}
        </div>
      )}
    </>
  )
}

function RecolhaItem({ it, aberto, autor, onToggle, onEditar, onRemover, onMudou }: {
  it: RecolhaEquip; aberto: boolean; autor: Autor
  onToggle: () => void; onEditar: () => void; onRemover?: () => void; onMudou: () => Promise<void>
}) {
  const info = estadoRecolhaInfo(it.estado)
  const atrasada = estaAtrasada(it)
  const titulo = it.descricao || it.equipamento_ref || 'Recolha'
  return (
    <div style={c.card}>
      <div style={c.cardTopo} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={c.cardTitulo}>
            {titulo}
            {atrasada && <span style={c.badgeAtraso}>⚠ Atrasada</span>}
          </div>
          <div style={c.cardMeta}>
            {it.origem_nome && <span>{it.origem_nome}</span>}
            {it.motivo && <span>· {motivoRecolhaLabel(it.motivo)}</span>}
            {it.data_prevista && <span>· prevista {formatarData(it.data_prevista)}</span>}
          </div>
        </div>
        <span style={{ ...c.pill, color: info.cor, background: info.bg }}>{info.label}</span>
        <span style={c.chevron}>{aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && <DetalheRecolha it={it} autor={autor} onEditar={onEditar} onRemover={onRemover} onMudou={onMudou} />}
    </div>
  )
}

function DetalheRecolha({ it, autor, onEditar, onRemover, onMudou }: {
  it: RecolhaEquip; autor: Autor; onEditar: () => void; onRemover?: () => void; onMudou: () => Promise<void>
}) {
  const [eventos, setEventos] = useState<RecolhaEvento[]>([])
  const [fotos, setFotos] = useState<RecolhaFoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [aEnviar, setAEnviar] = useState(false)
  const [novoStatus, setNovoStatus] = useState(STATUS_INVENTARIO_RECOLHA[0])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    setEventos(await listarEventosRecolha(it.id))
    const fs = await listarFotosRecolha(it.id)
    setFotos(fs)
    const mapa: Record<string, string> = {}
    for (const f of fs) { const u = await urlFotoRecolha(f.caminho); if (u) mapa[f.id] = u }
    setUrls(mapa)
  }, [it.id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function mudarEstado(estado: EstadoRecolha) {
    const extra = estado === 'recolhido' && !it.data_recolha
      ? { data_recolha: new Date().toISOString().slice(0, 10) } : undefined
    await mudarEstadoRecolha(it.id, estado, autor, { extra })
    await onMudou()
    await recarregar()
  }

  async function enviarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setAEnviar(true)
    const r = await carregarFotosRecolha(it.id, Array.from(files), autor.id)
    setAEnviar(false)
    if (r.falhas.length) alert(`${r.falhas.length} foto(s) não carregaram: ${r.falhas.join(', ')}`)
    await recarregar()
  }
  async function apagarFoto(f: RecolhaFoto) {
    if (!confirm('Apagar esta foto?')) return
    await removerFotoRecolha(f.id, f.caminho)
    await recarregar()
  }

  async function aplicarStatus() {
    if (!it.equipamento_id) return
    const { error } = await definirStatusEquipamento(it.equipamento_id, novoStatus)
    setStatusMsg(error ? `Erro: ${error.message}` : `Inventário atualizado para "${novoStatus}" ✓`)
  }

  const mostrarInventario = it.equipamento_id && (it.estado === 'recolhido' || it.estado === 'inspecionado')

  return (
    <div style={c.detalhe}>
      <div style={c.linhaAcoes}>
        <span style={c.rot}>Estado</span>
        <select value={it.estado} onChange={(e) => mudarEstado(e.target.value as EstadoRecolha)} style={c.input}>
          {ESTADOS_RECOLHA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <button style={c.btnSec} onClick={onEditar}>Editar</button>
        {onRemover && <button style={c.btnPerigo} onClick={onRemover}>Apagar</button>}
      </div>

      <div style={c.fichaGrid}>
        <Campo label="Equipamento" valor={it.equipamento_ref} />
        <Campo label="Motivo" valor={it.motivo ? motivoRecolhaLabel(it.motivo) : null} />
        <Campo label="Origem (cliente)" valor={it.origem_nome} />
        <Campo label="Local de recolha" valor={it.morada} />
        <Campo label="Data prevista" valor={formatarData(it.data_prevista)} />
        <Campo label="Data efetiva" valor={formatarData(it.data_recolha)} />
        <Campo label="Transportadora / responsável" valor={[it.transportadora, it.responsavel_nome].filter(Boolean).join(' · ') || null} />
        <Campo label="Custos" valor={it.custos != null ? formatarEuro(it.custos) : null} />
      </div>
      {it.notas && <div style={c.notasBox}><strong>Notas:</strong> {it.notas}</div>}

      {mostrarInventario && (
        <div style={c.inventario}>
          <div style={c.rot}>📦 Atualizar inventário do equipamento</div>
          <div style={c.linhaAcoes}>
            <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)} style={c.input}>
              {STATUS_INVENTARIO_RECOLHA.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button style={c.btnPrimario} onClick={aplicarStatus}>Aplicar status</button>
          </div>
          {statusMsg && <span style={c.msg}>{statusMsg}</span>}
        </div>
      )}

      <div>
        <div style={c.rot}>Condição à chegada</div>
        <textarea defaultValue={it.condicao_chegada ?? ''} placeholder="Descreve o estado do equipamento à chegada…"
          onBlur={async (e) => {
            const v = e.target.value.trim() || null
            if (v !== (it.condicao_chegada ?? null)) { await atualizarRecolha(it.id, { condicao_chegada: v }); await onMudou() }
          }}
          style={{ ...c.input, minHeight: 54, resize: 'vertical', marginTop: 4 }} />
        <div style={c.fotos}>
          {fotos.map((f) => (
            <div key={f.id} style={c.foto}>
              {urls[f.id]
                ? <img src={urls[f.id]} alt={f.nome ?? ''} style={c.fotoImg} />
                : <div style={c.fotoPh}>…</div>}
              <button style={c.fotoX} onClick={() => apagarFoto(f)} title="Apagar">✕</button>
            </div>
          ))}
          <label style={c.upload}>
            {aEnviar ? 'A enviar…' : '+ Fotos'}
            <input type="file" accept="image/*" multiple hidden disabled={aEnviar} onChange={(e) => enviarFotos(e.target.files)} />
          </label>
        </div>
      </div>

      <div>
        <div style={c.rot}>Histórico de estados</div>
        {eventos.length === 0 ? <p style={c.muted}>Sem registos.</p> : (
          <ol style={c.timeline}>
            {eventos.map((ev) => {
              const i = estadoRecolhaInfo(ev.estado)
              return (
                <li key={ev.id} style={c.tlItem}>
                  <span style={{ ...c.tlDot, background: i.cor }} />
                  <div>
                    <span style={{ ...c.pill, color: i.cor, background: i.bg }}>{i.label}</span>
                    <span style={c.tlMeta}>{formatarDataHora(ev.created_at)}{ev.por_nome ? ` · ${ev.por_nome}` : ''}</span>
                    {ev.nota && <div style={c.tlNota}>{ev.nota}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div style={c.campoView}>
      <span style={c.campoLabel}>{label}</span>
      <span style={c.campoValor}>{valor || '—'}</span>
    </div>
  )
}

function RecolhaFormFields({ form, set, clientes }: {
  form: FormRecolha
  set: <K extends keyof FormRecolha>(k: K, v: FormRecolha[K]) => void
  clientes: EntidadeOpc[]
}) {
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<EquipOpc[]>([])
  useEffect(() => {
    let vivo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (busca.trim().length < 2) { setOpcoes([]); return }
    pesquisarEquipamentos(busca).then((r) => { if (vivo) setOpcoes(r) })
    return () => { vivo = false }
  }, [busca])

  return (
    <>
      <div style={c.grelha}>
        <label style={c.campo}><span style={c.rot}>Descrição</span>
          <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="O que recolher" style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Motivo</span>
          <select value={form.motivo} onChange={(e) => set('motivo', e.target.value as FormRecolha['motivo'])} style={c.input}>
            <option value="">— escolher —</option>
            {MOTIVOS_RECOLHA.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </select>
        </label>
        <label style={c.campo}><span style={c.rot}>Origem (cliente) <span style={c.opc}>(opcional)</span></span>
          <select value={form.clienteId} onChange={(e) => set('clienteId', e.target.value)} style={c.input}>
            <option value="">— escolher —</option>
            {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
          </select>
        </label>
        <label style={c.campo}><span style={c.rot}>Data prevista <span style={c.opc}>(opcional)</span></span>
          <input type="date" value={form.prevista} onChange={(e) => set('prevista', e.target.value)} style={c.input} />
        </label>
      </div>

      <label style={c.campo}><span style={c.rot}>Equipamento no inventário <span style={c.opc}>(opcional — liga à ficha)</span></span>
        {form.equipamentoId ? (
          <div style={c.equipSel}>
            <span>🔗 {form.equipamentoLabel || 'Equipamento ligado'}</span>
            <button type="button" style={c.btnSec} onClick={() => { set('equipamentoId', ''); set('equipamentoLabel', '') }}>Remover</button>
          </div>
        ) : (
          <>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar modelo ou nº série…" style={c.input} />
            {opcoes.length > 0 && (
              <div style={c.opcoes}>
                {opcoes.map((o) => {
                  const label = `${o.modelo ?? '—'} · ${o.serial_number ?? 's/ série'}${o.ano ? ` · ${o.ano}` : ''}`
                  return <button key={o.id} type="button" style={c.opcao}
                    onClick={() => { set('equipamentoId', o.id); set('equipamentoLabel', label); setBusca(''); setOpcoes([]) }}>{label}</button>
                })}
              </div>
            )}
          </>
        )}
      </label>

      <label style={c.campo}><span style={c.rot}>Referência livre do equipamento <span style={c.opc}>(se não estiver no inventário)</span></span>
        <input value={form.equipRef} onChange={(e) => set('equipRef', e.target.value)} placeholder="ex.: Gmax Pro · SN123" style={c.input} disabled={!!form.equipamentoId} />
      </label>

      <div style={c.grelha}>
        <label style={c.campo}><span style={c.rot}>Local de recolha <span style={c.opc}>(opcional)</span></span>
          <input value={form.morada} onChange={(e) => set('morada', e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Transportadora <span style={c.opc}>(opcional)</span></span>
          <input value={form.transportadora} onChange={(e) => set('transportadora', e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Responsável <span style={c.opc}>(opcional)</span></span>
          <input value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Custos associados <span style={c.opc}>(opcional)</span></span>
          <input inputMode="decimal" value={form.custos} onChange={(e) => set('custos', e.target.value)} placeholder="0,00" style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Estado</span>
          <select value={form.estado} onChange={(e) => set('estado', e.target.value as EstadoRecolha)} style={c.input}>
            {ESTADOS_RECOLHA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <label style={c.campo}><span style={c.rot}>Notas <span style={c.opc}>(opcional)</span></span>
        <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} style={{ ...c.input, minHeight: 54, resize: 'vertical' }} />
      </label>
    </>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1050, margin: '0 auto', padding: 20 },
  topo: { marginBottom: 12 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: { padding: '8px 18px', border: '1px solid var(--border)', background: '#fff', borderRadius: 999, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  barra: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  contagem: { color: 'var(--muted)', fontSize: 13, flex: 1 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linhaCob: { display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1.4fr 1.1fr 1.6fr 0.4fr', gap: 8, padding: '9px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 760 },
  linhaRec: { display: 'grid', gridTemplateColumns: '1.8fr 1.3fr 1fr 1.2fr 1.1fr 0.4fr', gap: 8, padding: '9px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 820 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  subtexto: { color: 'var(--muted)', fontSize: 12 },
  miniSelect: { padding: '4px 8px', border: 'none', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  miniInput: { width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit', fontSize: 12.5, boxSizing: 'border-box' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  remover: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  // filtros de recolhas
  periodo: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' },
  limpar: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' },
  // lista em cartões
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  cardTopo: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' },
  cardTitulo: { fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardMeta: { color: 'var(--muted)', fontSize: 12.5, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  badgeAtraso: { color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, fontWeight: 700 },
  pill: { padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  chevron: { color: 'var(--muted)', fontSize: 11 },
  // detalhe
  detalhe: { borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, background: '#fafafa' },
  linhaAcoes: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPerigo: { background: '#fff', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  fichaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  campoView: { display: 'flex', flexDirection: 'column', gap: 2 },
  campoLabel: { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 },
  campoValor: { fontSize: 13.5 },
  notasBox: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  inventario: { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  msg: { fontSize: 12.5, color: 'var(--muted)' },
  // fotos
  fotos: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  foto: { position: 'relative', width: 84, height: 84, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' },
  fotoImg: { width: '100%', height: '100%', objectFit: 'cover' },
  fotoPh: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', background: '#f2f2f2' },
  fotoX: { position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: '20px', padding: 0 },
  upload: { width: 84, height: 84, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', textAlign: 'center' },
  // timeline
  timeline: { listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  tlItem: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  tlDot: { width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0 },
  tlMeta: { color: 'var(--muted)', fontSize: 12, marginLeft: 8 },
  tlNota: { fontSize: 13, marginTop: 3 },
  // picker de equipamento
  equipSel: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  opcoes: { display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginTop: 4 },
  opcao: { textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid #f2f2f2', padding: '8px 12px', cursor: 'pointer', font: 'inherit', fontSize: 13 },
}
