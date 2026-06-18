'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { iniciais } from '@/lib/ui'

// grupo: rótulo não clicável (cabeçalho de departamento); subitem: indentado por baixo
type Item = { href?: string; label: string; icon?: string; badge?: 'leads'; grupo?: boolean; subitem?: boolean }
type Seccao = { titulo: string; itens: Item[] }

const NAV: Seccao[] = [
  { titulo: 'Principal', itens: [{ href: '/', label: 'Dashboard', icon: '🏠' }] },
  {
    titulo: 'Departamentos',
    itens: [
      { href: '/admin-dept', label: 'Administrativo', icon: '🗂️' },
      { href: '/admin-dept/expedicao', label: 'Prontos a Enviar', icon: '✈️', subitem: true },
      { href: '/financeiro', label: 'Financeiro', icon: '💶' },
      { href: '/comercial', label: 'Comercial', icon: '🤝' },
      { href: '/comercial/notas-encomenda', label: 'Notas de Encomenda', icon: '📋', subitem: true },
      { href: '/marketing', label: 'Marketing', icon: '📣' },
      { href: '/tecnico', label: 'Técnico', icon: '🔧' },
      { href: '/tecnico/folhas-obra', label: 'Folhas de Obra', subitem: true },
      { href: '/tecnico/preparacao', label: 'Em Preparação', icon: '🔧', subitem: true },
      { label: 'Logística', icon: '📦', grupo: true },
      { href: '/logistico', label: 'Stock', subitem: true },
      { href: '/logistico/pecas', label: 'Stock de Peças', subitem: true },
      { href: '/logistico/preparacao', label: 'Em Preparação', icon: '📦', subitem: true },
      { href: '/logistico/encaixotamento', label: 'Encaixotamento', icon: '📫', subitem: true },
      { href: '/clinico', label: 'Clínico', icon: '🩺' },
      { href: '/alugueres', label: 'Alugueres', icon: '🔄', badge: 'leads' },
      { href: '/projetos', label: 'Outros Projetos', icon: '🏗️' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [{ href: '/processos', label: 'Processos', icon: '📋' }],
  },
]

// Título da página a partir da rota (mais específico primeiro).
const TITULOS: { prefixo: string; titulo: string }[] = [
  { prefixo: '/admin-dept/expedicao', titulo: 'Prontos a Enviar' },
  { prefixo: '/admin-dept', titulo: 'Administrativo' },
  { prefixo: '/financeiro', titulo: 'Financeiro' },
  { prefixo: '/comercial/notas-encomenda', titulo: 'Notas de Encomenda' },
  { prefixo: '/comercial', titulo: 'Comercial' },
  { prefixo: '/marketing', titulo: 'Marketing' },
  { prefixo: '/tecnico/preparacao', titulo: 'Em Preparação Técnica' },
  { prefixo: '/tecnico', titulo: 'Técnico' },
  { prefixo: '/logistico/pecas', titulo: 'Stock de Peças' },
  { prefixo: '/logistico/preparacao', titulo: 'Em Preparação' },
  { prefixo: '/logistico/encaixotamento', titulo: 'Encaixotamento' },
  { prefixo: '/logistico', titulo: 'Stock (Logística)' },
  { prefixo: '/clinico', titulo: 'Clínico' },
  { prefixo: '/alugueres', titulo: 'Alugueres' },
  { prefixo: '/projetos', titulo: 'Outros Projetos' },
  { prefixo: '/processos', titulo: 'Processos' },
  { prefixo: '/equipamentos', titulo: 'Stock (Logística)' },
  { prefixo: '/', titulo: 'Dashboard' },
]

function tituloDaRota(path: string): string {
  if (path === '/') return 'Dashboard'
  const m = TITULOS.find((t) => t.prefixo !== '/' && (path === t.prefixo || path.startsWith(t.prefixo + '/')))
  return m?.titulo ?? 'All4laser'
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, perfil, sair } = useAuth()
  const pathname = usePathname()
  const [leadsNovas, setLeadsNovas] = useState(0)
  const [menuAberto, setMenuAberto] = useState(false)

  // Contagem de leads novas (badge). Se a tabela falhar, fica 0.
  useEffect(() => {
    if (!session) return
    let ativo = true
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'nova')
      .then(({ count }) => {
        if (ativo) setLeadsNovas(count ?? 0)
      })
    return () => {
      ativo = false
    }
  }, [session, pathname])

  // Fecha o menu mobile ao mudar de rota (ajuste durante o render — sem efeito).
  const [rotaAnterior, setRotaAnterior] = useState(pathname)
  if (pathname !== rotaAnterior) {
    setRotaAnterior(pathname)
    setMenuAberto(false)
  }

  // Sem sessão, no login ou no link público de assinatura: só o conteúdo, sem sidebar.
  if (!session || pathname === '/login' || pathname.startsWith('/assinar')) {
    return <>{children}</>
  }

  function ehAtivo(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const nome = perfil?.nome ?? perfil?.email ?? 'Utilizador'
  const ini = iniciais(perfil?.nome, perfil?.email)

  return (
    <div className="a4l-shell">
      <aside className={`a4l-sidebar${menuAberto ? ' aberta' : ''}`}>
        <div className="a4l-sb-top">
          <div className="a4l-sb-mark">A</div>
          <div>
            <div className="a4l-sb-name">All4laser</div>
            <div className="a4l-sb-sub">Plataforma Interna</div>
          </div>
        </div>

        <nav className="a4l-sb-nav">
          {NAV.map((sec) => (
            <div key={sec.titulo}>
              <div className="a4l-sb-section">{sec.titulo}</div>
              {sec.itens.map((it) =>
                it.grupo ? (
                  <div key={it.label} className="a4l-sb-grupo">
                    {it.icon && <span className="a4l-sb-icon">{it.icon}</span>}
                    <span>{it.label}</span>
                  </div>
                ) : (
                  <Link
                    key={it.href}
                    href={it.href!}
                    className={`a4l-sb-item${it.subitem ? ' a4l-sb-sub' : ''}${ehAtivo(it.href!) ? ' ativo' : ''}`}
                  >
                    {!it.subitem && <span className="a4l-sb-icon">{it.icon}</span>}
                    <span>{it.label}</span>
                    {it.badge === 'leads' && leadsNovas > 0 && (
                      <span className="a4l-sb-badge">{leadsNovas}</span>
                    )}
                  </Link>
                )
              )}
            </div>
          ))}
        </nav>

        <div className="a4l-sb-foot">
          <div className="a4l-avatar">{ini}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="a4l-sb-foot-nome">{nome}</div>
            <div className="a4l-sb-foot-role">{perfil?.role ?? 'viewer'}</div>
          </div>
          <button
            onClick={sair}
            title="Sair"
            aria-label="Sair"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: 16,
              padding: 4,
            }}
          >
            ⎋
          </button>
        </div>
      </aside>

      {menuAberto && <div className="a4l-backdrop" onClick={() => setMenuAberto(false)} />}

      <div className="a4l-main-wrap">
        <header className="a4l-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="a4l-burger" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
              ☰
            </button>
            <div>
              <div className="a4l-topbar-title">{tituloDaRota(pathname)}</div>
              <div className="a4l-topbar-crumb">All4laser · Plataforma Interna</div>
            </div>
          </div>
          <div className="a4l-topbar-right">
            {leadsNovas > 0 && (
              <Link href="/alugueres/leads" className="a4l-pill-leads">
                🔔 {leadsNovas} {leadsNovas === 1 ? 'lead nova' : 'leads novas'}
              </Link>
            )}
            <div className="a4l-avatar" title={nome}>{ini}</div>
          </div>
        </header>
        <main className="a4l-main">{children}</main>
      </div>
    </div>
  )
}
