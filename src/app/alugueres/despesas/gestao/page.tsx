'use client'

// Gestão das Despesas de Alugueres (admin/financeiro): despesas de um mês,
// segmentadas por data (ou por colaborador/tipo/aluguer), com filtros, totais
// e um mini-dashboard por tipo. Clicar numa linha abre o detalhe com a foto.
import { useCallback, useEffect, useMemo, useState } from 'react'
import GuardaFinanceiro from '@/components/despesas/GuardaFinanceiro'
import NavGestao from '@/components/despesas/NavGestao'
import { useAuth } from '@/lib/auth'
import {
  listarDespesasMes, listarColaboradores, listarTodosTipos, resolverNomeTipo,
  conferirDespesa, listarFotosDespesa, urlFotoDespesa, mesFechado, mesCorrente,
  type Colaborador,
} from '@/lib/despesas'
import type { Despesa, DespesaTipo } from '@/types/despesa'

const eur = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const dataPt = (d: string) => { const [a, m, dia] = d.split('-'); return dia ? `${dia}/${m}/${a}` : d }
type Agrupar = 'dia' | 'colaborador' | 'tipo' | 'aluguer'

export default function GestaoDespesasPage() {
  return <GuardaFinanceiro><Conteudo /></GuardaFinanceiro>
}

