'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ZONAS_TRANSPORTE, zonaLabel, type ZonaTransporte } from '@/lib/transportes'
import {
  listarMotoristas, criarMotorista, atualizarMotorista, listarPerfisStaff,
  listarParceiros, criarParceiro, atualizarParceiro,
  listarCarrinhas, criarCarrinha, atualizarCarrinha,
  listarIndisponibilidades, criarIndisponibilidade, eliminarIndisponibilidade,
  type Motorista, type PerfilStaff, type ParceiroExterno, type Carrinha, type Indisponibilidade, type TipoMotorista,
} from '@/lib/transportesRecursos'

export default function RecursosTransportePage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [motoristas, setMotoristas] = useState<Motorista[]>([])
  const [perfis, setPerfis] = useState<PerfilStaff[]>([])
  const [parceiros, setParceiros] = useState<ParceiroExterno[]>([])
  const [carrinhas, setCarrinhas] = useState<Carrinha[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [m, p, pa, c] = await Promise.all([listarMotoristas(), listarPerfisStaff(), listarParceiros(), listarCarrinhas()])
    setMotoristas(m); setPerfis(p); setParceiros(pa); setCarrinhas(c)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  const flash = (m: string) => setToast(m)

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda/paragens" style={c.voltar}>← Paragens</Link>
      <h1 style={c.titulo}>Motoristas & carrinhas</h1>

      {/* Motoristas */}
      <section style={c.sec}>
        <h2 style={c.h2}>Motoristas</h2>
        <div style={c.wrap}><table style={c.tabela}><thead><tr>
          <th style={c.th}>Nome</th><th style={c.th}>Tipo</th><th style={c.th}>Zona principal</th><th style={c.th}>Conta da app</th><th style={c.th}>Ativo</th>
        </tr></thead><tbody>
          {motoristas.map((m) => (
            <tr key={m.id} style={c.tr}>
              <td style={c.td}>{m.nome}</td>
              <td style={c.td}>
                <select style={c.sel} value={m.tipo} onChange={async (e) => { await atualizarMotorista(m.id, { tipo: e.target.value as TipoMotorista }); flash('Atualizado.'); carregar() }}>
                  <option value="principal">Principal</option>
                  <option value="reforco">Reforço</option>
                </select>
              </td>
              <td style={c.td}>
                <select style={c.sel} value={m.zona_principal ?? ''} onChange={async (e) => { await atualizarMotorista(m.id, { zona_principal: (e.target.value || null) as ZonaTransporte | null }); flash('Atualizado.'); carregar() }}>
                  <option value="">—</option>
                  {ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}
                </select>
              </td>
              <td style={c.td}>
                <select style={c.sel} value={m.user_id ?? ''} onChange={async (e) => { await atualizarMotorista(m.id, { user_id: e.target.value || null }); flash('Atualizado.'); carregar() }}>
                  <option value="">— (sem conta)</option>
                  {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome ?? p.id.slice(0, 8)}</option>)}
                </select>
              </td>
              <td style={c.td}><button style={m.ativo ? c.on : c.off} onClick={async () => { await atualizarMotorista(m.id, { ativo: !m.ativo }); carregar() }}>{m.ativo ? 'Ativo' : 'Inativo'}</button></td>
            </tr>
          ))}
        </tbody></table></div>
        <AddMotorista perfis={perfis} onOk={() => { flash('Motorista adicionado.'); carregar() }} onErro={flash} />
      </section>

      {/* Parceiros externos */}
      <section style={c.sec}>
        <h2 style={c.h2}>Parceiros externos <span style={c.hint}>(sem agenda mobile; recebem resumo por email)</span></h2>
        <div style={c.wrap}><table style={c.tabela}><thead><tr>
          <th style={c.th}>Nome</th><th style={c.th}>Zona</th><th style={c.th}>Email</th><th style={c.th}>Ativo</th>
        </tr></thead><tbody>
          {parceiros.map((p) => (
            <tr key={p.id} style={c.tr}>
              <td style={c.td}>{p.nome}</td>
              <td style={c.td}>
                <select style={c.sel} value={p.zona ?? ''} onChange={async (e) => { await atualizarParceiro(p.id, { zona: (e.target.value || null) as ZonaTransporte | null }); flash('Atualizado.'); carregar() }}>
                  <option value="">—</option>
                  {ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}
                </select>
              </td>
              <td style={c.td}>
                <input style={c.inp} defaultValue={p.email ?? ''} placeholder="email@…" onBlur={async (e) => { if ((e.target.value || null) !== p.email) { await atualizarParceiro(p.id, { email: e.target.value.trim() || null }); flash('Atualizado.'); carregar() } }} />
              </td>
              <td style={c.td}><button style={p.ativo ? c.on : c.off} onClick={async () => { await atualizarParceiro(p.id, { ativo: !p.ativo }); carregar() }}>{p.ativo ? 'Ativo' : 'Inativo'}</button></td>
            </tr>
          ))}
        </tbody></table></div>
        <AddParceiro onOk={() => { flash('Parceiro adicionado.'); carregar() }} onErro={flash} />
      </section>

      {/* Carrinhas */}
      <section style={c.sec}>
        <h2 style={c.h2}>Carrinhas</h2>
        <div style={c.wrap}><table style={c.tabela}><thead><tr>
          <th style={c.th}>Nome</th><th style={c.th}>Matrícula</th><th style={c.th}>Capacidade / notas</th><th style={c.th}>Ativo</th><th style={c.th}>Indisponibilidades</th>
        </tr></thead><tbody>
          {carrinhas.map((v) => (
            <LinhaCarrinha key={v.id} v={v} onMudou={() => carregar()} onErro={flash} />
          ))}
        </tbody></table></div>
        <AddCarrinha onOk={() => { flash('Carrinha adicionada.'); carregar() }} onErro={flash} />
      </section>

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

