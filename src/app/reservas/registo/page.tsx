'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import s from '../portal.module.css'

export default function PortalRegistoPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  async function submeter(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)

    if (password !== confirmar) {
      setErro('As passwords não coincidem.')
      return
    }
    setAProcessar(true)

    // metadata role='cliente' → o trigger handle_new_user cria o registo em clientes_portal.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: 'cliente', nome: nome.trim(), telefone: telefone.trim() } },
    })

    if (error) {
      setAProcessar(false)
      setErro(error.message)
      return
    }

    // O email é auto-confirmado pela BD; tentamos iniciar sessão de imediato.
    if (data.session) {
      setAProcessar(false)
      router.replace('/reservas')
      return
    }
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password })
    setAProcessar(false)
    if (erroLogin) {
      setSucesso('Conta criada! Já podes iniciar sessão.')
    } else {
      router.replace('/reservas')
    }
  }

  return (
    <div className={s.cartao}>
      <h1 className={s.titulo}>Criar conta</h1>
      <p className={s.subtitulo}>Regista-te para pedir reservas de equipamento.</p>

      {erro && <div className={s.erro}>{erro}</div>}
      {sucesso && <div className={s.sucesso}>{sucesso}</div>}

      <form onSubmit={submeter}>
        <div className={s.campo}>
          <label className={s.label}>Nome</label>
          <input className={s.input} value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className={s.campo}>
          <label className={s.label}>Email</label>
          <input className={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className={s.campo}>
          <label className={s.label}>Telefone</label>
          <input className={s.input} type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+351 ..." />
        </div>
        <div className={s.campo}>
          <label className={s.label}>Password</label>
          <input className={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className={s.campo}>
          <label className={s.label}>Confirmar password</label>
          <input className={s.input} type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={6} />
        </div>
        <button className={s.botao} type="submit" disabled={aProcessar}>
          {aProcessar ? 'A criar conta...' : 'Criar conta'}
        </button>
      </form>

      <div className={s.alternar}>
        Já tens conta?{' '}
        <Link href="/reservas/login" className={s.link}>Inicia sessão</Link>
      </div>
    </div>
  )
}