function Conteudo() {
  const { perfil } = useAuth()
  const autor = useMemo(() => ({ id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }), [perfil])

  const [mes, setMes] = useState(mesCorrente())
  const [fechado, setFechado] = useState(false)
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [tipos, setTipos] = useState<DespesaTipo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [detalhe, setDetalhe] = useState<Despesa | null>(null)

  // Filtros
  const [fColab, setFColab] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [q, setQ] = useState('')
  const [agrupar, setAgrupar] = useState<Agrupar>('dia')

  const nomeColab = useCallback((id: string) => {
    const c = colaboradores.find((x) => x.id === id); return c?.nome ?? c?.email ?? 'Colaborador'
  }, [colaboradores])
  const nomeTipo = useCallback((id: string | null) => resolverNomeTipo(id, tipos), [tipos])

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [ds, fch] = await Promise.all([listarDespesasMes(mes), mesFechado(mes)])
    setDespesas(ds); setFechado(fch); setCarregando(false)
  }, [mes])

  useEffect(() => { listarTodosTipos().then(setTipos); listarColaboradores().then(setColaboradores) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const filtradas = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return despesas.filter((d) => {
      if (fColab && d.colaborador_id !== fColab) return false
      if (fTipo && nomeTipo(d.tipo_id) !== fTipo) return false
      if (fEstado && d.estado !== fEstado) return false
      if (termo) {
        const alvo = `${d.fornecedor ?? ''} ${d.valor} ${d.aluguer_ref ?? ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [despesas, fColab, fTipo, fEstado, q, nomeTipo])

  const total = filtradas.reduce((s, d) => s + Number(d.valor), 0)

  // Totais por tipo (mini-dashboard).
  const porTipo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of filtradas) { const t = nomeTipo(d.tipo_id); m[t] = (m[t] ?? 0) + Number(d.valor) }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtradas, nomeTipo])
  const maxTipo = porTipo[0]?.[1] ?? 0

  // Agrupamento.
  const grupos = useMemo(() => {
    const chave = (d: Despesa) =>
      agrupar === 'dia' ? d.data_despesa
      : agrupar === 'colaborador' ? nomeColab(d.colaborador_id)
      : agrupar === 'tipo' ? nomeTipo(d.tipo_id)
      : (d.aluguer_ref ?? '— sem aluguer —')
    const m = new Map<string, Despesa[]>()
    for (const d of filtradas) { const k = chave(d); (m.get(k) ?? m.set(k, []).get(k)!).push(d) }
    const arr = Array.from(m.entries())
    arr.sort((a, b) => agrupar === 'dia' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0], 'pt'))
    return arr
  }, [filtradas, agrupar, nomeColab, nomeTipo])

  const tiposFiltro = Array.from(new Set(despesas.map((d) => nomeTipo(d.tipo_id)))).sort((a, b) => a.localeCompare(b, 'pt'))

  async function alternarConferida(d: Despesa) {
    if (fechado) return
    const { error } = await conferirDespesa(d.id, d.estado !== 'conferida', autor)
    if (!error) { setDetalhe(null); await carregar() }
  }

  return (
    <main style={c.page}>
      <NavGestao />
      <h1 style={c.titulo}>Despesas de Alugueres</h1>

      {/* Filtros */}
      <div style={c.filtros}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesCorrente())} style={c.input} />
        <select style={c.input} value={fColab} onChange={(e) => setFColab(e.target.value)}>
          <option value="">Todos os colaboradores</option>
          {colaboradores.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome ?? cl.email}</option>)}
        </select>
        <select style={c.input} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tiposFiltro.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={c.input} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos os estados</option>
          <option value="registada">Registada</option>
          <option value="conferida">Conferida</option>
        </select>
        <input style={c.input} placeholder="Pesquisar fornecedor/valor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={c.input} value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
          <option value="dia">Agrupar por dia</option>
          <option value="colaborador">Agrupar por colaborador</option>
          <option value="tipo">Agrupar por tipo</option>
          <option value="aluguer">Agrupar por aluguer</option>
        </select>
      </div>

      {fechado && <div style={c.avisoFechado}>🔒 Mês fechado — apenas consulta.</div>}

      <div style={c.totais}>
        <span><strong>{filtradas.length}</strong> despesas</span>
        <span style={c.totalValor}>{eur(total)}</span>
      </div>

      {/* Mini-dashboard por tipo */}
      {porTipo.length > 0 && (
        <div style={c.dash}>
          {porTipo.map(([t, v]) => (
            <div key={t} style={c.dashLinha}>
              <span style={c.dashTipo}>{t}</span>
              <div style={c.barraWrap}><div style={{ ...c.barra, width: `${maxTipo ? (v / maxTipo) * 100 : 0}%` }} /></div>
              <span style={c.dashValor}>{eur(v)}</span>
            </div>
          ))}
        </div>
      )}

      {carregando ? <p style={c.muted}>A carregar…</p> : grupos.length === 0 ? (
        <p style={c.muted}>Sem despesas para este filtro.</p>
      ) : (
        grupos.map(([chave, itens]) => {
          const subtotal = itens.reduce((s, d) => s + Number(d.valor), 0)
          return (
            <div key={chave} style={c.grupo}>
              <div style={c.grupoCab}>
                <span>{agrupar === 'dia' ? dataPt(chave) : chave}</span>
                <span style={c.grupoTotal}>{eur(subtotal)}</span>
              </div>
              {itens.map((d) => (
                <button key={d.id} style={c.linha} onClick={() => setDetalhe(d)}>
                  <span style={c.lValor}>{eur(Number(d.valor))}</span>
                  <span style={c.lTipo}>{nomeTipo(d.tipo_id)}</span>
                  <span style={c.lMeta}>{nomeColab(d.colaborador_id)}{d.fornecedor ? ` · ${d.fornecedor}` : ''}</span>
                  <span style={{ ...c.lEstado, ...(d.estado === 'conferida' ? c.confSim : c.confNao) }}>
                    {d.estado === 'conferida' ? '✓' : '•'}
                  </span>
                </button>
              ))}
            </div>
          )
        })
      )}

      {detalhe && (
        <Detalhe d={detalhe} nomeColab={nomeColab} nomeTipo={nomeTipo} fechado={fechado}
          onFechar={() => setDetalhe(null)} onConferir={() => alternarConferida(detalhe)} />
      )}
    </main>
  )
}

function Detalhe({ d, nomeColab, nomeTipo, fechado, onFechar, onConferir }: {
  d: Despesa; nomeColab: (id: string) => string; nomeTipo: (id: string | null) => string
  fechado: boolean; onFechar: () => void; onConferir: () => void
}) {
  const [fotos, setFotos] = useState<string[]>([])
  useEffect(() => {
    let ativo = true
    listarFotosDespesa(d.id).then(async (fs) => {
      const urls = (await Promise.all(fs.map((f) => urlFotoDespesa(f.caminho)))).filter(Boolean) as string[]
      if (ativo) setFotos(urls)
    })
    return () => { ativo = false }
  }, [d.id])

  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalTopo}><strong>{eur(Number(d.valor))} · {nomeTipo(d.tipo_id)}</strong>
          <button style={c.fechar} onClick={onFechar} aria-label="Fechar">×</button></div>
        <div style={c.fotos}>
          {fotos.length === 0 ? <span style={c.muted}>Sem foto anexada.</span> : fotos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL temporária
            <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="documento" style={c.foto} /></a>
          ))}
        </div>
        <dl style={c.dl}>
          <L r="Data" v={dataPt(d.data_despesa)} />
          <L r="Colaborador" v={nomeColab(d.colaborador_id)} />
          <L r="Fornecedor" v={d.fornecedor ?? '—'} />
          <L r="IVA" v={d.iva != null ? eur(Number(d.iva)) : '—'} />
          <L r="Nº documento" v={d.num_documento ?? '—'} />
          <L r="Aluguer/cliente" v={d.aluguer_ref ?? '—'} />
          {d.nota && <L r="Nota" v={d.nota} />}
          {d.registado_apos_fecho && <L r="Aviso" v="Registada após o fecho do mês do documento" />}
          <L r="Estado" v={d.estado === 'conferida' ? `Conferida por ${d.conferida_por_nome ?? '—'}` : 'Registada'} />
        </dl>
        {!fechado && (
          <button style={c.btnPri} onClick={onConferir}>
            {d.estado === 'conferida' ? 'Desmarcar conferida' : 'Marcar como conferida'}
          </button>
        )}
      </div>
    </div>
  )
}

function L({ r, v }: { r: string; v: string }) {
  return <div style={c.dlLinha}><dt style={c.dt}>{r}</dt><dd style={c.dd}>{v}</dd></div>
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '0 0 14px' },
  filtros: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  avisoFechado: { background: '#F3F4F6', color: '#374151', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 },
  totais: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', fontSize: 14, color: 'var(--muted)' },
  totalValor: { fontSize: 18, fontWeight: 800, color: 'var(--foreground)' },
  dash: { display: 'flex', flexDirection: 'column', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 14 },
  dashLinha: { display: 'flex', alignItems: 'center', gap: 10 },
  dashTipo: { fontSize: 12.5, width: 120, flexShrink: 0, color: 'var(--foreground)' },
  barraWrap: { flex: 1, background: '#F3F4F6', borderRadius: 999, height: 10, overflow: 'hidden' },
  barra: { height: '100%', background: 'var(--primary)', borderRadius: 999 },
  dashValor: { fontSize: 12.5, fontWeight: 700, width: 90, textAlign: 'right', flexShrink: 0 },
  muted: { color: 'var(--muted)', fontSize: 14, padding: 20, textAlign: 'center' },
  grupo: { marginBottom: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  grupoCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F7F6FF', fontWeight: 700, fontSize: 13.5 },
  grupoTotal: { color: 'var(--foreground)' },
  linha: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid var(--border)', background: '#fff', cursor: 'pointer', font: 'inherit' },
  lValor: { fontWeight: 800, fontSize: 14, width: 90, flexShrink: 0 },
  lTipo: { fontSize: 12.5, color: 'var(--foreground)', background: '#EEF2FF', borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  lMeta: { fontSize: 12.5, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lEstado: { fontSize: 14, fontWeight: 800, width: 20, textAlign: 'center', flexShrink: 0 },
  confSim: { color: '#065F46' },
  confNao: { color: '#D1D5DB' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto', zIndex: 80 },
  modal: { background: '#fff', borderRadius: 14, padding: 16, width: 'min(520px, 100%)', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fechar: { background: 'transparent', border: 'none', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  fotos: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  foto: { maxWidth: 160, maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)' },
  dl: { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  dlLinha: { display: 'flex', gap: 10, fontSize: 13.5 },
  dt: { color: 'var(--muted)', minWidth: 120 },
  dd: { margin: 0, color: 'var(--foreground)', fontWeight: 600 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontWeight: 700, cursor: 'pointer' },
}
