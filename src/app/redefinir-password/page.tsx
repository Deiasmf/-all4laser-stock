'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from '../login/login.module.css'

export default function RedefinirPasswordPage() {
  const router = useRouter()
  // 'a-verificar' = a ler o link; 'pronto' = pode definir; 'sem-sessao' = link inválido; 'concluido' = feito
  const [estado, setEstado] = useState<'a-verificar' | 'pronto' | 'sem-sessao' | 'concluido'>('a-verificar')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    // Ao abrir o link do email, o Supabase lê o token do URL e cria uma sessão
    // temporária (evento PASSWORD_RECOVERY). A partir daí dá para mudar a password.
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY' || (evento === 'SIGNED_IN' && sessao)) {
        setEstado('pronto')
      }
    })

    // Caso a sessão já exista quando a página monta (evento já passou)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setEstado('pronto')
      } else {
        // Dá uns segundos para o Supabase processar o token do URL
        setTimeout(() => setEstado((e) => (e === 'a-verificar' ? 'sem-sessao' : e)), 3000)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (password.length < 6) {
      setErro('A password tem de ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setErro('As passwords não coincidem.')
      return
    }
    setAProcessar(true)
    const { error } = await supabase.auth.updateUser({ password })
    setAProcessar(false)
    if (error) {
      setErro('Não foi possível guardar. O link pode ter expirado — pede um novo no ecrã de início de sessão.')
      return
    }
    setEstado('concluido')
  }

  return (
    <div className={styles.wrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpg" alt="All4laser" className={styles.logo} />
      <div className={styles.cartao}>
        <div className={styles.titulo}>Nova password</div>

        {estado === 'a-verificar' && (
          <div className={styles.subtitulo}>A validar o link…</div>
        )}

        {estado === 'sem-sessao' && (
          <>
            <div className={styles.erro}>
              Este link é inválido ou já expirou. Volta ao início de sessão e pede um novo email de recuperação.
            </div>
            <button className={styles.botao} onClick={() => router.replace('/login')}>
              Voltar ao início de sessão
            </button>
          </>
        )}

        {estado === 'pronto' && (
          <>
            <div className={styles.subtitulo}>Define a nova password para a tua conta.</div>
            {erro && <div className={styles.erro}>{erro}</div>}
            <form onSubmit={guardar}>
              <div className={styles.campo}>
                <label className={styles.label}>Nova password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>
              <div className={styles.campo}>
                <label className={styles.label}>Confirmar nova password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <button className={styles.botao} type="submit" disabled={aProcessar}>
                {aProcessar ? 'A guardar...' : 'Guardar nova password'}
              </button>
            </form>
          </>
        )}

        {estado === 'concluido' && (
          <>
            <div className={styles.sucesso}>Password alterada com sucesso!</div>
            <button className={styles.botao} onClick={() => router.replace('/')}>
              Entrar na aplicação
            </button>
          </>
        )}
      </div>
    </div>
  )
}
