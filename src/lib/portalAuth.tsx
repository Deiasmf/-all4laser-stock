'use client'

// Autenticação do PORTAL DE CLIENTES (/reservas), separada da auth interna (staff).
// Usa a mesma instância Supabase: a distinção é feita pela tabela clientes_portal
// (id = id do utilizador auth). Quem tem registo lá é cliente do portal.
import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ClientePortal = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  ativo: boolean
}

type PortalContexto = {
  session: Session | null
  cliente: ClientePortal | null
  carregando: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<PortalContexto>({
  session: null,
  cliente: null,
  carregando: true,
  sair: async () => {},
})

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cliente, setCliente] = useState<ClientePortal | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarCliente(userId: string) {
    const { data } = await supabase
      .from('clientes_portal')
      .select('id, nome, email, telefone, ativo')
      .eq('id', userId)
      .single()
    setCliente((data as ClientePortal) ?? null)
  }

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return
      setSession(data.session)
      setCarregando(false)
      if (data.session) carregarCliente(data.session.user.id)
    })

    // Nota: não fazer await a chamadas à BD dentro deste callback (lock de auth do
    // supabase-js → deadlock). Adiamos com setTimeout, como na auth interna.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
      setCarregando(false)
      if (novaSessao) setTimeout(() => carregarCliente(novaSessao.user.id), 0)
      else setCliente(null)
    })

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function sair() {
    await supabase.auth.signOut()
    setCliente(null)
  }

  return (
    <Ctx.Provider value={{ session, cliente, carregando, sair }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePortalAuth() {
  return useContext(Ctx)
}
