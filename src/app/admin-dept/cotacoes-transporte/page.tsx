'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarPedidos, contagensPedidos, duplicarPedido, obterSettings,
  type FiltroPedidos, type ContagemPedido,
} from '@/lib/freight'
import {
  ESTADOS_PEDIDO, estadoPedidoInfo, TIPOS_TRANSPORTE, tipoTransporteLabel, destinoCurto,
  type FreightRequest, type EstadoPedido, type TipoTransporte,
} from '@/types/freight'

// Nº de dias úteis entre uma data e hoje.
function diasUteisDesde(iso: string): number {
  const d = new Date(iso); const hoje = new Date()
  let dias = 0
  const cur = new Date(d)
  while (cur < hoje) {
    cur.setDate(cur.getDate() + 1)
    const w = cur.getDay()
    if (w !== 0 && w !== 6) dias++
  }
  return dias
}

export default function CotacoesTransportePage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>A carregar…</p>}>
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const { isAdministrativo, perfil, perfilCarregado } = useAuth()
  const router = useRouter()
  const [lista, setLista] = useState<FreightRequest[]>([])
  const [contagens, setContagens] = useState<Record<string, ContagemPedido>>({})
  const [diasAlerta, setDiasAlerta] = useState(3)
  const [aCarregar, setACarregar] = useState(true)
  const [filtro, setFiltro] = useState<FiltroPedidos>({})
  const [procura, setProcura] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    const f: FiltroPedidos = { ...filtro, procura: procura.trim() || undefined }
    const [ls, cs, st] = await Promise.all([listarPedidos(f), contagensPedidos(), obterSettings()])
    setLista(ls); setContagens(cs); if (st) setDiasAlerta(st.dias_uteis_alerta)
    setACarregar(false)
  }, [filtro, procura])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  async function duplicar(id: string) {
    const { id: novo, error } = await duplicarPedido(id, perfil?.id ?? null)
    if (error || !novo) { setToast('Erro ao duplicar: ' + (error ?? '')); return }
    router.push(`/admin-dept/cotacoes-transporte/${novo}`)
  }

  function alerta(p: FreightRequest, c?: ContagemPedido): boolean {
    if (p.estado !== 'enviado' && p.estado !== 'em_rececao') return false
    if (!c || c.destinatarios === 0) return false
    if (c.respostas >= c.destinatarios) return false
    return diasUteisDesde(p.updated_at) >= diasAlerta
  }

  const temFiltro = useMemo(() => !!(filtro.estado || filtro.tipo || procura), [filtro, procura])

  if (perfilCarregado && !isAdministrativo) {
    return <main style={c.page}><p style={c.muted}>Sem acesso à Área Administrativa.</p></main>
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept" style={c.voltar}>← Administrativo</Link>
          <h1 style={c.titulo}>📦 Cotações de Transporte</h1>
        </div>
        <div style={c.topoAcoes}>
          <Link href="/admin-dept/cotacoes-transporte/contactos" style={c.btnSecundario}>Transitários & grupos</Link>
          <Link href="/admin-dept/cotacoes-transporte/packing-lists" style={c.btnSecundario}>Packing Lists</Link>
          <Link href="/admin-dept/cotacoes-transporte/caixas" style={c.btnSecundario}>Caixas</Link>
          <Link href="/admin-dept/cotacoes-transporte/templates" style={c.btnSecundario}>Templates</Link>
          <Link href="/admin-dept/cotacoes-transporte/novo" style={c.btnPrimario}>+ Novo pedido</Link>
        </div>
      </div>

      <section style={c.filtros}>
        <input style={c.procura} placeholder="Procurar por nº, destino ou assunto…" value={procura} onChange={(e) => setProcura(e.target.value)} />
        <select style={c.select} value={filtro.estado ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, estado: (e.target.value || undefined) as EstadoPedido | undefined }))}>
          <option value="">Estado: todos</option>
          {ESTADOS_PEDIDO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <select style={c.select} value={filtro.tipo ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, tipo: (e.target.value || undefined) as TipoTransporte | undefined }))}>
          <option value="">Tipo: todos</option>
          {TIPOS_TRANSPORTE.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
        {temFiltro && <button style={c.btnLimpar} onClick={() => { setFiltro({}); setProcura('') }}>Limpar</button>}
      </section>

      {aCarregar ? (
        <p style={c.muted}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>Sem pedidos. Cria o primeiro com “+ Novo pedido”.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Nº</th>
                <th style={c.th}>Estado</th>
                <th style={c.th}>Destino</th>
                <th style={c.th}>Tipo</th>
                <th style={c.th}>Volumes</th>
                <th style={c.th}>Respostas</th>
                <th style={c.th}>Data</th>
                <th style={c.th}></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const est = estadoPedidoInfo(p.estado)
                const ct = contagens[p.id]
                const al = alerta(p, ct)
                return (
                  <tr key={p.id} style={{ ...c.tr, ...(al ? c.trAlerta : {}) }}>
                    <td style={c.td}><Link href={`/admin-dept/cotacoes-transporte/${p.id}`} style={c.link}>{p.numero ?? '—'}</Link></td>
                    <td style={c.td}><span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span></td>
                    <td style={c.td}>{destinoCurto(p)}{p.destino_cidade_cp ? <span style={c.sub}> · {p.destino_cidade_cp}</span> : null}</td>
                    <td style={c.td}>{tipoTransporteLabel(p.tipo_transporte)}</td>
                    <td style={c.td}>{ct?.volumes ?? 0}</td>
                    <td style={c.td}>
                      {ct && ct.destinatarios > 0 ? (
                        <span title="Cotações recebidas / transitários contactados">{ct.respostas} de {ct.destinatarios}{al ? ' ⏰' : ''}</span>
                      ) : '—'}
                    </td>
                    <td style={c.td}>{p.created_at.slice(0, 10)}</td>
                    <td style={c.tdAcoes}>
                      <Link href={`/admin-dept/cotacoes-transporte/${p.id}`} style={c.btnMini} title="Abrir">➜</Link>
                      <button style={c.btnMini} title="Duplicar como novo" onClick={() => duplicar(p.id)}>⧉</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1180, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0' },
  topoAcoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filtros: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  procura: { flex: '1 1 240px', minWidth: 200, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  btnLimpar: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trAlerta: { background: '#FEF3C7' },
  td: { padding: '8px', verticalAlign: 'top' },
  tdAcoes: { padding: '8px', whiteSpace: 'nowrap' },
  sub: { color: 'var(--muted)', fontSize: 12 },
  link: { color: '#2563EB', textDecoration: 'none', fontWeight: 700 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  btnMini: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', marginRight: 4, fontSize: 14, textDecoration: 'none', color: 'inherit', padding: '0 6px' },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  btnSecundario: { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
