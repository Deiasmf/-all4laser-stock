'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Perfil = {
  id: string
  email: string | null
  nome: string | null
  role: string
}

// Roles internos. Apenas duas áreas são restritas: o Financeiro (role 'financeiro'
// ou 'admin') e a Gestão de Utilizadores (só 'admin'). Todo o staff interno pode
// gerir o resto da app (criar/editar/apagar). 'standard' é o role base.
export type Role = 'admin' | 'financeiro' | 'standard'

const ROLES_STAFF = ['admin', 'financeiro', 'standard']

// True se o role é de staff interno (qualquer membro da equipa). Espelha is_staff()
// na BD: é quem pode gerir/editar/apagar na app, exceto nas áreas restritas
// (Financeiro e Gestão de Utilizadores).
export function eStaff(role: string | null | undefined): boolean {
  return !!role && ROLES_STAFF.includes(role)
}

// True se o role dá acesso ao módulo Financeiro (espelha has_financeiro_access() na BD).
export function temAcessoFinanceiro(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'financeiro'
}

type AuthContexto = {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  // True quando a busca do perfil já terminou (haja ou não perfil). Permite às
  // guardas distinguir staff (tem perfil) de clientes do portal (não têm perfil).
  perfilCarregado: boolean
  role: string | null
  // "Pode gerir": todo o staff interno pode criar/editar/apagar na maioria da app.
  // O bloqueio real é a RLS na BD; isto só controla botões e guardas no cliente.
  isAdmin: boolean
  // Acesso ao módulo Financeiro (admin ou financeiro). O bloqueio real é a RLS
  // na BD; isto só controla menus e a guarda de rota no cliente.
  isFinanceiro: boolean
  // Acesso à Área Administrativa / separador Tracking — hoje é todo o staff.
  isAdministrativo: boolean
  // Gestão de Utilizadores (atribuir roles): exclusivo do role 'admin'.
  isGestorUtilizadores: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthContexto>({
  session: null,
  perfil: null,
  carregando: true,
  perfilCarregado: false,
  role: null,
  isAdmin: false,
  isFinanceiro: false,
  isAdministrativo: false,
  isGestorUtilizadores: false,
  sair: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [perfilCarregado, setPerfilCarregado] = useState(false)
  // Id do utilizador cujo perfil já está (a ser) carregado. Serve para NÃO
  // recarregar o perfil — nem mexer em perfilCarregado — em cada TOKEN_REFRESHED
  // ou revalidação de sessão ao voltar o foco à aba. Sem isto, o AuthGate
  // desmontava a página a cada evento e os formulários perdiam o que estava
  // preenchido.
  const perfilUserIdRef = useRef<string | null>(null)

  async function carregarPerfil(userId: string) {
    perfilUserIdRef.current = userId
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
      if (data.session) {
        if (perfilUserIdRef.current !== data.session.user.id) carregarPerfil(data.session.user.id)
      } else {
        perfilUserIdRef.current = null
        setPerfilCarregado(true)
      }
    })

    // IMPORTANTE: não fazer `await` a chamadas à BD dentro deste callback — o
    // supabase-js usa um lock de auth e isso provoca deadlock (ecrã preso a
    // "A carregar..."). Adiamos com setTimeout para correr fora do callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
      setCarregando(false)
      const novaId = novaSessao?.user?.id ?? null
      if (!novaId) {
        perfilUserIdRef.current = null
        setPerfil(null)
        setPerfilCarregado(true)
        return
      }
      // Só (re)carrega o perfil quando o utilizador MUDA. Num simples refresh de
      // token ou revalidação ao focar a aba, mantemos o perfil e não desmontamos
      // as páginas — os formulários preservam o estado.
      if (novaId !== perfilUserIdRef.current) {
        setPerfilCarregado(false)
        setTimeout(() => carregarPerfil(novaId), 0)
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
      value={{
        session,
        perfil,
        carregando,
        perfilCarregado,
        role: perfil?.role ?? null,
        isAdmin: eStaff(perfil?.role),
        isFinanceiro: temAcessoFinanceiro(perfil?.role),
        isAdministrativo: eStaff(perfil?.role),
        isGestorUtilizadores: perfil?.role === 'admin',
        sair,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
