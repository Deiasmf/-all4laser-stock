'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  function mudarModo(novo: 'entrar' | 'criar' | 'recuperar') {
    setModo(novo)
    setErro(null)
    setSucesso(null)
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)
    setAProcessar(true)

    if (modo === 'recuperar') {
      // Envia o email com o link para redefinir a password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-password`,
      })
      setAProcessar(false)
      if (error) {
        setErro('Não foi possível enviar o email. Tenta novamente daqui a pouco.')
      } else {
        // Mensagem genérica (não revela se o email tem conta)
        setSucesso('Se este email tiver conta, enviámos um link para redefinir a password. Verifica a caixa de entrada (e o spam).')
      }
      return
    }

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

  const titulo = modo === 'entrar' ? 'Iniciar sessão' : modo === 'criar' ? 'Criar conta' : 'Recuperar password'
  const textoBotao = aProcessar
    ? 'Aguarde...'
    : modo === 'entrar'
      ? 'Entrar'
      : modo === 'criar'
        ? 'Criar conta'
        : 'Enviar email de recuperação'

  return (
    <div className={styles.wrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="All4laser" className={styles.logo} />
      <div className={styles.cartao}>
        <div className={styles.titulo}>{titulo}</div>
        <div className={styles.subtitulo}>
          {modo === 'recuperar'
            ? 'Indica o teu email e enviamos-te um link para definir uma nova password.'
            : 'Plataforma de stock All4laser'}
        </div>

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
          {modo !== 'recuperar' && (
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
          )}
          <button className={styles.botao} type="submit" disabled={aProcessar}>
            {textoBotao}
          </button>
        </form>

        {/* Link "esqueci-me da password" — só no ecrã de entrar */}
        {modo === 'entrar' && (
          <div className={styles.alternar}>
            <button onClick={() => mudarModo('recuperar')}>Esqueci-me da password</button>
          </div>
        )}

        <div className={styles.alternar}>
          {modo === 'entrar' ? (
            <>
              Primeira vez?{' '}
              <button onClick={() => mudarModo('criar')}>Criar conta</button>
            </>
          ) : modo === 'criar' ? (
            <>
              Já tens conta?{' '}
              <button onClick={() => mudarModo('entrar')}>Iniciar sessão</button>
            </>
          ) : (
            <>
              Lembraste-te?{' '}
              <button onClick={() => mudarModo('entrar')}>Voltar ao início de sessão</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
