'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { listarEnvios, itensPorEnvio } from '@/lib/enviosPecas'
import {
  ESTADOS_ENVIO, estadoInfo, transportadoraLabel, formatarEuro,
  entidadeDestino, resumoMaterial, tituloEnvio, type EnvioPeca, type ItemResumo,
} from '@/types/envioPecas'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

const CHAVE_FILTROS = 'envios-pecas:filtros'

type Filtros = { pesquisa: string; estado: string; pago: string; mes: string }

// Envio já com o título/resumo calculados e o texto onde a pesquisa procura.
type EnvioLista = EnvioPeca & {
  titulo: string
  resumo: string
  destino: string
  alvoPesquisa: string
}

function lerFiltros(): Filtros {
  if (typeof window === 'undefined') return { pesquisa: '', estado: '', pago: '', mes: '' }
  try {
    const raw = sessionStorage.getItem(CHAVE_FILTROS)
    return raw ? { pesquisa: '', estado: '', pago: '', mes: '', ...JSON.parse(raw) } : { pesquisa: '', estado: '', pago: '', mes: '' }
  } catch {
    return { pesquisa: '', estado: '', pago: '', mes: '' }
  }
}

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function EnviosPecasPage() {
  const router = useRouter()
  const [envios, setEnvios] = useState<EnvioLista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [g] = useState(lerFiltros)
  const [pesquisa, setPesquisa] = useState(g.pesquisa)
  const [estado, setEstado] = useState(g.estado)
  const [pago, setPago] = useState(g.pago)
  const [mes, setMes] = useState(g.mes)

  useEffect(() => {
    (async () => {
      const lista = await listarEnvios()
      const mapa = await itensPorEnvio(lista.map((e) => e.id))
      setEnvios(lista.map((e) => {
        const itens: ItemResumo[] = mapa.get(e.id) ?? []
        const destino = entidadeDestino(e) || '—'
        const resumo = resumoMaterial(itens)
        // Pesquisa encontra por nº EP, entidade e tipo/nome de peça.
        const nomesItens = itens.map((i) => i.peca_nome ?? '').join(' ')
        return {
          ...e,
          titulo: tituloEnvio(e, itens),
          resumo,
          destino,
          alvoPesquisa: `${e.numero ?? ''} ${destino} ${resumo} ${nomesItens}`.toLowerCase(),
        }
      }))
      setCarregando(false)
    })()
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(CHAVE_FILTROS, JSON.stringify({ pesquisa, estado, pago, mes })) } catch {}
  }, [pesquisa, estado, pago, mes])

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return envios.filter((e) => {
      if (estado && e.estado !== estado) return false
      if (pago === 'sim' && !e.pago) return false
      if (pago === 'nao' && e.pago) return false
      if (mes && !(e.created_at ?? '').startsWith(mes)) return false
      if (q && !e.alvoPesquisa.includes(q)) return false
      return true
    })
  }, [envios, pesquisa, estado, pago, mes])

  const temFiltros = !!pesquisa || !!estado || !!pago || !!mes

  // Colunas de exportação — incluem o título descritivo, destino, resumo e método.
  const colunasExport: ColunaExport<EnvioLista>[] = [
    { cabecalho: 'Título', valor: (e) => e.titulo },
    { cabecalho: 'Número', valor: (e) => e.numero },
    { cabecalho: 'Data', valor: (e) => (e.created_at ?? '').slice(0, 10) },
    { cabecalho: 'Destino', valor: (e) => e.destino },
    { cabecalho: 'Material', valor: (e) => e.resumo },
    { cabecalho: 'Método de envio', valor: (e) => transportadoraLabel(e) },
    { cabecalho: 'Estado', valor: (e) => estadoInfo(e.estado).label },
    { cabecalho: 'Pago', valor: (e) => (e.pago ? 'Sim' : 'Não') },
    { cabecalho: 'Valor', valor: (e) => formatarEuro(e.valor_a_faturar) },
  ]

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Envios de Encomendas</h1>
        <Link href="/logistico/encomendas/nova" style={c.btnPrimario}>+ Nova Encomenda</Link>
      </div>

      <div style={c.filtros}>
        <input
          placeholder="Procurar por nº EP, entidade ou tipo de peça..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={{ ...c.input, flex: 1, minWidth: 200 }}
        />
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={c.select}>
          <option value="">Todos os estados</option>
          {ESTADOS_ENVIO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <select value={pago} onChange={(e) => setPago(e.target.value)} style={c.select}>
          <option value="">Pago e não pago</option>
          <option value="sim">Pago</option>
          <option value="nao">Não pago</option>
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={c.select} />
        {temFiltros && (
          <button style={c.btnGhost} onClick={() => { setPesquisa(''); setEstado(''); setPago(''); setMes('') }}>
            Limpar
          </button>
        )}
        <BotaoExportar nome="encomendas-envios" colunas={colunasExport} linhas={filtrados} />
      </div>

      <div style={c.resumo}>
        <span>{filtrados.length} envio(s)</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem envios.</p>
      ) : (
        <div style={c.tabela}>
          {filtrados.map((e) => (
            <div key={e.id} style={c.cartao} onClick={() => router.push(`/logistico/envios-pecas/${e.id}`)}>
              <div style={c.cartaoTopo}>
                <span style={c.tituloEnvio}>{e.titulo}</span>
                <span style={c.data}>{(e.created_at ?? '').slice(0, 10)}</span>
              </div>
              <div style={c.meta}>
                <span style={c.metaItem}><span style={c.metaRotulo}>Destino:</span> {e.destino}</span>
                <span style={c.sep}>·</span>
                <span style={c.metaItem}><span style={c.metaRotulo}>Material:</span> {e.resumo}</span>
                <span style={c.sep}>·</span>
                <span style={c.metaItem}><span style={c.metaRotulo}>Método:</span> {transportadoraLabel(e)}</span>
                <span style={c.sep}>·</span>
                <EstadoBadge estado={e.estado} />
                {e.faturavel && e.valor_a_faturar != null && (
                  <>
                    <span style={c.sep}>·</span>
                    <span style={c.metaItem} title={e.pago ? 'Pago' : 'Não pago'}>
                      {e.pago ? '🟢' : '🔴'} {formatarEuro(e.valor_a_faturar)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  select: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { display: 'flex', flexDirection: 'column', gap: 8 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  tituloEnvio: { fontWeight: 700, fontSize: 15, color: 'var(--foreground)' },
  data: { color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' },
  meta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' },
  metaItem: { color: 'var(--foreground)' },
  metaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  sep: { color: 'var(--border)' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
