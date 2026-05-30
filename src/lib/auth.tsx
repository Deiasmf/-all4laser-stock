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
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await carregarPerfil(data.session.user.id)
      setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, novaSessao) => {
      setSession(novaSessao)
      if (novaSessao) await carregarPerfil(novaSessao.user.id)
      else setPerfil(null)
    })

    return () => sub.subscription.unsubscribe()
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