function AddMotorista({ perfis, onOk, onErro }: { perfis: PerfilStaff[]; onOk: () => void; onErro: (m: string) => void }) {
  const [nome, setNome] = useState(''); const [tipo, setTipo] = useState<TipoMotorista>('principal')
  const [zona, setZona] = useState<ZonaTransporte | ''>(''); const [user, setUser] = useState('')
  async function add() {
    if (!nome.trim()) { onErro('Indica o nome.'); return }
    const { error } = await criarMotorista({ nome, tipo, zona_principal: (zona || null) as ZonaTransporte | null, user_id: user || null })
    if (error) { onErro('Erro: ' + error.message); return }
    setNome(''); setZona(''); setUser(''); setTipo('principal'); onOk()
  }
  return (
    <div style={c.add}>
      <input style={c.inp} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <select style={c.sel} value={tipo} onChange={(e) => setTipo(e.target.value as TipoMotorista)}><option value="principal">Principal</option><option value="reforco">Reforço</option></select>
      <select style={c.sel} value={zona} onChange={(e) => setZona(e.target.value as ZonaTransporte | '')}><option value="">Zona —</option>{ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}</select>
      <select style={c.sel} value={user} onChange={(e) => setUser(e.target.value)}><option value="">Conta —</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome ?? p.id.slice(0, 8)}</option>)}</select>
      <button style={c.btnAdd} onClick={add}>+ Motorista</button>
    </div>
  )
}

function AddParceiro({ onOk, onErro }: { onOk: () => void; onErro: (m: string) => void }) {
  const [nome, setNome] = useState(''); const [zona, setZona] = useState<ZonaTransporte | ''>(''); const [email, setEmail] = useState('')
  async function add() {
    if (!nome.trim()) { onErro('Indica o nome.'); return }
    const { error } = await criarParceiro({ nome, zona: (zona || null) as ZonaTransporte | null, email: email || null })
    if (error) { onErro('Erro: ' + error.message); return }
    setNome(''); setZona(''); setEmail(''); onOk()
  }
  return (
    <div style={c.add}>
      <input style={c.inp} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <select style={c.sel} value={zona} onChange={(e) => setZona(e.target.value as ZonaTransporte | '')}><option value="">Zona —</option>{ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}</select>
      <input style={c.inp} placeholder="email (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button style={c.btnAdd} onClick={add}>+ Parceiro</button>
    </div>
  )
}

