'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Página de diagnóstico (Fase A): valida o acesso da Service Account aos 18
// calendários da frota e mostra quais falham (para corrigir a partilha no Google).

type Res = { id: string; nome: string; zona: string; ok: boolean; nEventos?: number; erro?: string }

export default function ValidarCalendariosPage() {
  const [aCorrer, setACorrer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Res[] | null>(null)

  async function validar() {
    setACorrer(true); setErro(null); setResultados(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setErro('Sessão expirada — volta a entrar.'); return }
      const r = await fetch('/api/alugueres/agenda/validar-calendarios', { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      if (!r.ok || !j.ok) { setErro(j.erro ?? `HTTP ${r.status}`); return }
      setResultados(j.resultados as Res[])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao validar.')
    } finally {
      setACorrer(false)
    }
  }

  const acessiveis = resultados?.filter((r) => r.ok).length ?? 0
  const inacessiveis = resultados?.filter((r) => !r.ok) ?? []

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda" style={c.voltar}>← Agenda</Link>
      <h1 style={c.titulo}>Validar acesso aos calendários</h1>
      <p style={c.sub}>Testa (só-leitura) se a Service Account consegue ler os 18 calendários da frota. Os que falharem precisam de ser partilhados com <code>andreia.fernandes@all4laser.com</code> no Google.</p>

      <button style={c.btn} onClick={validar} disabled={aCorrer}>{aCorrer ? 'A validar…' : 'Validar os 18 calendários'}</button>

      {erro && <div style={c.erro}>{erro}</div>}

      {resultados && (
        <>
          <p style={c.resumo}>
            <strong style={{ color: '#065F46' }}>{acessiveis} acessíveis</strong>
            {inacessiveis.length > 0 && <> · <strong style={{ color: '#B91C1C' }}>{inacessiveis.length} com problema</strong></>}
          </p>
          <div style={c.wrap}>
            <table style={c.tabela}>
              <thead><tr>
                <th style={c.th}>Zona</th><th style={c.th}>Calendário</th><th style={c.th}>Acesso</th><th style={c.th}>Eventos (10d)</th><th style={c.th}>Detalhe</th>
              </tr></thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.id} style={{ ...c.tr, ...(r.ok ? {} : c.trErro) }}>
                    <td style={c.td}>{r.zona}</td>
                    <td style={c.td}>{r.nome}</td>
                    <td style={c.td}>{r.ok ? '✅' : '❌'}</td>
                    <td style={c.td}>{r.ok ? (r.nEventos ?? 0) : '—'}</td>
                    <td style={c.tdMono}>{r.ok ? '' : (r.erro ?? '')}{r.ok ? '' : ''}<span style={c.calId}> {r.id}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1000, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 6px' },
  sub: { color: 'var(--muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 },
  btn: { padding: '10px 18px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  erro: { marginTop: 12, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 13 },
  resumo: { marginTop: 16, fontSize: 15 },
  wrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10, marginTop: 8 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trErro: { background: '#FEF2F2' },
  td: { padding: '8px', verticalAlign: 'top' },
  tdMono: { padding: '8px', verticalAlign: 'top', fontSize: 11, color: '#B91C1C' },
  calId: { color: 'var(--muted)', fontFamily: 'ui-monospace, Menlo, monospace' },
}
