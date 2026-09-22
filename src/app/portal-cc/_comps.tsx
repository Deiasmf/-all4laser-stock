'use client'

// Componentes partilhados das páginas do portal (ficheiro com _ → fora do routing).
import { usePortalCC } from '@/lib/portalCCAuth'
import { estadoLabel, CONTACTO_EMAIL } from '@/lib/portalCC'

export function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={est.cartao}>
      <h1 style={est.titulo}>{titulo}</h1>
      {children}
    </section>
  )
}

export function AtualizadoEm() {
  const { t } = usePortalCC()
  const agora = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return <p style={est.atualizado}>{t('updated_at')} {agora}</p>
}

export function Contacto() {
  const { t } = usePortalCC()
  return (
    <p style={est.contacto}>
      {t('contact_note')}{' '}
      <a href={`mailto:${CONTACTO_EMAIL}`} style={est.contactoLink}>{t('contact_link')}</a>
    </p>
  )
}

const CORES: Record<string, { cor: string; bg: string }> = {
  em_stock: { cor: '#1E40AF', bg: '#DBEAFE' },
  vendido: { cor: '#065F46', bg: '#D1FAE5' },
  devolvido: { cor: '#92400E', bg: '#FEF3C7' },
  cancelado: { cor: '#6B7280', bg: '#F3F4F6' },
  confirmada: { cor: '#1E40AF', bg: '#DBEAFE' },
  recebida: { cor: '#065F46', bg: '#D1FAE5' },
  registada: { cor: '#92400E', bg: '#FEF3C7' },
  pendente: { cor: '#92400E', bg: '#FEF3C7' },
  paga: { cor: '#065F46', bg: '#D1FAE5' },
  parcial: { cor: '#1E40AF', bg: '#DBEAFE' },
  atrasada: { cor: '#B91C1C', bg: '#FEE2E2' },
}

export function Pill({ estado }: { estado: string }) {
  const { lang } = usePortalCC()
  const c = CORES[estado] ?? { cor: '#6B7280', bg: '#F3F4F6' }
  return <span style={{ ...est.pill, color: c.cor, background: c.bg }}>{estadoLabel(lang, estado)}</span>
}

export function Vazio() {
  const { t } = usePortalCC()
  return <p style={est.vazio}>{t('no_data')}</p>
}

export function ACarregar() {
  const { t } = usePortalCC()
  return <p style={est.vazio}>{t('loading')}</p>
}

const est: Record<string, React.CSSProperties> = {
  cartao: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 14, padding: 20, marginBottom: 16 },
  titulo: { fontSize: 20, fontWeight: 800, color: 'var(--primary, #0b3d2e)', marginBottom: 4 },
  atualizado: { fontSize: 12, color: '#9ca3af', marginBottom: 14 },
  contacto: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  contactoLink: { color: 'var(--primary, #0b3d2e)', fontWeight: 700 },
  pill: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  vazio: { color: '#9ca3af', padding: 12 },
}

// Estilos de tabela reutilizáveis pelas páginas.
export const tabelaEst: Record<string, React.CSSProperties> = {
  tabela: { border: '1px solid #eef0f3', borderRadius: 10, overflowX: 'auto' },
  cab: { fontWeight: 700, color: '#9ca3af', fontSize: 12, borderBottom: '2px solid #eef0f3', background: '#fafbfc' },
  linha: { borderBottom: '1px solid #f3f4f6', alignItems: 'center', fontSize: 13.5 },
  cel: { padding: '10px 12px' },
}
