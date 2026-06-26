'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import s from '../portal.module.css'

export default function PortalLoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)
    setAProcessar(true)

    if (modo === 'recuperar') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-password`,
      })
      setAProcessar(false)
      if (error) setErro('Não foi possível enviar o email. Tenta novamente daqui a pouco.')
      else setSucesso('Se este email tiver conta, enviámos um link para definir uma nova password. Verifica a caixa de entrada (e o spam).')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAProcessar(false)
    if (error) setErro('Email ou password incorretos.')
    else router.replace('/reservas')
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>{modo === 'entrar' ? 'Entrar' : 'Recuperar password'}</h1>
      <p className={s.subtitulo}>
        {modo === 'entrar'
          ? 'Portal de reservas de equipamento All4laser'
          : 'Indica o teu email e enviamos-te um link para definir uma nova password.'}
      </p>

      {erro && <div className={s.erro}>{erro}</div>}
      {sucesso && <div className={s.sucesso}>{sucesso}</div>}

      <form onSubmit={submeter}>
        <div className={s.campo}>
          <label className={s.label}>Email</label>
          <input className={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {modo === 'entrar' && (
          <div className={s.campo}>
            <label className={s.label}>Password</label>
            <input className={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
        )}
        <button className={s.botao} type="submit" disabled={aProcessar}>
          {aProcessar ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Enviar email de recuperação'}
        </button>
      </form>

      {modo === 'entrar' ? (
        <>
          <div className={s.alternar}>
            <button onClick={() => { setModo('recuperar'); setErro(null); setSucesso(null) }}>Esqueci-me da password</button>
          </div>
          <div className={s.alternar}>
            Não tens conta?{' '}
            <Link href="/reservas/registo" className={s.link}>Regista-te</Link>
          </div>
        </>
      ) : (
        <div className={s.alternar}>
          <button onClick={() => { setModo('entrar'); setErro(null); setSucesso(null) }}>Voltar ao início de sessão</button>
        </div>
      )}
    </div>
  )
}
