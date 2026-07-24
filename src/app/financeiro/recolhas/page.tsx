'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarClientesPicker, formatarEuro, formatarData, type EntidadeOpc } from '@/lib/contasCorrentes'
import {
  listarCobrancas, criarCobranca, atualizarCobranca, apagarCobranca,
  ESTADOS_COBRANCA, estadoCobrancaInfo, type Cobranca, type EstadoCobranca,
  listarRecolhas, criarRecolha, atualizarRecolha, apagarRecolha,
  ESTADOS_RECOLHA, estadoRecolhaInfo, type RecolhaEquip, type EstadoRecolha,
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

function RecolhasTab({ clientes }: { clientes: EntidadeOpc[] }) {
  const { perfil, isAdmin } = useAuth()
  const [itens, setItens] = useState<RecolhaEquip[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [equipRef, setEquipRef] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [morada, setMorada] = useState('')
  const [prevista, setPrevista] = useState('')
  const [estado, setEstado] = useState<EstadoRecolha>('agendada')
  const [notas, setNotas] = useState('')

  const carregar = useCallback(async () => {
    setItens(await listarRecolhas(filtro ? (filtro as EstadoRecolha) : undefined))
    setCarregando(false)
  }, [filtro])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function guardar() {
    const nome = clientes.find((x) => x.id === clienteId)?.nome ?? null
    await criarRecolha(
      { descricao: descricao.trim() || null, equipamento_ref: equipRef.trim() || null, cliente_id: clienteId || null, origem_nome: nome, morada: morada.trim() || null, data_prevista: prevista || null, estado, notas: notas.trim() || null },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
    )
    setDescricao(''); setEquipRef(''); setClienteId(''); setMorada(''); setPrevista(''); setEstado('agendada'); setNotas(''); setAberto(false)
    await carregar()
  }
  async function mudar(id: string, patch: Partial<RecolhaEquip>) { await atualizarRecolha(id, patch); await carregar() }
  async function remover(id: string) { if (confirm('Apagar esta recolha?')) { await apagarRecolha(id); await carregar() } }

  return (
    <>
      <div style={c.barra}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_RECOLHA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <span style={c.contagem}>{itens.length} recolha(s)</span>
        <button style={c.btnPrimario} onClick={() => setAberto((v) => !v)}>{aberto ? 'Cancelar' : '+ Nova recolha'}</button>
      </div>

      {aberto && (
        <div style={c.form}>
          <div style={c.grelha}>
            <label style={c.campo}><span style={c.rot}>Descrição</span>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que recolher" style={c.input} />
            </label>
            <label style={c.campo}><span style={c.rot}>Equipamento <span style={c.opc}>(modelo / nº série)</span></span>
              <input value={equipRef} onChange={(e) => setEquipRef(e.target.value)} placeholder="ex.: Gmax Pro · SN123" style={c.input} />
            </label>
            <label style={c.campo}><span style={c.rot}>Origem (cliente) <span style={c.opc}>(opcional)</span></span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={c.input}>
                <option value="">— escolher —</option>
                {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
              </select>
            </label>
            <label style={c.campo}><span style={c.rot}>Data prevista <span style={c.opc}>(opcional)</span></span>
              <input type="date" value={prevista} onChange={(e) => setPrevista(e.target.value)} style={c.input} />
            </label>
          </div>
          <label style={c.campo}><span style={c.rot}>Morada de recolha <span style={c.opc}>(opcional)</span></span>
            <input value={morada} onChange={(e) => setMorada(e.target.value)} style={c.input} />
          </label>
          <label style={c.campo}><span style={c.rot}>Notas <span style={c.opc}>(opcional)</span></span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 54, resize: 'vertical' }} />
          </label>
          <button style={{ ...c.btnPrimario, alignSelf: 'flex-start' }} disabled={!descricao.trim() && !equipRef.trim()} onClick={guardar}>Guardar recolha</button>
        </div>
      )}

      {carregando ? <p style={c.estado}>A carregar...</p> : itens.length === 0 ? <p style={c.estado}>Sem recolhas.</p> : (
        <div style={c.tabela}>
          <div style={{ ...c.linhaRec, ...c.cab }}>
            <span>Equipamento</span><span>Origem</span><span>Prevista</span><span>Estado</span><span>Recolhido</span><span></span>
          </div>
          {itens.map((it) => {
            const i = estadoRecolhaInfo(it.estado)
            return (
              <div key={it.id} style={c.linhaRec}>
                <span>
                  <span style={{ fontWeight: 600 }}>{it.descricao ?? it.equipamento_ref ?? '—'}</span>
                  {it.equipamento_ref && it.descricao && <span style={c.subtexto}> · {it.equipamento_ref}</span>}
                </span>
                <span style={c.muted}>{it.origem_nome ?? '—'}</span>
                <span style={c.muted}>{formatarData(it.data_prevista)}</span>
                <span>
                  <select value={it.estado} onChange={(e) => mudar(it.id, { estado: e.target.value as EstadoRecolha })} style={{ ...c.miniSelect, color: i.cor, background: i.bg }}>
                    {ESTADOS_RECOLHA.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                  </select>
                </span>
                <span><input type="date" defaultValue={it.data_recolha ?? ''} onBlur={(e) => mudar(it.id, { data_recolha: e.target.value || null })} style={c.miniInput} /></span>
                <span style={{ textAlign: 'right' }}>{isAdmin && <button style={c.remover} onClick={() => remover(it.id)} title="Apagar">✕</button>}</span>
              </div>
            )
          })}
        </div>
      )}
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
}
