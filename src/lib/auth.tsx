'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Perfil = {
  id: string
  email: string | null
  nome: string | null
  role: string
}

type AuthContexto = {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  isAdmin: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthContexto>({
  session: null,
  perfil: null,
  carregando: true,
  isAdmin: false,
  sair: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setPerfil((data as Perfil) ?? null)
  }

  useEffect(() => {
    let ativo = true

    // A sessão liberta o ecrã de imediato; o perfil carrega à parte (não bloqueia).
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      setCarregando(false)
      if (data.session) carregarPerfil(data.session.user.id)
    })

    // IMPORTANTE: não fazer `await` a chamadas à BD dentro deste callback — o
    // supabase-js usa um lock de auth e isso provoca deadlock (ecrã preso a
    // "A carregar..."). Adiamos com setTimeout para correr fora do callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
      setCarregando(false)
      if (novaSessao) setTimeout(() => carregarPerfil(novaSessao.user.id), 0)
      else setPerfil(null)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function sair() {
    await supabase.auth.signOut()
    setPerfil(null)
  }

  return (
    <Ctx.Provider
      value={{ session, perfil, carregando, isAdmin: perfil?.role === 'admin', sair }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
