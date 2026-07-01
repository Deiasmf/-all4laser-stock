'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AlugueresNav from '@/components/AlugueresNav'
import { useAuth } from '@/lib/auth'
import { listarModelos, verificarDisponibilidade } from '@/lib/disponibilidade'
import {
  listarReservas, criarReserva, atualizarEstadoReserva, eliminarReserva, listarClientesNomes,
} from '@/lib/reservas'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import {
  ESTADO_RESERVA_CONFIG, MODALIDADE_CONFIG, MODALIDADE_OPCOES,
  type Reserva, type ModeloAluguer, type Modalidade, type EstadoReserva,
} from '@/types/reserva'

function fdata(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

const colunasExport: ColunaExport<Reserva>[] = [
  { cabecalho: 'Modelo', valor: (r) => r.modelo_nome },
  { cabecalho: 'Zimmer', valor: (r) => (r.com_zimmer ? 'Sim' : 'Não') },
  { cabecalho: 'Cliente', valor: (r) => r.cliente_nome },
  { cabecalho: 'Estado', valor: (r) => ESTADO_RESERVA_CONFIG[r.estado].label },
  { cabecalho: 'Modalidade', valor: (r) => (r.modalidade ? MODALIDADE_CONFIG[r.modalidade].label : '') },
  { cabecalho: 'De', valor: (r) => fdata(r.data_inicio) },
  { cabecalho: 'Até', valor: (r) => fdata(r.data_fim) },
]

function EstadoTag({ estado }: { estado: EstadoReserva }) {
  const cfg = ESTADO_RESERVA_CONFIG[estado]
  return <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>{cfg.label}</span>
}

export default function ReservasPage() {
  const { isAdmin } = useAuth()
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [modelos, setModelos] = useState<ModeloAluguer[]>([])
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fEstado, setFEstado] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)

  async function recarregar() {
    const rs = await listarReservas()
    setReservas(rs)
  }

  useEffect(() => {
    Promise.all([listarReservas(), listarModelos(), listarClientesNomes()])
      .then(([rs, ms, cs]) => { setReservas(rs); setModelos(ms); setClientes(cs) })
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false))
  }, [])

  const filtradas = useMemo(
    () => reservas.filter((r) => !fEstado || r.estado === fEstado),
    [reservas, fEstado]
  )

  async function mudarEstado(id: string, estado: EstadoReserva) {
    await atualizarEstadoReserva(id, estado)
    setReservas((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar esta reserva?')) return
    await eliminarReserva(id)
    setReservas((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Reservas</h1>
        <Link href="/alugueres/lista" style={c.voltar}>← Alugueres</Link>
      </div>
      <AlugueresNav />

      <div style={c.barra}>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {(Object.keys(ESTADO_RESERVA_CONFIG) as EstadoReserva[]).map((e) => (
            <option key={e} value={e}>{ESTADO_RESERVA_CONFIG[e].label}</option>
          ))}
        </select>
        <button onClick={() => setMostrarForm((v) => !v)} style={c.btnPrimario}>
          {mostrarForm ? 'Fechar' : '+ Nova reserva'}
        </button>
        <BotaoExportar nome="reservas" colunas={colunasExport} linhas={filtradas} />
      </div>

      {mostrarForm && (
        <FormReserva
          modelos={modelos}
          clientes={clientes}
          onCriada={async () => { await recarregar(); setMostrarForm(false) }}
        />
      )}

      {erro ? (
        <p style={{ ...c.estado, color: 'var(--danger)' }}>Erro ao carregar.</p>
      ) : carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtradas.length === 0 ? (
        <p style={c.estado}>Sem reservas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map((r) => (
            <div key={r.id} style={c.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontWeight: 700 }}>{r.modelo_nome}{r.com_zimmer && <span style={c.packTag}>+ Zimmer</span>}</span>
                <EstadoTag estado={r.estado} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
                <span>👤 {r.cliente_nome ?? '—'}</span>
                <span>📅 {fdata(r.data_inicio)} – {fdata(r.data_fim)}</span>
                {r.modalidade && <span>⏱ {MODALIDADE_CONFIG[r.modalidade].label}</span>}
              </div>
              <div style={c.acoes}>
                {r.estado === 'pendente_validacao' && (
                  <button onClick={() => mudarEstado(r.id, 'confirmada')} style={c.btnOk}>Validar</button>
                )}
                {(r.estado === 'pendente_validacao' || r.estado === 'confirmada') && (
                  <button onClick={() => mudarEstado(r.id, 'cancelada')} style={c.btnGhost}>Cancelar</button>
                )}
                {r.estado === 'confirmada' && (
                  <button onClick={() => mudarEstado(r.id, 'concluida')} style={c.btnGhost}>Concluir</button>
                )}
                {isAdmin && <button onClick={() => eliminar(r.id)} style={c.btnDanger}>Eliminar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

function FormReserva({
  modelos, clientes, onCriada,
}: {
  modelos: ModeloAluguer[]
  clientes: { id: string; nome: string }[]
  onCriada: () => void
}) {
  const [modeloId, setModeloId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [modalidade, setModalidade] = useState<Modalidade | ''>('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [nota, setNota] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const modelo = modelos.find((m) => m.id === modeloId)

  async function gravar() {
    setMsg(null)
    if (!modelo) return setMsg('Escolhe um modelo.')
    if (!clienteNome.trim()) return setMsg('Indica o cliente.')
    if (!inicio || !fim) return setMsg('Indica as datas.')
    if (fim < inicio) return setMsg('A data de fim não pode ser anterior à de início.')

    setAGravar(true)
    const disp = await verificarDisponibilidade(modelo, inicio, fim)
    if (!disp.disponivel) {
      setAGravar(false)
      return setMsg(
        disp.requerZimmer && disp.laserDisponiveis > 0 && disp.zimmerDisponiveis <= 0
          ? 'Sem Zimmer Cryo 6 disponível para o pack nesse período.'
          : 'Sem disponibilidade deste modelo nesse período.'
      )
    }
    const cliente = clientes.find((cl) => cl.nome.toLowerCase() === clienteNome.trim().toLowerCase())
    const { error } = await criarReserva({
      modelo_id: modelo.id,
      modelo_nome: modelo.nome,
      cliente_id: cliente?.id ?? null,
      cliente_nome: clienteNome.trim(),
      modalidade: modalidade || null,
      data_inicio: inicio,
      data_fim: fim,
      com_zimmer: modelo.requer_zimmer,
      estado: 'confirmada',
      nota: nota.trim() || null,
    })
    setAGravar(false)
    if (error) return setMsg('Erro: ' + error.message)
    onCriada()
  }

  return (
    <div style={c.form}>
      <div style={c.linha}>
        <div style={c.campo}>
          <label style={c.lbl}>Modelo</label>
          <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} style={c.input}>
            <option value="">— Modelo —</option>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.requer_zimmer ? ' (pack)' : ''}</option>)}
          </select>
        </div>
        <div style={c.campo}>
          <label style={c.lbl}>Cliente</label>
          <input list="lista-clientes" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} style={c.input} placeholder="Nome do cliente" />
          <datalist id="lista-clientes">
            {clientes.map((cl) => <option key={cl.id} value={cl.nome} />)}
          </datalist>
        </div>
      </div>
      <div style={c.linha}>
        <div style={c.campo}>
          <label style={c.lbl}>De</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={c.input} />
        </div>
        <div style={c.campo}>
          <label style={c.lbl}>Até</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} style={c.input} />
        </div>
        <div style={c.campo}>
          <label style={c.lbl}>Modalidade</label>
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade | '')} style={c.input}>
            <option value="">—</option>
            {MODALIDADE_OPCOES.map((m) => <option key={m} value={m}>{MODALIDADE_CONFIG[m].label}</option>)}
          </select>
        </div>
      </div>
      {modelo?.requer_zimmer && <p style={c.notaPack}>📦 Inclui {`Zimmer Cryo 6`} (pack).</p>}
      <div style={c.campo}>
        <label style={c.lbl}>Nota (opcional)</label>
        <input value={nota} onChange={(e) => setNota(e.target.value)} style={c.input} />
      </div>
      {msg && <div style={c.msg}>{msg}</div>}
      <button onClick={gravar} disabled={aGravar} style={c.btnPrimario}>{aGravar ? 'A verificar...' : 'Criar reserva'}</button>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  barra: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  packTag: { marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)', background: 'var(--accent-bg)', borderRadius: 999, padding: '1px 8px' },
  acoes: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  form: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 },
  linha: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 150 },
  lbl: { fontSize: 13, fontWeight: 600 },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--foreground)', width: '100%' },
  notaPack: { fontSize: 13, background: 'var(--accent-bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 },
  msg: { background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600, marginBottom: 12 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnOk: { background: '#00A87A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { background: 'var(--surface)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' },
}
