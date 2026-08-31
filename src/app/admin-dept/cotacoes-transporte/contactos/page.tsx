'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarForwarders, criarForwarder, atualizarForwarder, eliminarForwarder, forwarderVazio, type ForwarderInput,
  alternarAtivoForwarder, forwarderTemHistorico, alternarAtivoGrupo,
  listarGrupos, criarGrupo, atualizarGrupo, eliminarGrupo, type GroupInput,
  membrosDoGrupo, adicionarMembro, removerMembro,
} from '@/lib/freight'
import type { FreightForwarder, ForwarderGroup } from '@/types/freight'

export default function ContactosPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [forwarders, setForwarders] = useState<FreightForwarder[]>([])
  const [grupos, setGrupos] = useState<ForwarderGroup[]>([])
  const [toast, setToast] = useState<string | null>(null)

  // Modal transitário
  const [fwAberto, setFwAberto] = useState(false)
  const [fwEditId, setFwEditId] = useState<string | null>(null)
  const [fwForm, setFwForm] = useState<ForwarderInput>(forwarderVazio())
  const [emailsTexto, setEmailsTexto] = useState('')

  // Modal grupo
  const [gpAberto, setGpAberto] = useState(false)
  const [gpEditId, setGpEditId] = useState<string | null>(null)
  const [gpForm, setGpForm] = useState<GroupInput>({ nome: '', idioma: 'pt', notas: null, ativo: true })
  const [gpMembros, setGpMembros] = useState<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    const [fw, gp] = await Promise.all([listarForwarders(), listarGrupos()])
    setForwarders(fw); setGrupos(gp)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  // ── Transitários ──────────────────────────────────────────────────────────
  function abrirFwNovo() { setFwEditId(null); setFwForm(forwarderVazio()); setEmailsTexto(''); setFwAberto(true) }
  function abrirFwEdicao(f: FreightForwarder) {
    setFwEditId(f.id)
    setFwForm({ nome: f.nome, pessoa_contacto: f.pessoa_contacto, emails: f.emails, telefone: f.telefone, pais: f.pais, notas: f.notas, ativo: f.ativo, fornecedor_id: f.fornecedor_id })
    setEmailsTexto(f.emails.join(', ')); setFwAberto(true)
  }
  async function guardarFw() {
    const emails = emailsTexto.split(/[,;\n]/).map((e) => e.trim()).filter(Boolean)
    const input = { ...fwForm, emails }
    if (!input.nome.trim()) { setToast('Indica o nome.'); return }
    const { error } = fwEditId ? await atualizarForwarder(fwEditId, input) : await criarForwarder(input)
    if (error) { setToast('Erro: ' + error.message); return }
    setFwAberto(false); setToast('Guardado.'); carregar()
  }
  async function alternarFw(f: FreightForwarder) {
    const { error } = await alternarAtivoForwarder(f.id, !f.ativo)
    setToast(error ? 'Erro: ' + error.message : (f.ativo ? 'Desativado.' : 'Ativado.')); carregar()
  }
  async function apagarFw(f: FreightForwarder) {
    if (await forwarderTemHistorico(f.id)) {
      setToast('Tem histórico de pedidos — desativa em vez de apagar.'); return
    }
    if (!window.confirm(`Apagar ${f.nome}? (sem histórico)`)) return
    const { error } = await eliminarForwarder(f.id)
    setToast(error ? 'Erro: ' + error.message : 'Apagado.'); carregar()
  }

  // ── Grupos ──────────────────────────────────────────────────────────────
  async function abrirGpNovo() { setGpEditId(null); setGpForm({ nome: '', idioma: 'pt', notas: null, ativo: true }); setGpMembros(new Set()); setGpAberto(true) }
  async function abrirGpEdicao(g: ForwarderGroup) {
    setGpEditId(g.id)
    setGpForm({ nome: g.nome, idioma: g.idioma, notas: g.notas, ativo: g.ativo })
    const ids = await membrosDoGrupo(g.id)
    setGpMembros(new Set(ids)); setGpAberto(true)
  }
  async function guardarGp() {
    if (!gpForm.nome.trim()) { setToast('Indica o nome do grupo.'); return }
    let groupId = gpEditId
    if (gpEditId) { const { error } = await atualizarGrupo(gpEditId, gpForm); if (error) { setToast('Erro: ' + error.message); return } }
    else { const { data, error } = await criarGrupo(gpForm); if (error || !data) { setToast('Erro: ' + (error?.message ?? '')); return } groupId = (data as ForwarderGroup).id }
    if (groupId) {
      // sincroniza membros
      const atuais = new Set(await membrosDoGrupo(groupId))
      for (const id of gpMembros) if (!atuais.has(id)) await adicionarMembro(groupId, id)
      for (const id of atuais) if (!gpMembros.has(id)) await removerMembro(groupId, id)
    }
    setGpAberto(false); setToast('Grupo guardado.'); carregar()
  }
  async function alternarGp(g: ForwarderGroup) {
    const { error } = await alternarAtivoGrupo(g.id, !g.ativo)
    setToast(error ? 'Erro: ' + error.message : (g.ativo ? 'Desativado.' : 'Ativado.')); carregar()
  }
  async function apagarGp(g: ForwarderGroup) {
    if (!window.confirm(`Apagar o grupo ${g.nome}? (os transitários mantêm-se)`)) return
    const { error } = await eliminarGrupo(g.id)
    setToast(error ? 'Erro: ' + error.message : 'Apagado.'); carregar()
  }
  function toggleMembro(id: string) {
    setGpMembros((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
        <h1 style={c.titulo}>Transitários & grupos</h1>
      </div>

      <div style={c.colunas}>
        {/* Transitários */}
        <section style={c.card}>
          <div style={c.cardTopo}><h2 style={c.h2}>Transitários</h2><button style={c.btnPrimario} onClick={abrirFwNovo}>+ Novo</button></div>
          {forwarders.length === 0 ? <p style={c.muted}>Sem transitários.</p> : (
            <ul style={c.lista}>
              {forwarders.map((f) => (
                <li key={f.id} style={c.item}>
                  <div>
                    <div style={c.itemNome}>{f.nome} {!f.ativo && <span style={c.inativo}>inativo</span>}</div>
                    <div style={c.itemSub}>{f.pais ?? '—'} · {f.emails.length} email(s){f.pessoa_contacto ? ` · ${f.pessoa_contacto}` : ''}</div>
                  </div>
                  <div>
                    <button style={c.btnMini} title={f.ativo ? 'Desativar' : 'Ativar'} onClick={() => alternarFw(f)}>{f.ativo ? '⏸️' : '▶️'}</button>
                    <button style={c.btnMini} title="Editar" onClick={() => abrirFwEdicao(f)}>✏️</button>
                    <button style={c.btnMini} title="Apagar (só sem histórico)" onClick={() => apagarFw(f)}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Grupos */}
        <section style={c.card}>
          <div style={c.cardTopo}><h2 style={c.h2}>Grupos</h2><button style={c.btnPrimario} onClick={abrirGpNovo}>+ Novo</button></div>
          {grupos.length === 0 ? <p style={c.muted}>Sem grupos.</p> : (
            <ul style={c.lista}>
              {grupos.map((g) => (
                <li key={g.id} style={c.item}>
                  <div>
                    <div style={c.itemNome}>{g.nome} <span style={c.tagIdioma}>{g.idioma.toUpperCase()}</span> {!g.ativo && <span style={c.inativo}>inativo</span>}</div>
                    {g.notas && <div style={c.itemSub}>{g.notas}</div>}
                  </div>
                  <div>
                    <button style={c.btnMini} title={g.ativo ? 'Desativar' : 'Ativar'} onClick={() => alternarGp(g)}>{g.ativo ? '⏸️' : '▶️'}</button>
                    <button style={c.btnMini} title="Editar" onClick={() => abrirGpEdicao(g)}>✏️</button>
                    <button style={c.btnMini} title="Apagar grupo" onClick={() => apagarGp(g)}>🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Modal transitário */}
      {fwAberto && (
        <div style={c.overlay} onClick={() => setFwAberto(false)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}><strong>{fwEditId ? 'Editar transitário' : 'Novo transitário'}</strong><button style={c.btnFechar} onClick={() => setFwAberto(false)}>✕</button></div>
            <div style={c.grelha}>
              <label style={c.campo}><span style={c.rot}>Nome da empresa *</span><input style={c.input} value={fwForm.nome} onChange={(e) => setFwForm({ ...fwForm, nome: e.target.value })} /></label>
              <label style={c.campo}><span style={c.rot}>Pessoa de contacto</span><input style={c.input} value={fwForm.pessoa_contacto ?? ''} onChange={(e) => setFwForm({ ...fwForm, pessoa_contacto: e.target.value || null })} /></label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Emails (separados por vírgula)</span><input style={c.input} value={emailsTexto} placeholder="geral@transitario.pt, ops@transitario.pt" onChange={(e) => setEmailsTexto(e.target.value)} /></label>
              <label style={c.campo}><span style={c.rot}>Telefone</span><input style={c.input} value={fwForm.telefone ?? ''} onChange={(e) => setFwForm({ ...fwForm, telefone: e.target.value || null })} /></label>
              <label style={c.campo}><span style={c.rot}>País</span><input style={c.input} value={fwForm.pais ?? ''} onChange={(e) => setFwForm({ ...fwForm, pais: e.target.value || null })} /></label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Notas</span><textarea style={{ ...c.input, minHeight: 50 }} value={fwForm.notas ?? ''} onChange={(e) => setFwForm({ ...fwForm, notas: e.target.value || null })} /></label>
              <label style={c.check}><input type="checkbox" checked={fwForm.ativo} onChange={(e) => setFwForm({ ...fwForm, ativo: e.target.checked })} /> Ativo</label>
            </div>
            <div style={c.modalAcoes}><button style={c.btnSecundario} onClick={() => setFwAberto(false)}>Cancelar</button><button style={c.btnPrimario} onClick={guardarFw}>Guardar</button></div>
          </div>
        </div>
      )}

      {/* Modal grupo */}
      {gpAberto && (
        <div style={c.overlay} onClick={() => setGpAberto(false)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}><strong>{gpEditId ? 'Editar grupo' : 'Novo grupo'}</strong><button style={c.btnFechar} onClick={() => setGpAberto(false)}>✕</button></div>
            <div style={c.grelha}>
              <label style={c.campo}><span style={c.rot}>Nome *</span><input style={c.input} value={gpForm.nome} onChange={(e) => setGpForm({ ...gpForm, nome: e.target.value })} /></label>
              <label style={c.campo}><span style={c.rot}>Idioma dos emails</span>
                <select style={c.input} value={gpForm.idioma} onChange={(e) => setGpForm({ ...gpForm, idioma: e.target.value as GroupInput['idioma'] })}>
                  <option value="pt">Português</option><option value="en">Inglês</option>
                </select>
              </label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Notas</span><input style={c.input} value={gpForm.notas ?? ''} onChange={(e) => setGpForm({ ...gpForm, notas: e.target.value || null })} /></label>
              <label style={c.check}><input type="checkbox" checked={gpForm.ativo} onChange={(e) => setGpForm({ ...gpForm, ativo: e.target.checked })} /> Ativo</label>
            </div>
            <div style={c.membros}>
              <div style={c.rot}>Membros do grupo</div>
              <div style={c.membrosLista}>
                {forwarders.filter((f) => f.ativo).map((f) => (
                  <label key={f.id} style={c.membro}><input type="checkbox" checked={gpMembros.has(f.id)} onChange={() => toggleMembro(f.id)} /> {f.nome}</label>
                ))}
              </div>
            </div>
            <div style={c.modalAcoes}><button style={c.btnSecundario} onClick={() => setGpAberto(false)}>Cancelar</button><button style={c.btnPrimario} onClick={guardarGp}>Guardar</button></div>
          </div>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1080, margin: '0 auto' },
  topo: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  colunas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
  card: { border: '1px solid #eee', borderRadius: 12, padding: 16, background: '#fff' },
  cardTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: 700, margin: 0 },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px' },
  itemNome: { fontWeight: 600, fontSize: 14 },
  itemSub: { fontSize: 12, color: 'var(--muted)' },
  inativo: { fontSize: 11, color: '#B91C1C', background: '#FEE2E2', borderRadius: 999, padding: '1px 6px', marginLeft: 4 },
  tagIdioma: { fontSize: 11, background: '#EEF2FF', color: '#3730A3', borderRadius: 999, padding: '1px 6px' },
  muted: { color: 'var(--muted)', padding: 12, textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 50 },
  modal: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(640px, 100%)', marginTop: 24 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnFechar: { border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  membros: { marginTop: 12 },
  membrosLista: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 10, marginTop: 4 },
  membro: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btnPrimario: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnMini: { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', padding: '4px 8px', marginLeft: 4, fontSize: 14 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
