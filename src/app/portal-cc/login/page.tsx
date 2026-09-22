'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePortalCC } from '@/lib/portalCCAuth'

export default function PortalCCLoginPage() {
  const { t } = usePortalCC()
  const [email, setEmail] = useState('')
  const [aEnviar, setAEnviar] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setAEnviar(true)
    // shouldCreateUser: false → só entram utilizadores já convidados (criados
    // pela rota de convite). Emails desconhecidos não criam conta.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/portal-cc` : undefined,
      },
    })
    setAEnviar(false)
    if (error) setErro(t('login_error'))
    else setEnviado(true)
  }

  return (
    <div style={est.wrap}>
      <div style={est.cartao}>
        <h1 style={est.titulo}>{t('login_title')}</h1>
        <p style={est.sub}>{t('login_sub')}</p>
        {enviado ? (
          <div style={est.sucesso}>✓ {t('link_sent')}</div>
        ) : (
          <form onSubmit={submeter}>
            {erro && <div style={est.erro}>{erro}</div>}
            <label style={est.label}>{t('email')}</label>
            <input style={est.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <button style={est.botao} type="submit" disabled={aEnviar || !email.trim()}>
              {aEnviar ? t('sending') : t('send_link')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const est: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  cartao: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.05)' },
  titulo: { fontSize: 22, fontWeight: 800, color: 'var(--primary, #0b3d2e)', marginBottom: 6 },
  sub: { color: '#6b7280', fontSize: 14, marginBottom: 18 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', marginBottom: 14 },
  botao: { width: '100%', background: 'var(--primary, #0b3d2e)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  sucesso: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '12px 14px', fontSize: 14 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
}
