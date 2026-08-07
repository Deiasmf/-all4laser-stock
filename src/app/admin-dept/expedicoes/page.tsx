'use client'

// Lista de Expedições (envios agrupados). Filtros por estado/período, pesquisa
// por nº de expedição, nº de NE ou tracking. Link direto para o Tracking.
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { listarExpeditions, type FiltroExpeditions } from '@/lib/expeditions'
import { ESTADOS_EXPEDITION, estadoExpInfo, type ExpedicaoComContagem, type EstadoExpedition } from '@/types/expedition'

function fdata(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

export default function ExpedicoesPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar…</p>}>
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const searchParams = useSearchParams()
  const [lista, setLista] = useState<ExpedicaoComContagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [estado, setEstado] = useState<EstadoExpedition | ''>('')
  const [procura, setProcura] = useState(searchParams.get('q') ?? '')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const f: FiltroExpeditions = {
      estado: estado || undefined, procura: procura.trim() || undefined,
      de: de || undefined, ate: ate || undefined,
    }
    setLista(await listarExpeditions(f))
    setCarregando(false)
  }, [estado, procura, de, ate])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Expedições</h1>
          <Link href="/admin-dept" style={c.voltar}>← Administrativo</Link>
          {' · '}
          <Link href="/admin-dept/expedicao" style={c.link}>Prontos a Enviar →</Link>
        </div>
        <span style={c.contador}>{lista.length}</span>
      </div>

      <section style={c.filtros}>
        <input style={c.procura} placeholder="Procurar por nº de expedição, nº de NE ou tracking…" value={procura} onChange={(e) => setProcura(e.target.value)} />
        <select style={c.select} value={estado} onChange={(e) => setEstado((e.target.value || '') as EstadoExpedition | '')}>
          <option value="">Estado: todos</option>
          {ESTADOS_EXPEDITION.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <input style={c.data} type="date" value={de} onChange={(e) => setDe(e.target.value)} title="Expedido de" />
        <input style={c.data} type="date" value={ate} onChange={(e) => setAte(e.target.value)} title="Expedido até" />
        {(estado || procura || de || ate) && <button style={c.btnLimpar} onClick={() => { setEstado(''); setProcura(''); setDe(''); setAte('') }}>Limpar</button>}
      </section>

      {carregando ? (
        <p style={c.estado}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.estado}>Sem expedições para os filtros escolhidos.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Expedição</th><th style={c.th}>Cliente</th><th style={c.th}>NEs</th>
                <th style={c.th}>Conteúdo</th><th style={c.th}>Estado</th><th style={c.th}>Tracking</th><th style={c.th}>Expedição</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const est = estadoExpInfo(e.estado)
                const tk = e.tracking_numero || e.awb_numero
                return (
                  <tr key={e.id} style={c.tr}>
                    <td style={{ ...c.td, fontWeight: 700 }}><Link href={`/admin-dept/expedicoes/${e.id}`} style={c.link}>{e.numero ?? '—'}</Link></td>
                    <td style={c.td}>{e.cliente_nome ?? '—'}</td>
                    <td style={c.td}>{e.n_notas}</td>
                    <td style={{ ...c.td, whiteSpace: 'normal', maxWidth: 260 }}>{e.resumo || '—'}</td>
                    <td style={c.td}><span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span></td>
                    <td style={c.td}>{tk ? <Link href={`/admin-dept/tracking?q=${encodeURIComponent(tk)}`} style={c.link}>{tk} ↗</Link> : '—'}</td>
                    <td style={c.td}>{fdata(e.data_expedicao)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1160, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  link: { color: 'var(--primary)', textDecoration: 'none' },
  contador: { color: 'var(--muted)', fontSize: 14, alignSelf: 'center' },
  filtros: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  procura: { flex: '1 1 260px', minWidth: 200, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: 'var(--background)', color: 'var(--foreground)' },
  select: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: 'var(--surface)', color: 'var(--foreground)' },
  data: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: 'var(--background)', color: 'var(--foreground)' },
  btnLimpar: { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '11px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap', verticalAlign: 'top' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
}
