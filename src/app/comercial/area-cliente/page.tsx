'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  criarEquipamentoReservaAdmin, listarAssistenciaAdmin, listarClientesPortalAdmin, listarReservasAdmin,
  atualizarEstadoAssistenciaAdmin, atualizarEstadoReservaAdmin,
  type AssistenciaPedido, type ClientePortalCompleto, type ReservaCliente,
} from '@/lib/areaCliente'

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: 20 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 },
  input: { width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  btn: { padding: '9px 13px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 700 },
  primary: { padding: '10px 14px', border: 0, borderRadius: 8, background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 800 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f1f1' },
  muted: { color: 'var(--muted)', fontSize: 13 },
}

export default function AreaClienteAdminPage() {
  const { session, perfil } = useAuth()
  const [clientes, setClientes] = useState<ClientePortalCompleto[]>([])
  const [reservas, setReservas] = useState<ReservaCliente[]>([])
  const [assistencia, setAssistencia] = useState<AssistenciaPedido[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [link, setLink] = useState('')
  const [equipNome, setEquipNome] = useState('')
  const [equipModelo, setEquipModelo] = useState('')

  function carregar() {
    Promise.all([listarClientesPortalAdmin(), listarReservasAdmin(), listarAssistenciaAdmin()]).then(([cl, rs, as]) => {
      setClientes(cl); setReservas(rs); setAssistencia(as)
    })
  }
  useEffect(() => { carregar() }, [])

  async function criarConvite() {
    setMsg(null); setLink('')
    const token = session?.access_token
    if (!token) { setMsg('Sessão expirada.'); return }
    const r = await fetch('/api/area-cliente/convites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, nome, empresa, dias: 7 }),
    })
    const j = await r.json()
    if (!j.ok) setMsg(j.erro ?? 'Erro ao criar convite.')
    else { setLink(j.link); setMsg('Convite criado.'); setEmail(''); setNome(''); setEmpresa('') }
  }

  async function uploadDocumento(cliente: ClientePortalCompleto, file: File, categoria: string) {
    const caminho = `${cliente.id}/${Date.now()}-${file.name.normalize('NFD').replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from('cliente-documentos').upload(caminho, file, { contentType: file.type || 'application/octet-stream' })
    if (up.error) { setMsg(up.error.message); return }
    const ins = await supabase.from('cliente_documentos').insert({
      cliente_id: cliente.cliente_id,
      cliente_portal_id: cliente.id,
      categoria,
      titulo: file.name,
      caminho,
      mime_type: file.type || null,
      tamanho_bytes: file.size,
      criado_por: perfil?.id ?? null,
      criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    })
    setMsg(ins.error ? ins.error.message : 'Documento carregado.')
  }

  async function uploadGaleria(file: File) {
    const caminho = `materiais/${Date.now()}-${file.name.normalize('NFD').replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from('cliente-galeria').upload(caminho, file, { contentType: file.type || 'application/octet-stream' })
    if (up.error) { setMsg(up.error.message); return }
    const ins = await supabase.from('cliente_galeria_materiais').insert({
      titulo: file.name,
      formato: 'publicacao',
      caminho,
      mime_type: file.type || null,
      tamanho_bytes: file.size,
      criado_por: perfil?.id ?? null,
      criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
    })
    setMsg(ins.error ? ins.error.message : 'Material carregado.')
  }

  return (
    <main style={c.page}>
      <h1>Área de Cliente</h1>
      <p style={c.muted}>Gestão de convites, clientes, documentos, reservas, assistência e materiais.</p>
      {msg && <div style={c.card}>{msg}</div>}
      <section style={c.card}>
        <h2>Convites</h2>
        <div style={c.grid}>
          <input style={c.input} placeholder="Email da cliente" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={c.input} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input style={c.input} placeholder="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          <button style={c.primary} onClick={criarConvite}>Gerar convite</button>
        </div>
        {link && <input style={{ ...c.input, marginTop: 10 }} value={link} readOnly onFocus={(e) => e.currentTarget.select()} />}
      </section>

      <section style={c.card}>
        <h2>Clientes e documentos</h2>
        {clientes.length === 0 ? <p style={c.muted}>Sem clientes no portal.</p> : clientes.map((cl) => (
          <div key={cl.id} style={c.row}>
            <span><strong>{cl.nome}</strong><br /><span style={c.muted}>{cl.email}</span></span>
            <span>{cl.empresa ?? '-'}</span>
            <select style={c.input} defaultValue="fatura" id={`cat-${cl.id}`}><option value="fatura">Fatura</option><option value="contrato">Contrato</option><option value="certificado_formacao">Certificado</option><option value="outro">Outro</option></select>
            <label style={c.btn}>Carregar<input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; const cat = (document.getElementById(`cat-${cl.id}`) as HTMLSelectElement | null)?.value ?? 'outro'; if (f) uploadDocumento(cl, f, cat) }} /></label>
          </div>
        ))}
      </section>

      <section style={c.card}>
        <h2>Reservas pendentes e recentes</h2>
        {reservas.map((r) => (
          <div key={r.id} style={c.row}>
            <span><strong>{r.numero}</strong><br /><span style={c.muted}>{r.modelo}</span></span>
            <span>{r.data_inicio} a {r.data_fim}</span>
            <span>{r.estado}</span>
            <span><button style={c.btn} onClick={async () => { await atualizarEstadoReservaAdmin(r.id, 'confirmada', { id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }); carregar() }}>Confirmar</button></span>
          </div>
        ))}
      </section>

      <section style={c.card}>
        <h2>Assistência</h2>
        {assistencia.map((p) => (
          <div key={p.id} style={c.row}>
            <span><strong>{p.numero}</strong><br /><span style={c.muted}>{p.equipamento}</span></span>
            <span>{p.estado}</span>
            <span>{p.email_assistencia_estado}</span>
            <select style={c.input} value={p.estado} onChange={async (e) => { await atualizarEstadoAssistenciaAdmin(p.id, e.target.value as AssistenciaPedido['estado']); carregar() }}>
              <option value="recebido">Recebido</option><option value="em_analise">Em análise</option><option value="em_resolucao">Em resolução</option><option value="resolvido">Resolvido</option>
            </select>
          </div>
        ))}
      </section>

      <section style={c.card}>
        <h2>Equipamentos e galeria</h2>
        <div style={c.grid}>
          <input style={c.input} placeholder="Nome do equipamento" value={equipNome} onChange={(e) => setEquipNome(e.target.value)} />
          <input style={c.input} placeholder="Modelo" value={equipModelo} onChange={(e) => setEquipModelo(e.target.value)} />
          <button style={c.primary} onClick={async () => { await criarEquipamentoReservaAdmin({ nome: equipNome, modelo: equipModelo }); setEquipNome(''); setEquipModelo(''); setMsg('Equipamento criado.') }}>Criar equipamento</button>
          <label style={c.btn}>Carregar material<input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGaleria(f) }} /></label>
        </div>
      </section>
    </main>
  )
}
