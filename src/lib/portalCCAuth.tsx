'use client'

// Autenticação do PORTAL DE CONTAS CORRENTES (/portal-cc), separada da auth
// interna (staff). Usa a mesma instância Supabase; a distinção é o claim
// app_metadata.role='portal' (definido na criação, via rota de convite) e a
// existência de contas acessíveis (v_cc_portal_resumo, filtrado por portal_users).
import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { portalContas, traduzir, type PortalResumo, type Lang } from './portalCC'

type PortalCCContexto = {
  session: Session | null
  contas: PortalResumo[]
  contaSelId: string | null
  escolherConta: (id: string) => void
  lang: Lang
  setLang: (l: Lang) => void
  t: (chave: string) => string
  carregando: boolean
  ehPortal: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<PortalCCContexto>({
  session: null, contas: [], contaSelId: null, escolherConta: () => {},
  lang: 'en', setLang: () => {}, t: (c) => c, carregando: true, ehPortal: false,
  sair: async () => {},
})

const LANG_KEY = 'portal_cc_lang'

export function PortalCCAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [contas, setContas] = useState<PortalResumo[]>([])
  const [contaSelId, setContaSelId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const guardado = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null
    // Ler a preferência após montar evita mismatch de hidratação (o servidor não
    // tem localStorage). setState aqui é intencional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardado === 'pt' || guardado === 'en') setLangState(guardado)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    if (typeof window !== 'undefined') window.localStorage.setItem(LANG_KEY, l)
  }

  async function carregarContas() {
    const cs = await portalContas()
    setContas(cs)
    setContaSelId((atual) => atual && cs.some((c) => c.conta_id === atual) ? atual : (cs[0]?.conta_id ?? null))
  }

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSession(data.session)
      if (data.session) await carregarContas()
      else { setContas([]); setContaSelId(null) }
      if (ativo) setCarregando(false)
    })

    // Não fazer await à BD dentro deste callback (lock de auth → deadlock);
    // adiar com setTimeout, como na auth interna e no portal de reservas.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setCarregando(true)
      setSession(novaSessao)
      if (novaSessao) {
        setTimeout(() => { carregarContas().finally(() => { if (ativo) setCarregando(false) }) }, 0)
      } else {
        setContas([]); setContaSelId(null); setCarregando(false)
      }
    })

    return () => { ativo = false; sub.subscription.unsubscribe() }
  }, [])

  async function sair() {
    await supabase.auth.signOut()
    setContas([]); setContaSelId(null)
  }

  const ehPortal = contas.length > 0
    || (session?.user?.app_metadata as { role?: string } | undefined)?.role === 'portal'

  return (
    <Ctx.Provider
      value={{
        session, contas, contaSelId, escolherConta: setContaSelId,
        lang, setLang, t: (chave) => traduzir(lang, chave),
        carregando, ehPortal, sair,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function usePortalCC() {
  return useContext(Ctx)
}
