'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth, type Role } from '@/lib/auth'

type Utilizador = { id: string; nome: string | null; email: string | null; role: string }

const ROLES: { valor: Role; label: string; cor: string; bg: string; ajuda: string }[] = [
  { valor: 'admin', label: 'Administrador', cor: '#7C2D12', bg: '#FEF3C7', ajuda: 'Acesso total, incluindo gestão de utilizadores.' },
  { valor: 'financeiro', label: 'Financeiro', cor: '#065F46', bg: '#D1FAE5', ajuda: 'Acesso ao módulo Financeiro (+ resto da app).' },
  { valor: 'administrativo', label: 'Administrativo', cor: '#1E3A8A', bg: '#DBEAFE', ajuda: 'Acesso ao separador Tracking da Área Administrativa (+ resto da app).' },
  { valor: 'standard', label: 'Standard', cor: '#374151', bg: '#E5E7EB', ajuda: 'Utilizador normal, sem acesso ao Financeiro.' },
]

function roleInfo(role: string) {
  return ROLES.find((r) => r.valor === role) ?? ROLES[ROLES.length - 1]
}

export default function GestaoUtilizadoresPage() {
  const { isAdmin, perfilCarregado, perfil } = useAuth()
  const [lista, setLista] = useState<Utilizador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, nome, email, role').order('nome')
    setLista((data as Utilizador[]) ?? [])
    setCarregando(false)
  }, [])

  // setState corre só após o await dentro de carregar()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  async function mudarRole(u: Utilizador, novo: string) {
    if (novo === u.role) return
    setAGuardar(u.id); setMsg(null)
    const { error } = await supabase.rpc('admin_set_role', { p_user_id: u.id, p_role: novo })
    if (error) {
      setMsg('⚠️ ' + error.message)
    } else {
      setMsg(`✅ ${u.nome ?? u.email} agora é ${roleInfo(novo).label}.`)
      await carregar()
    }
    setAGuardar(null)
  }

  if (perfilCarregado && !isAdmin) {
    return <main style={c.page}><p style={c.muted}>Sem permissão. Só administradores podem gerir utilizadores.</p></main>
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>👤 Gestão de Utilizadores</h1>
        <p style={c.sub}>Atribui o role de cada membro da equipa. Só os administradores veem este ecrã.</p>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Legenda dos roles */}
      <div style={c.legenda}>
        {ROLES.map((r) => (
          <span key={r.valor} style={c.legendaItem}>
            <span style={{ ...c.badge, color: r.cor, background: r.bg }}>{r.label}</span>
            <span style={c.muted}>{r.ajuda}</span>
          </span>
        ))}
      </div>

      {carregando ? (
        <p style={c.muted}>A carregar...</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>Sem utilizadores.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Nome</span>
            <span>Email</span>
            <span>Role</span>
          </div>
          {lista.map((u) => {
            const euProprio = u.id === perfil?.id
            const i = roleInfo(u.role)
            return (
              <div key={u.id} style={c.linha}>
                <span style={{ fontWeight: 600 }}>
                  {u.nome ?? '—'}{euProprio && <span style={c.euTag}> (tu)</span>}
                </span>
                <span style={c.muted}>{u.email ?? '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...c.badge, color: i.cor, background: i.bg }}>{i.label}</span>
                  <select
                    value={u.role}
                    disabled={aGuardar === u.id}
                    onChange={(e) => mudarRole(u, e.target.value)}
                    style={c.select}
                    title={euProprio ? 'Não podes remover o teu próprio acesso de administrador.' : undefined}
                  >
                    {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
                  </select>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 14 },
  muted: { color: 'var(--muted)', fontSize: 13 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  legenda: { display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: 12, marginBottom: 14 },
  legendaItem: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, flexWrap: 'wrap' },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 1.4fr', gap: 8, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  euTag: { color: 'var(--muted)', fontWeight: 400, fontSize: 12 },
  select: { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 },
}
