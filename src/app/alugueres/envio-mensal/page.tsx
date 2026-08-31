'use client'

// Envio mensal de faturas de aluguer em lote. Lista as faturas do mês por enviar,
// pré-valida (email? PDF?), e envia cada cliente NO SEU email individual (nunca
// agrupa). Relatório final com falhas e reenvio. Acesso: admin + financeiro.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { mesAtual, nomeMes, formatarEuro } from '@/lib/alugueres'
import { nFaturaDoNome, type TemplateChave } from '@/lib/faturaEmailRender'
import type { Aluguer } from '@/types/aluguer'

type Fat = {
  id: string; aluguer_id: string; mes: string; valor_a_faturar: number | null; nao_faturar: boolean
  fatura_url: string | null; fatura_nome: string | null; fatura_enviada_em: string | null
}
type Cliente = { id: string; email: string | null; email_faturacao: string | null }

type Linha = {
  fat: Fat; aluguer: Aluguer; email: string; temPdf: boolean; temEmail: boolean; nFatura: string
}

export default function EnvioMensalPage() {
  const { isAdmin, isFinanceiro, perfilCarregado } = useAuth()
  const podeAceder = isAdmin || isFinanceiro
  const [mes, setMes] = useState(mesAtual())
  const [chave, setChave] = useState<TemplateChave>('normal')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [aEnviar, setAEnviar] = useState(false)
  const [relatorio, setRelatorio] = useState<{ faturacaoId: string; estado: string; motivo?: string; cliente: string }[] | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [rf, ra, rc] = await Promise.all([
      supabase.from('alugueres_faturacao_mensal').select('id, aluguer_id, mes, valor_a_faturar, nao_faturar, fatura_url, fatura_nome, fatura_enviada_em').eq('mes', mes),
      supabase.from('alugueres').select('*'),
      supabase.from('clientes').select('id, email, email_faturacao').limit(5000),
    ])
    const alugueres = new Map<string, Aluguer>()
    for (const a of (ra.data as Aluguer[] | null) ?? []) alugueres.set(a.id, a)
    const clientes = new Map<string, Cliente>()
    for (const c of (rc.data as Cliente[] | null) ?? []) clientes.set(c.id, c)

    const ls: Linha[] = []
    for (const f of (rf.data as Fat[] | null) ?? []) {
      if (f.nao_faturar || f.fatura_enviada_em) continue   // por enviar e para faturar
      const aluguer = alugueres.get(f.aluguer_id)
      if (!aluguer) continue
      const cli = aluguer.cliente_id ? clientes.get(aluguer.cliente_id) : undefined
      const email = (cli?.email_faturacao || cli?.email || '').trim()
      ls.push({
        fat: f, aluguer, email,
        temPdf: !!f.fatura_url, temEmail: email.includes('@'), nFatura: nFaturaDoNome(f.fatura_nome),
      })
    }
    ls.sort((a, b) => (a.aluguer.cliente_nome ?? '').localeCompare(b.aluguer.cliente_nome ?? '', 'pt'))
    setLinhas(ls)
    // Pré-selecionar as que passam a validação (têm PDF + email).
    setSel(new Set(ls.filter((l) => l.temPdf && l.temEmail).map((l) => l.fat.id)))
    setRelatorio(null)
    setCarregando(false)
  }, [mes])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (podeAceder) carregar() }, [podeAceder, carregar])

  const validas = useMemo(() => linhas.filter((l) => l.temPdf && l.temEmail), [linhas])
  const semPdf = linhas.filter((l) => !l.temPdf).length
  const semEmail = linhas.filter((l) => l.temPdf && !l.temEmail).length

  function toggle(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function enviar(faturacaoIds: string[]) {
    if (faturacaoIds.length === 0) return
    setAEnviar(true)
    const porId = new Map(linhas.map((l) => [l.fat.id, l]))
    const itens = faturacaoIds.map((id) => {
      const l = porId.get(id)!
      return { faturacaoId: id, para: l.email, templateChave: chave }
    })
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    const r = await fetch('/api/alugueres/enviar-faturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ itens }),
    })
    const dados = await r.json().catch(() => ({}))
    setAEnviar(false)
    if (!r.ok || !dados.ok) { alert('Erro: ' + (dados.erro ?? 'falha no envio')); return }
    const res = (dados.resultados ?? []) as { faturacaoId: string; estado: string; motivo?: string }[]
    setRelatorio(res.map((x) => ({ ...x, cliente: porId.get(x.faturacaoId)?.aluguer.cliente_nome ?? '—' })))
    await carregar()   // atualiza a lista (enviadas saem)
  }

  if (perfilCarregado && !podeAceder) return <main style={c.page}><p style={c.muted}>Sem acesso. Esta área é para admin/financeiro.</p></main>

  const falhadas = relatorio?.filter((r) => r.estado === 'falhou') ?? []

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <Link href="/alugueres/lista" style={c.voltar}>← Alugueres</Link>
          <h1 style={c.titulo}>Envio mensal de faturas</h1>
        </div>
        <Link href="/definicoes/faturas-email" style={c.link}>Editar templates →</Link>
      </div>

      <div style={c.filtros}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.input} />
        <select value={chave} onChange={(e) => setChave(e.target.value as TemplateChave)} style={c.input}>
          <option value="normal">Template normal</option>
          <option value="curto">Template curto</option>
        </select>
      </div>

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          <div style={c.resumo}>
            <span>{nomeMes(mes)} · <strong>{linhas.length}</strong> por enviar · <strong>{validas.length}</strong> prontas</span>
            {semPdf > 0 && <span style={c.avisoChip}>⚠ {semPdf} sem PDF</span>}
            {semEmail > 0 && <span style={c.avisoChip}>⚠ {semEmail} sem email</span>}
          </div>

          {relatorio && (
            <div style={c.relatorio}>
              <strong>Relatório:</strong> {relatorio.filter((r) => r.estado === 'enviado').length} enviadas · {falhadas.length} falhadas
              {falhadas.length > 0 && (
                <>
                  <ul style={c.falhasLista}>
                    {falhadas.map((f) => <li key={f.faturacaoId}>{f.cliente} — {f.motivo ?? 'falha'}</li>)}
                  </ul>
                  <button style={c.btnSec} onClick={() => enviar(falhadas.map((f) => f.faturacaoId))} disabled={aEnviar}>Reenviar falhadas</button>
                </>
              )}
            </div>
          )}

          {linhas.length === 0 ? (
            <p style={c.muted}>Nenhuma fatura por enviar neste mês. 🎉</p>
          ) : (
            <>
              <div style={c.barra}>
                <label style={c.selAll}>
                  <input type="checkbox" checked={sel.size === validas.length && validas.length > 0}
                    onChange={(e) => setSel(e.target.checked ? new Set(validas.map((l) => l.fat.id)) : new Set())} />
                  Selecionar todas as prontas ({validas.length})
                </label>
                <button style={c.btnPrimario} disabled={aEnviar || sel.size === 0} onClick={() => enviar([...sel])}>
                  {aEnviar ? 'A enviar…' : `Enviar ${sel.size} fatura(s)`}
                </button>
              </div>

              <div style={c.tabelaWrap}>
                <table style={c.tabela}>
                  <thead><tr><th style={c.th}></th><th style={c.th}>Cliente</th><th style={c.th}>Equipamento</th><th style={c.th}>Valor</th><th style={c.th}>Email</th><th style={c.th}>PDF</th></tr></thead>
                  <tbody>
                    {linhas.map((l) => {
                      const pronta = l.temPdf && l.temEmail
                      return (
                        <tr key={l.fat.id} style={{ ...c.tr, ...(pronta ? {} : c.trAviso) }}>
                          <td style={c.tdCheck}><input type="checkbox" disabled={!pronta} checked={sel.has(l.fat.id)} onChange={() => toggle(l.fat.id)} /></td>
                          <td style={c.td}>{l.aluguer.cliente_nome ?? '—'}</td>
                          <td style={c.td}>{l.aluguer.modelo ?? '—'} · SN {l.aluguer.serial_number ?? '—'}</td>
                          <td style={c.td}>{l.fat.valor_a_faturar != null ? formatarEuro(l.fat.valor_a_faturar) : '—'}</td>
                          <td style={c.td}>{l.temEmail ? l.email : <span style={c.vermelho}>sem email</span>}</td>
                          <td style={c.td}>{l.temPdf ? '✓' : <span style={c.vermelho}>sem PDF</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  link: { color: 'var(--primary)', textDecoration: 'none', fontSize: 14 },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--primary)', margin: '4px 0' },
  muted: { color: 'var(--muted)', padding: 20 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, background: 'var(--background)', color: 'var(--foreground)' },
  resumo: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 },
  avisoChip: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  relatorio: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 },
  falhasLista: { margin: '8px 0', paddingLeft: 18, color: '#B91C1C', fontSize: 13 },
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  selAll: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '10px 12px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border)' },
  trAviso: { background: '#FFFBEB' },
  tdCheck: { padding: '10px 8px 10px 12px', width: 34 },
  td: { padding: '10px 12px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  vermelho: { color: '#B91C1C', fontWeight: 600 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', marginTop: 6 },
}
