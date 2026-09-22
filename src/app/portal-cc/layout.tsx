'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PortalCCAuthProvider, usePortalCC } from '@/lib/portalCCAuth'

export default function PortalCCLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalCCAuthProvider>
      <Guarda>{children}</Guarda>
    </PortalCCAuthProvider>
  )
}

function Guarda({ children }: { children: React.ReactNode }) {
  const { session, carregando, ehPortal, t } = usePortalCC()
  const pathname = usePathname()
  const router = useRouter()
  const ehLogin = pathname === '/portal-cc/login'

  useEffect(() => {
    if (carregando) return
    if (!session && !ehLogin) router.replace('/portal-cc/login')
  }, [carregando, session, ehLogin, router])

  // A página de login é pública.
  if (ehLogin) return <Casca semNav>{children}</Casca>

  if (carregando) return <Centro>{t('loading')}</Centro>
  if (!session) return <Centro>{t('loading')}</Centro>
  if (!ehPortal) {
    return (
      <Casca semNav>
        <div style={est.aviso}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>🔒</p>
          <p>{t('no_access')}</p>
        </div>
      </Casca>
    )
  }
  return <Casca>{children}</Casca>
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div style={est.centro}>{children}</div>
}

const NAV = [
  { href: '/portal-cc', chave: 'nav_summary', exato: true },
  { href: '/portal-cc/equipamentos', chave: 'nav_equipment' },
  { href: '/portal-cc/vendas', chave: 'nav_sales' },
  { href: '/portal-cc/prestacoes', chave: 'nav_installments' },
  { href: '/portal-cc/extrato', chave: 'nav_statement' },
  { href: '/portal-cc/documentos', chave: 'nav_documents' },
]

function Casca({ children, semNav }: { children: React.ReactNode; semNav?: boolean }) {
  const { contas, contaSelId, escolherConta, lang, setLang, t, sair, session } = usePortalCC()
  const pathname = usePathname()
  const ativo = (href: string, exato?: boolean) => (exato ? pathname === href : pathname === href || pathname.startsWith(href + '/'))

  return (
    <div style={est.pagina}>
      <header style={est.header}>
        <div style={est.headerInner}>
          <Link href="/portal-cc" style={est.marca}>
            <span style={est.marcaMark}>A</span>
            <span>{t('brand')}</span>
          </Link>
          <div style={est.headerDir}>
            <div style={est.langBox}>
              <button style={{ ...est.langBtn, ...(lang === 'en' ? est.langAtivo : {}) }} onClick={() => setLang('en')}>EN</button>
              <button style={{ ...est.langBtn, ...(lang === 'pt' ? est.langAtivo : {}) }} onClick={() => setLang('pt')}>PT</button>
            </div>
            {!semNav && contas.length > 1 && (
              <select value={contaSelId ?? ''} onChange={(e) => escolherConta(e.target.value)} style={est.contaSel} aria-label={t('account')}>
                {contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.conta_nome}</option>)}
              </select>
            )}
            {session && <button style={est.sairBtn} onClick={sair}>{t('logout')}</button>}
          </div>
        </div>
        {!semNav && (
          <nav style={est.nav}>
            <div style={est.navInner}>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} style={{ ...est.navLink, ...(ativo(n.href, n.exato) ? est.navAtivo : {}) }}>
                  {t(n.chave)}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main style={est.main}>{children}</main>
      <footer style={est.footer}>All4laser · {new Date().getFullYear()}</footer>
    </div>
  )
}

const est: Record<string, React.CSSProperties> = {
  pagina: { minHeight: '100vh', background: '#F5F6F8', display: 'flex', flexDirection: 'column' },
  header: { background: '#fff', borderBottom: '1px solid #e6e8ec', position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { maxWidth: 1000, margin: '0 auto', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  marca: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--primary, #0b3d2e)', fontWeight: 800, fontSize: 15 },
  marcaMark: { display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: 'var(--primary, #0b3d2e)', color: '#fff', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  headerDir: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  langBox: { display: 'inline-flex', border: '1px solid #e6e8ec', borderRadius: 999, overflow: 'hidden' },
  langBtn: { border: 'none', background: '#fff', padding: '5px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', color: '#6b7280' },
  langAtivo: { background: 'var(--primary, #0b3d2e)', color: '#fff' },
  contaSel: { padding: '7px 10px', border: '1px solid #e6e8ec', borderRadius: 8, font: 'inherit', fontSize: 13.5 },
  sairBtn: { background: '#fff', color: '#6b7280', border: '1px solid #e6e8ec', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 },
  nav: { borderTop: '1px solid #f0f1f4' },
  navInner: { maxWidth: 1000, margin: '0 auto', padding: '0 12px', display: 'flex', gap: 4, overflowX: 'auto' },
  navLink: { padding: '12px 14px', textDecoration: 'none', color: '#6b7280', fontWeight: 600, fontSize: 14, borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  navAtivo: { color: 'var(--primary, #0b3d2e)', borderBottomColor: 'var(--primary, #0b3d2e)' },
  main: { maxWidth: 1000, margin: '0 auto', padding: 20, width: '100%', boxSizing: 'border-box', flex: 1 },
  footer: { textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 20 },
  centro: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' },
  aviso: { textAlign: 'center', color: '#6b7280', padding: 40 },
}
