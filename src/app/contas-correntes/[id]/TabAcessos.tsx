'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  listarPortalUsers, setPortalUserAtivo, removerPortalUser, formatarData,
  type ContaComSaldo, type PortalUser,
} from '@/lib/cc'

export default function TabAcessos({ conta }: { conta: ContaComSaldo }) {
  const [users, setUsers] = useState<PortalUser[] | null>(null)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [aConvidar, setAConvidar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function recarregar() {
    setUsers(await listarPortalUsers(conta.id))
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [conta.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function convidar() {
    setErro(null); setMsg(null)
    const e = email.trim().toLowerCase()
    if (!e) { setErro('Indica o email do cliente.'); return }
    setAConvidar(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const resp = await fetch('/api/contas-correntes/portal/convidar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_id: conta.id, email: e, nome: nome.trim() || null }),
      })
      const r = await resp.json()
      if (!resp.ok || !r.ok) { setErro(r.erro ?? 'Não foi possível convidar.'); setAConvidar(false); return }
      setMsg(r.emailEnviado
        ? 'Convite enviado por email com o link de acesso.'
        : `Cliente ligado à conta. ${r.motivoEmail ? 'Email não enviado: ' + r.motivoEmail : 'O email não foi enviado (verifica a configuração).'}`)
      setEmail(''); setNome('')
      await recarregar()
    } catch (err) {
      setErro('Falha: ' + (err instanceof Error ? err.message : String(err)))
    }
    setAConvidar(false)
  }

  async function alternar(u: PortalUser) {
    setErro(null)
    const { error } = await setPortalUserAtivo(u.id, !u.ativo)
    if (error) { setErro(error.message); return }
    recarregar()
  }

  async function remover(u: PortalUser) {
    if (!window.confirm(`Remover o acesso de ${u.email}?`)) return
    setErro(null)
    const { error } = await removerPortalUser(u.id)
    if (error) { setErro(error.message); return }
    recarregar()
  }

  return (
    <div>
      <div style={c.card}>
        <div style={c.cardTitulo}>Convidar cliente para o portal</div>
        <p style={c.ajuda}>
          O cliente recebe um link de acesso (magic link) e vê apenas esta conta, em modo só de leitura.
          Um mesmo cliente pode ter acesso a várias contas.
        </p>
        {msg && <div style={c.msg}>{msg}</div>}
        {erro && <div style={c.erro}>{erro}</div>}
        <div style={c.formGrelha}>
          <input placeholder="Email do cliente" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={c.input} />
          <input placeholder="Nome (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} style={c.input} />
          <button style={c.btnPrimario} disabled={aConvidar || !email.trim()} onClick={convidar}>
            {aConvidar ? 'A convidar...' : 'Convidar'}
          </button>
        </div>
      </div>

      <div style={c.card}>
        <div style={c.cardTitulo}>Utilizadores com acesso</div>
        {users === null ? (
          <p style={c.estado}>A carregar...</p>
        ) : users.length === 0 ? (
          <p style={c.estado}>Ainda ninguém tem acesso a esta conta.</p>
        ) : (
          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Email</span><span>Nome</span><span>Desde</span>
              <span style={{ textAlign: 'center' }}>Estado</span>
              <span style={{ textAlign: 'right' }}>Ações</span>
            </div>
            {users.map((u) => (
              <div key={u.id} style={c.linha}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                <span style={{ color: 'var(--muted)' }}>{u.nome ?? '—'}</span>
                <span style={{ color: 'var(--muted)' }}>{formatarData(u.created_at)}</span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{ ...c.pill, ...(u.ativo ? c.pillAtivo : c.pillInativo) }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                </span>
                <span style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button style={c.acaoGhost} onClick={() => alternar(u)}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
                  <button style={c.acaoPerigo} onClick={() => remover(u)}>Remover</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  cardTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  ajuda: { fontSize: 13, color: 'var(--muted)' },
  msg: { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  formGrelha: { display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 10, alignItems: 'center' },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', minWidth: 120 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.9fr 0.8fr 1.2fr', gap: 8, padding: '9px 8px', fontSize: 13.5, borderBottom: '1px solid #f3f3f3', alignItems: 'center', minWidth: 620 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  pill: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  pillAtivo: { color: '#065F46', background: '#D1FAE5' },
  pillInativo: { color: '#6B7280', background: '#F3F4F6' },
  acaoGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  acaoPerigo: { background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 7, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
}
