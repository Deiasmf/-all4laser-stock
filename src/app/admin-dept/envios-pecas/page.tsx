'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listarEnvios, marcarPago, itensPorEnvio } from '@/lib/enviosPecas'
import {
  estadoInfo, formatarEuro, transportadoraLabel,
  entidadeDestino, resumoMaterial, tituloEnvio, type EnvioPeca, type ItemResumo,
} from '@/types/envioPecas'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'

// Envio já com o título/resumo calculados.
type EnvioAdmin = EnvioPeca & { titulo: string; resumo: string; destino: string }

const hoje = () => new Date().toISOString().slice(0, 10)

// Colunas para exportação (espelham a tabela administrativa de envios)
const colunasExport: ColunaExport<EnvioAdmin>[] = [
  { cabecalho: 'Título', valor: (e) => e.titulo },
  { cabecalho: 'Número', valor: (e) => e.numero },
  { cabecalho: 'Destino', valor: (e) => e.destino },
  { cabecalho: 'Material', valor: (e) => e.resumo },
  { cabecalho: 'Método de envio', valor: (e) => transportadoraLabel(e) },
  { cabecalho: 'Responsável', valor: (e) => e.responsavel_nome },
  { cabecalho: 'Estado', valor: (e) => estadoInfo(e.estado).label },
  { cabecalho: 'Valor', valor: (e) => formatarEuro(e.valor_a_faturar) },
  { cabecalho: 'Pago', valor: (e) => (e.pago ? 'Sim' : 'Não') },
]

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function AdminEnviosPage() {
  const [envios, setEnvios] = useState<EnvioAdmin[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const todos = await listarEnvios()
    const lista = todos.filter((e) => e.estado === 'pronto_a_expedir' || e.estado === 'expedido')
    const mapa = await itensPorEnvio(lista.map((e) => e.id))
    setEnvios(lista.map((e) => {
      const itens: ItemResumo[] = mapa.get(e.id) ?? []
      return {
        ...e,
        titulo: tituloEnvio(e, itens),
        resumo: resumoMaterial(itens),
        destino: entidadeDestino(e) || '—',
      }
    }))
    setCarregando(false)
  }, [])
  // setState corre só após o await dentro de recarregar()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function togglePago(e: EnvioAdmin) {
    setATrabalhar(e.id)
    await marcarPago(e.id, !e.pago, !e.pago ? hoje() : null)
    await recarregar()
    setATrabalhar(null)
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Envios de Encomendas — Administrativo</h1>
          <p style={c.sub}>Encomendas prontas a expedir e expedidas. Clica no título para faturar, fazer carta de porte, expedir e enviar ao cliente.</p>
        </div>
        <BotaoExportar nome="encomendas-expedicao" colunas={colunasExport} linhas={envios} />
      </div>

      {carregando ? (
        <p style={c.muted}>A carregar...</p>
      ) : envios.length === 0 ? (
        <p style={c.muted}>Nada a tratar de momento.</p>
      ) : (
        <div style={c.lista}>
          {envios.map((e) => (
            <div key={e.id} style={c.cartao}>
              <div style={c.cartaoTopo}>
                <Link href={`/logistico/envios-pecas/${e.id}`} style={c.tituloLink}>{e.titulo}</Link>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700 }}>{formatarEuro(e.valor_a_faturar)}</span>
                  {e.estado === 'expedido' ? (
                    <button
                      onClick={() => togglePago(e)}
                      disabled={aTrabalhar === e.id}
                      title={e.pago ? 'Pago — clica para marcar não pago' : 'Não pago — clica para marcar pago'}
                      style={{ ...c.pagoPill, background: e.pago ? '#15803D' : '#DC2626' }}
                    >
                      {e.pago ? '🟢 Pago' : '🔴 Não'}
                    </button>
                  ) : (
                    <span style={c.muted2}>—</span>
                  )}
                </span>
              </div>
              <div style={c.meta}>
                <span style={c.metaItem}><span style={c.metaRotulo}>Destino:</span> {e.destino}</span>
                <span style={c.sep}>·</span>
                <span style={c.metaItem}><span style={c.metaRotulo}>Material:</span> {e.resumo}</span>
                <span style={c.sep}>·</span>
                <span style={c.metaItem}><span style={c.metaRotulo}>Método:</span> {transportadoraLabel(e)}</span>
                <span style={c.sep}>·</span>
                <EstadoBadge estado={e.estado} />
                {e.responsavel_nome && (
                  <>
                    <span style={c.sep}>·</span>
                    <span style={c.metaItem}><span style={c.metaRotulo}>Resp.:</span> {e.responsavel_nome}</span>
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
  page: { maxWidth: 1000, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  sub: { color: 'var(--muted)', fontSize: 13, marginBottom: 16 },
  muted: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  tituloLink: { color: 'var(--foreground)', fontWeight: 700, fontSize: 15, textDecoration: 'none' },
  meta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' },
  metaItem: { color: 'var(--foreground)' },
  metaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  sep: { color: 'var(--border)' },
  muted2: { color: 'var(--muted)', fontSize: 13 },
  pagoPill: { color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
}
