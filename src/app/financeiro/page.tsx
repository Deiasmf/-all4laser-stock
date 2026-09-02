'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { documentosAExpirar, diasAteValidade, type DocumentoCofre } from '@/lib/cofre'
import { resumoInatividade, type ResumoInatividade } from '@/lib/inatividade'
import { resumoRecolhas, type ResumoRecolhas } from '@/lib/recolhas'

// Dashboard do módulo Financeiro. O acesso está protegido pela guarda (layout)
// e pela RLS na base de dados.
type Cartao = { href: string; titulo: string; icon: string; descricao: string }

const CARTOES: Cartao[] = [
  { href: '/pedidos-fatura', titulo: 'Pedidos de Fatura', icon: '🧾', descricao: 'Emitir faturas e pró-formas pedidas pela equipa e enviar ao cliente.' },
  { href: '/financeiro/tabelas', titulo: 'Folhas de Cálculo', icon: '📊', descricao: 'Criar tabelas do zero, guardar, exportar (Excel/PDF), anexar e enviar.' },
  { href: '/financeiro/contas-correntes', titulo: 'Contas Correntes', icon: '📈', descricao: 'Saldos por cliente e fornecedor.' },
  { href: '/financeiro/keyinvoice', titulo: 'Keyinvoice', icon: '🔗', descricao: 'Importar faturas e pró-formas, classificadas por cliente e por natureza.' },
  { href: '/financeiro/pedidos-pagamento', titulo: 'Pedidos de Pagamento', icon: '📨', descricao: 'O que está por receber, com o pedido de pagamento ao cliente.' },
  { href: '/financeiro/documentos', titulo: 'Documentos', icon: '🧾', descricao: 'Faturas, recibos e notas de crédito — categorizar e exportar.' },
  { href: '/financeiro/categorias', titulo: 'Categorias e Regras', icon: '🏷️', descricao: 'Categorias/subcategorias e regras automáticas de categorização.' },
  { href: '/financeiro/cofre', titulo: 'Cofre de Documentos', icon: '🔐', descricao: 'Cartões, contas bancárias, certidões, contratos, seguros.' },
  { href: '/financeiro/recolhas', titulo: 'Recolhas', icon: '💰', descricao: 'Cobranças e recolha de equipamentos.' },
  { href: '/financeiro/alertas', titulo: 'Alertas', icon: '🔔', descricao: 'Vencimentos, saldos e divergências.' },
]

export default function FinanceiroDashboard() {
  const [aExpirar, setAExpirar] = useState<DocumentoCofre[]>([])
  const [inativos, setInativos] = useState<ResumoInatividade | null>(null)
  const [recolhas, setRecolhas] = useState<ResumoRecolhas | null>(null)

  useEffect(() => { documentosAExpirar(30).then(setAExpirar) }, [])
  useEffect(() => { resumoInatividade().then(setInativos) }, [])
  useEffect(() => { resumoRecolhas().then(setRecolhas) }, [])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>💶 Financeiro</h1>
        <p style={c.sub}>Área restrita a administração e financeiro.</p>
      </div>

      {/* Destaque: documentos do cofre a expirar */}
      {aExpirar.length > 0 && (
        <Link href="/financeiro/cofre" style={c.alerta}>
          <div style={c.alertaTop}>⚠️ {aExpirar.length} documento(s) a expirar nos próximos 30 dias</div>
          <div style={c.alertaLista}>
            {aExpirar.slice(0, 4).map((d) => {
              const n = diasAteValidade(d.data_validade) ?? 0
              return <span key={d.id} style={c.alertaItem}>{d.titulo} — {n < 0 ? 'expirado' : `${n}d`}</span>
            })}
            {aExpirar.length > 4 && <span style={c.alertaItem}>+{aExpirar.length - 4}</span>}
          </div>
        </Link>
      )}

      {/* Card: clientes inativos (alugueres) */}
      {inativos && (inativos.atencao > 0 || inativos.critico > 0) && (
        <Link href="/alugueres/inatividade" style={c.inativos}>
          <span style={c.inativosIcon}>😴</span>
          <div style={{ flex: 1 }}>
            <div style={c.inativosTit}>Clientes sem alugar</div>
            <div style={c.inativosLinha}>
              <span><strong style={{ color: '#92400E' }}>{inativos.atencao}</strong> há 30+ dias</span>
              <span><strong style={{ color: '#B91C1C' }}>{inativos.critico}</strong> há 45+ dias (crítico)</span>
            </div>
          </div>
          <span style={c.inativosSeta}>→</span>
        </Link>
      )}

      {/* Card: recolhas de equipamento em curso / atrasadas */}
      {recolhas && recolhas.emCurso > 0 && (
        <Link href="/financeiro/recolhas" style={c.inativos}>
          <span style={c.inativosIcon}>🚚</span>
          <div style={{ flex: 1 }}>
            <div style={c.inativosTit}>Recolhas de equipamento</div>
            <div style={c.inativosLinha}>
              <span><strong style={{ color: '#1E40AF' }}>{recolhas.emCurso}</strong> em curso</span>
              {recolhas.atrasadas > 0 && <span><strong style={{ color: '#B91C1C' }}>{recolhas.atrasadas}</strong> atrasada(s)</span>}
            </div>
          </div>
          <span style={c.inativosSeta}>→</span>
        </Link>
      )}

      <div style={c.grelha}>
        {CARTOES.map((k) => (
          <Link key={k.href} href={k.href} style={c.cartao}>
            <span style={c.cartaoIcon}>{k.icon}</span>
            <span style={c.cartaoTitulo}>{k.titulo}</span>
            <span style={c.cartaoDesc}>{k.descricao}</span>
          </Link>
        ))}
      </div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 20 },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 14 },
  alerta: { display: 'block', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: 14, marginBottom: 16, textDecoration: 'none', color: '#92400E' },
  alertaTop: { fontWeight: 700, fontSize: 14, marginBottom: 6 },
  alertaLista: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  alertaItem: { fontSize: 12.5, background: '#fff', borderRadius: 999, padding: '2px 10px', border: '1px solid #FCD34D' },
  inativos: { display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16, textDecoration: 'none', color: 'var(--foreground)' },
  inativosIcon: { fontSize: 26 },
  inativosTit: { fontWeight: 700, fontSize: 14, color: 'var(--primary)' },
  inativosLinha: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--muted)', marginTop: 2 },
  inativosSeta: { color: 'var(--muted)', fontSize: 18 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  cartao: { display: 'flex', flexDirection: 'column', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18, textDecoration: 'none', color: 'var(--foreground)' },
  cartaoIcon: { fontSize: 28 },
  cartaoTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--primary)' },
  cartaoDesc: { fontSize: 13, color: 'var(--muted)' },
}
