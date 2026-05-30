'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
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

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setAProcessar(false)
      if (error) {
        setErro('Email ou password incorretos.')
      } else {
        router.replace('/')
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setAProcessar(false)
        // Mensagem do trigger quando o email não está autorizado
        setErro(
          error.message.includes('autorizado')
            ? 'Este email não está autorizado. Contacte a Andreia ou a Sara.'
            : error.message
        )
      } else if (data.session) {
        setAProcessar(false)
        router.replace('/')
      } else {
        // Conta criada e auto-confirmada — inicia sessão de imediato
        const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password })
        setAProcessar(false)
        if (erroLogin) {
          setSucesso('Conta criada! Já podes iniciar sessão.')
          setModo('entrar')
        } else {
          router.replace('/')
        }
      }
    }
  }

  return (
    <div className={styles.wrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="All4laser" className={styles.logo} />
      <div className={styles.cartao}>
        <div className={styles.titulo}>
          {modo === 'entrar' ? 'Iniciar sessão' : 'Criar conta'}
        </div>
        <div className={styles.subtitulo}>Plataforma de stock All4laser</div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {sucesso && <div className={styles.sucesso}>{sucesso}</div>}

        <form onSubmit={submeter}>
          <div className={styles.campo}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.campo}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className={styles.botao} type="submit" disabled={aProcessar}>
            {aProcessar ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className={styles.alternar}>
          {modo === 'entrar' ? (
            <>
              Primeira vez?{' '}
              <button onClick={() => { setModo('criar'); setErro(null); setSucesso(null) }}>
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já tens conta?{' '}
              <button onClick={() => { setModo('entrar'); setErro(null); setSucesso(null) }}>
                Iniciar sessão
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
