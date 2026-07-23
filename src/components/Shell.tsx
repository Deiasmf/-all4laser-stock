'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { iniciais } from '@/lib/ui'

// Departamentos podem ter sub-itens (filhos). Itens com filhos são grupos
// recolhíveis (clicar no cabeçalho abre/fecha).
type SubItem = { href: string; label: string; icon: string }
type Item = { href?: string; label: string; icon?: string; badge?: 'leads'; filhos?: SubItem[] }
type Seccao = { titulo: string; itens: Item[] }

const NAV: Seccao[] = [
  { titulo: 'Principal', itens: [{ href: '/', label: 'Dashboard', icon: '🏠' }] },
  {
    titulo: 'Departamentos',
    itens: [
      {
        href: '/admin-dept', label: 'Administrativo', icon: '🗂️',
        filhos: [
          { href: '/admin-dept/expedicao', label: 'Prontos a enviar', icon: '✈️' },
          { href: '/admin-dept/envios-pecas', label: 'Envios de Encomendas', icon: '📬' },
        ],
      },
      { href: '/financeiro', label: 'Financeiro', icon: '💶' },
      {
        href: '/comercial', label: 'Comercial', icon: '🤝',
        filhos: [
          { href: '/comercial/clientes', label: 'Clientes', icon: '👥' },
          { href: '/comercial/registos', label: 'Registos de clientes', icon: '📝' },
          { href: '/comercial/notas-encomenda', label: 'Notas de encomenda', icon: '📋' },
          { href: '/comercial/reservas-portal', label: 'Reservas Portal', icon: '📅' },
        ],
      },
      { href: '/marketing', label: 'Marketing', icon: '📣' },
      {
        href: '/tecnico', label: 'Técnico', icon: '🔧',
        filhos: [
          { href: '/tecnico/folhas-obra', label: 'Folhas de obra', icon: '📝' },
          { href: '/tecnico/preparacao', label: 'Em preparação', icon: '🔧' },
          { href: '/tecnico/pecas-em-falta', label: 'Peças em falta', icon: '🔩' },
        ],
      },
      {
        label: 'Logística', icon: '📦',
        filhos: [
          { href: '/logistico', label: 'Stock', icon: '📦' },
          { href: '/logistico/pecas', label: 'Stock de peças', icon: '🔩' },
          { href: '/logistico/reparacao-pecas', label: 'Reparação de Peças', icon: '🔧' },
          { href: '/logistico/saldos-pecas', label: 'Saldos de Peças', icon: '⚖️' },
          { href: '/logistico/encomendas', label: 'Encomendas', icon: '📦' },
          { href: '/logistico/recepcao', label: 'Processos de Peças', icon: '🔄' },
          { href: '/logistico/recepcao/scan', label: 'Scan QR', icon: '📷' },
          { href: '/logistico/preparacao', label: 'Em preparação', icon: '🧰' },
          { href: '/logistico/encaixotamento', label: 'Encaixotamento', icon: '📫' },
        ],
      },
      { href: '/clinico', label: 'Clínico', icon: '🩺' },
      { href: '/alugueres', label: 'Alugueres', icon: '🔄', badge: 'leads' },
      { href: '/projetos', label: 'Outros Projetos', icon: '🏗️' },
    ],
  },
  {
    titulo: 'Compras',
    itens: [
      { href: '/compras', label: 'Pedidos de Compra', icon: '🛒' },
      { href: '/compras/fornecedores', label: 'Fornecedores', icon: '🏭' },
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
  { prefixo: '/admin-dept/envios-pecas', titulo: 'Envios de Encomendas' },
  { prefixo: '/admin-dept', titulo: 'Administrativo' },
  { prefixo: '/financeiro', titulo: 'Financeiro' },
  { prefixo: '/comercial/notas-encomenda', titulo: 'Notas de Encomenda' },
  { prefixo: '/comercial/clientes', titulo: 'Clientes' },
  { prefixo: '/comercial/reservas-portal', titulo: 'Reservas Portal' },
  { prefixo: '/comercial/registos', titulo: 'Registos de Clientes' },
  { prefixo: '/comercial', titulo: 'Comercial' },
  { prefixo: '/marketing', titulo: 'Marketing' },
  { prefixo: '/tecnico/preparacao', titulo: 'Em Preparação Técnica' },
  { prefixo: '/tecnico/pecas-em-falta', titulo: 'Peças em Falta' },
  { prefixo: '/tecnico', titulo: 'Técnico' },
  { prefixo: '/logistico/saldos-pecas', titulo: 'Saldos de Peças' },
  { prefixo: '/logistico/reparacao-pecas', titulo: 'Peças em Reparação' },
  { prefixo: '/logistico/recepcao/scan', titulo: 'Scan QR' },
  { prefixo: '/logistico/recepcao', titulo: 'Processos de Peças' },
  { prefixo: '/logistico/encomendas', titulo: 'Encomendas' },
  { prefixo: '/logistico/pecas', titulo: 'Stock de Peças' },
  { prefixo: '/logistico/envios-pecas', titulo: 'Envios de Encomendas' },
  { prefixo: '/logistico/preparacao', titulo: 'Em Preparação' },
  { prefixo: '/logistico/encaixotamento', titulo: 'Encaixotamento' },
  { prefixo: '/logistico', titulo: 'Stock (Logística)' },
  { prefixo: '/clinico', titulo: 'Clínico' },
  { prefixo: '/compras/fornecedores', titulo: 'Fornecedores' },
  { prefixo: '/compras', titulo: 'Pedidos de Compra' },
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
  // Grupos recolhíveis: override manual por label (senão abre se contiver a rota ativa)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})

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

  // Sem sessão, no login, na redefinição de password, no link público de assinatura
  // ou no portal de reservas (/reservas/*): só o conteúdo, sem a sidebar interna.
  if (
    !session ||
    pathname === '/login' ||
    pathname === '/redefinir-password' ||
    pathname.startsWith('/assinar') ||
    pathname.startsWith('/reservas') ||
    pathname.startsWith('/registo-cliente')
  ) {
    return <>{children}</>
  }

  function ehAtivo(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Um grupo contém a rota ativa se a própria página ou algum filho estiver ativo.
  function grupoTemAtivo(it: Item) {
    return (!!it.href && ehAtivo(it.href)) || (it.filhos?.some((f) => ehAtivo(f.href)) ?? false)
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
              {sec.itens.map((it) => {
                if (it.filhos) {
                  const aberto = abertos[it.label] ?? grupoTemAtivo(it)
                  return (
                    <div key={it.label}>
                      <button
                        type="button"
                        className="a4l-sb-grupo-btn"
                        onClick={() => setAbertos((a) => ({ ...a, [it.label]: !aberto }))}
                        aria-expanded={aberto}
                      >
                        {it.icon && <span className="a4l-sb-icon">{it.icon}</span>}
                        <span>{it.label}</span>
                        <span className={`a4l-sb-chevron${aberto ? ' aberto' : ''}`}>▸</span>
                      </button>
                      {aberto && it.filhos.map((f) => (
                        <Link
                          key={f.href}
                          href={f.href}
                          className={`a4l-sb-subitem${ehAtivo(f.href) ? ' ativo' : ''}`}
                        >
                          <span className="a4l-sb-subicon">{f.icon}</span>
                          <span>{f.label}</span>
                        </Link>
                      ))}
                    </div>
                  )
                }
                return (
                  <Link
                    key={it.href}
                    href={it.href!}
                    className={`a4l-sb-item${ehAtivo(it.href!) ? ' ativo' : ''}`}
                  >
                    <span className="a4l-sb-icon">{it.icon}</span>
                    <span>{it.label}</span>
                    {it.badge === 'leads' && leadsNovas > 0 && (
                      <span className="a4l-sb-badge">{leadsNovas}</span>
                    )}
                  </Link>
                )
              })}
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