function AddCarrinha({ onOk, onErro }: { onOk: () => void; onErro: (m: string) => void }) {
  const [nome, setNome] = useState(''); const [matricula, setMatricula] = useState(''); const [notas, setNotas] = useState('')
  async function add() {
    if (!nome.trim()) { onErro('Indica o nome.'); return }
    const { error } = await criarCarrinha({ nome, matricula: matricula || null, capacidade_notas: notas || null })
    if (error) { onErro('Erro: ' + error.message); return }
    setNome(''); setMatricula(''); setNotas(''); onOk()
  }
  return (
    <div style={c.add}>
      <input style={c.inp} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      <input style={c.inp} placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
      <input style={c.inp} placeholder="Capacidade / notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <button style={c.btnAdd} onClick={add}>+ Carrinha</button>
    </div>
  )
}

function LinhaCarrinha({ v, onMudou, onErro }: { v: Carrinha; onMudou: () => void; onErro: (m: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [inds, setInds] = useState<Indisponibilidade[]>([])
  const [de, setDe] = useState(''); const [ate, setAte] = useState(''); const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => setInds(await listarIndisponibilidades(v.id)), [v.id])
  useEffect(() => { if (aberto) carregar() }, [aberto, carregar])

  async function add() {
    if (!de || !ate) { onErro('Indica as datas de/até.'); return }
    const { error } = await criarIndisponibilidade({ vehicle_id: v.id, de, ate, motivo: motivo || null })
    if (error) { onErro('Erro: ' + error.message); return }
    setDe(''); setAte(''); setMotivo(''); carregar()
  }

  return (
    <>
      <tr style={c.tr}>
        <td style={c.td}>{v.nome}</td>
        <td style={c.td}>{v.matricula ?? '—'}</td>
        <td style={c.td}>{v.capacidade_notas ?? '—'}</td>
        <td style={c.td}><button style={v.ativo ? c.on : c.off} onClick={async () => { await atualizarCarrinha(v.id, { ativo: !v.ativo }); onMudou() }}>{v.ativo ? 'Ativa' : 'Inativa'}</button></td>
        <td style={c.td}><button style={c.btnMini} onClick={() => setAberto((x) => !x)}>{aberto ? 'Fechar' : 'Gerir'}</button></td>
      </tr>
      {aberto && (
        <tr><td style={c.tdSub} colSpan={5}>
          <div style={c.indBox}>
            <div style={c.add}>
              <input style={c.inp} type="date" value={de} onChange={(e) => setDe(e.target.value)} title="De" />
              <input style={c.inp} type="date" value={ate} onChange={(e) => setAte(e.target.value)} title="Até" />
              <input style={c.inp} placeholder="Motivo (oficina, inspeção…)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <button style={c.btnAdd} onClick={add}>+ Indisponibilidade</button>
            </div>
            {inds.length === 0 ? <p style={c.hint}>Sem indisponibilidades.</p> : (
              <ul style={c.indList}>
                {inds.map((i) => (
                  <li key={i.id} style={c.indItem}>
                    <span>{i.de} → {i.ate}{i.motivo ? ` · ${i.motivo}` : ''}</span>
                    <button style={c.btnDel} onClick={async () => { await eliminarIndisponibilidade(i.id); carregar() }}>🗑️</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </td></tr>
      )}
    </>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 14px' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  sec: { marginBottom: 24 },
  h2: { fontSize: 16, fontWeight: 700, margin: '0 0 8px' },
  hint: { color: 'var(--muted)', fontWeight: 400, fontSize: 12 },
  wrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px', verticalAlign: 'middle' },
  tdSub: { padding: 0, background: '#F9FAFB' },
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  inp: { padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff', minWidth: 120 },
  on: { padding: '4px 10px', borderRadius: 999, border: '1px solid #065F46', background: '#D1FAE5', color: '#065F46', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  off: { padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff', color: '#6B7280', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  add: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' },
  btnAdd: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnMini: { padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12 },
  btnDel: { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, padding: '2px 8px' },
  indBox: { padding: 12 },
  indList: { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  indItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, borderLeft: '2px solid #e5e7eb', paddingLeft: 10 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
