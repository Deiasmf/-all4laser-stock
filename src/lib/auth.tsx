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
  // True quando a busca do perfil já terminou (haja ou não perfil). Permite às
  // guardas distinguir staff (tem perfil) de clientes do portal (não têm perfil).
  perfilCarregado: boolean
  isAdmin: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthContexto>({
  session: null,
  perfil: null,
  carregando: true,
  perfilCarregado: false,
  isAdmin: false,
  sair: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [perfilCarregado, setPerfilCarregado] = useState(false)

  async function carregarPerfil(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setPerfil((data as Perfil) ?? null)
    setPerfilCarregado(true)
  }

  useEffect(() => {
    let ativo = true

    // A sessão liberta o ecrã de imediato; o perfil carrega à parte (não bloqueia).
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      setCarregando(false)
      if (data.session) carregarPerfil(data.session.user.id)
      else setPerfilCarregado(true)
    })

    // IMPORTANTE: não fazer `await` a chamadas à BD dentro deste callback — o
    // supabase-js usa um lock de auth e isso provoca deadlock (ecrã preso a
    // "A carregar..."). Adiamos com setTimeout para correr fora do callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
      setCarregando(false)
      if (novaSessao) {
        setPerfilCarregado(false)
        setTimeout(() => carregarPerfil(novaSessao.user.id), 0)
      } else {
        setPerfil(null)
        setPerfilCarregado(true)
      }
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
      value={{ session, perfil, carregando, perfilCarregado, isAdmin: perfil?.role === 'admin', sair }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
