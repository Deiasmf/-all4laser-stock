'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatarMoeda, formatarDual, formatarData, type ContaComSaldo } from '@/lib/cc'
import {
  listarProcessos, totaisProcessos, estadoProcessoInfo, ESTADOS_PROCESSO,
  type Processo, type EstadoProcesso,
} from '@/lib/ccProcessos'
import DossieProcesso from './DossieProcesso'

// Vista "por processo" (um por equipamento consignado): progresso do pagamento,
// próximo recebimento e finalização estimada. Só leitura sobre o cc_* existente.
export default function TabProcessos({ conta }: { conta: ContaComSaldo }) {
  const [processos, setProcessos] = useState<Processo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'' | EstadoProcesso>('')

  const recarregar = useCallback(async () => {
    setProcessos(await listarProcessos(conta.id))
    setCarregando(false)
  }, [conta.id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return processos.filter((p) => {
      if (filtroEstado && p.estado !== filtroEstado) return false
      if (q) {
        const campos = [p.marca, p.modelo, p.numeroSerie, p.ano]
        if (!campos.some((x) => (x ?? '').toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [processos, filtroEstado, busca])

  const totais = useMemo(() => totaisProcessos(filtrados), [filtrados])
  // Moeda dos totais = a das vendas (processos com valor); evita apanhar a moeda
  // de custo de um processo só "enviado" (ex.: EUR) e etiquetar mal os totais AED.
  const moeda = processos.find((p) => p.valorDevido > 0)?.moeda ?? conta.moeda

  // Contagem por estado (para os chips de filtro).
  const porEstado = useMemo(() => {
    const m = new Map<EstadoProcesso, number>()
    for (const p of processos) m.set(p.estado, (m.get(p.estado) ?? 0) + 1)
    return m
  }, [processos])

  const temFiltros = !!busca || !!filtroEstado

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>
          {processos.length} processo(s) · um por equipamento enviado
        </span>
      </div>

      {/* Totais */}
      {processos.length > 0 && (
        <div style={c.totais}>
          <div style={c.tCard}>
            <span style={c.tTitulo}>Valor devido</span>
            <span style={c.tValor}>{formatarMoeda(totais.devido, moeda)}</span>
            {moeda !== 'EUR' && <span style={c.tEur}>{formatarMoeda(totais.devidoEur, 'EUR')}</span>}
          </div>
          <div style={c.tCard}>
            <span style={c.tTitulo}>Recebido</span>
            <span style={{ ...c.tValor, color: '#065F46' }}>{formatarMoeda(totais.pago, moeda)}</span>
            {moeda !== 'EUR' && <span style={c.tEur}>{formatarMoeda(totais.pagoEur, 'EUR')}</span>}
          </div>
          <div style={c.tCard}>
            <span style={c.tTitulo}>Em falta</span>
            <span style={{ ...c.tValor, color: totais.emFalta > 0 ? '#B45309' : 'var(--foreground)' }}>
              {formatarMoeda(totais.emFalta, moeda)}
            </span>
            {moeda !== 'EUR' && <span style={c.tEur}>{formatarMoeda(totais.emFaltaEur, 'EUR')}</span>}
          </div>
        </div>
      )}

      {/* Filtros */}
      {processos.length > 0 && (
        <div style={c.filtroBar}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar equipamento, nº de série ou ano..."
            style={c.filtroBusca}
          />
          {temFiltros && (
            <button style={c.filtroLimpar} onClick={() => { setBusca(''); setFiltroEstado('') }}>Limpar</button>
          )}
        </div>
      )}

      {processos.length > 0 && (
        <div style={c.filtros}>
          <button
            style={{ ...c.filtroBtn, ...(filtroEstado === '' ? c.filtroBtnAtivo : {}) }}
            onClick={() => setFiltroEstado('')}
          >Todos ({processos.length})</button>
          {ESTADOS_PROCESSO.filter((es) => (porEstado.get(es.valor) ?? 0) > 0).map((es) => (
            <button
              key={es.valor}
              style={{ ...c.filtroBtn, ...(filtroEstado === es.valor ? c.filtroBtnAtivo : {}) }}
              onClick={() => setFiltroEstado(es.valor)}
            >{es.label} ({porEstado.get(es.valor)})</button>
          ))}
          <span style={{ ...c.contagem, marginLeft: 'auto', alignSelf: 'center' }}>
            {filtrados.length} de {processos.length}
          </span>
        </div>
      )}

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : processos.length === 0 ? (
        <p style={c.estado}>Ainda não há equipamentos enviados nesta conta.</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Nenhum processo corresponde aos filtros.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.map((p) => <CartaoProcesso key={p.consignacaoId} p={p} onMudou={recarregar} />)}
        </div>
      )}
    </div>
  )
}

// ─── Cartão de um processo ───────────────────────────────────────────────────

function CartaoProcesso({ p, onMudou }: { p: Processo; onMudou: () => void }) {
  const [dossieAberto, setDossieAberto] = useState(false)
  const info = estadoProcessoInfo(p.estado)
  const titulo = [p.marca, p.modelo].filter(Boolean).join(' ') || 'Equipamento'
  const liquidado = p.estado === 'liquidado'

  return (
    <div style={{ ...c.cartao, ...(liquidado ? c.cartaoPago : {}), ...(p.temIncidenciaAberta ? c.cartaoInc : {}) }}>
      <div style={c.cartaoTopo}>
        <div style={{ minWidth: 0 }}>
          <div style={c.cartaoTitulo}>
            {titulo}
            {p.temIncidenciaAberta && <span style={c.badgeInc}>⚠ incidência</span>}
          </div>
          <div style={c.cartaoMeta}>
            {p.numeroSerie && <span>SN: <strong>{p.numeroSerie}</strong></span>}
            {p.ano && <span> · {p.ano}</span>}
            {p.dataEnvio && <span> · envio {formatarData(p.dataEnvio)}</span>}
            {p.dataVenda && <span> · venda {formatarData(p.dataVenda)}</span>}
          </div>
        </div>
        <span style={{ ...c.estadoPill, color: info.cor, background: info.bg }}>{info.label}</span>
      </div>

      {/* Progresso do pagamento */}
      {p.valorDevido > 0 ? (
        <div style={c.progresso}>
          <div style={c.progressoTopo}>
            <span style={c.progressoLabel}>
              {formatarMoeda(p.pago, p.moeda)} de {formatarDual(p.valorDevido, p.moeda, p.taxaCusto)}
            </span>
            <span style={{ ...c.progressoPct, color: info.cor }}>{p.pctPago}%</span>
          </div>
          <div style={c.barraFundo}>
            <div style={{ ...c.barraCheia, width: `${p.pctPago}%`, background: info.cor }} />
          </div>
        </div>
      ) : (
        <div style={c.semVenda}>Ainda sem venda registada — só enviado.</div>
      )}

      {/* Números */}
      <div style={c.detalhes}>
        <Num rotulo="Devido" valor={p.valorDevido > 0 ? formatarDual(p.valorDevido, p.moeda, p.taxaCusto) : '—'} />
        <Num rotulo="Recebido" valor={formatarDual(p.pago, p.moeda, p.taxaCusto)} />
        <Num rotulo="Em falta" valor={p.emFalta > 0 ? formatarDual(p.emFalta, p.moeda, p.taxaCusto) : '—'} destaque={p.emFalta > 0} />
        <Num rotulo="Pagamentos" valor={String(p.nPagamentos)} />
        <Num
          rotulo="Próximo pagamento"
          valor={p.proximoPagamento ? formatarData(p.proximoPagamento) : (liquidado ? 'Liquidado' : '—')}
          nota={p.proximoPorRitmo ? 'estimado' : undefined}
        />
        <Num
          rotulo="Finalização estimada"
          valor={p.finalizacaoEstimada ? formatarData(p.finalizacaoEstimada) : (liquidado ? 'Concluído' : '—')}
          nota={p.finalizacaoEstimada ? 'estimada' : undefined}
        />
      </div>

      {p.ultimoPagamento && (
        <div style={c.rodape}>
          Último recebimento: {formatarData(p.ultimoPagamento)}
          {p.primeiroPagamento && p.primeiroPagamento !== p.ultimoPagamento
            ? ` · primeiro: ${formatarData(p.primeiroPagamento)}` : ''}
        </div>
      )}

      <button style={c.dossieToggle} onClick={() => setDossieAberto((v) => !v)}>
        {dossieAberto ? '▾ Ocultar dossiê' : '▸ Ver dossiê (incidências, documentos, folhas de obra, envios)'}
      </button>
      {dossieAberto && (
        <DossieProcesso
          consignacaoId={p.consignacaoId}
          numeroSerie={p.numeroSerie}
          equipamentoId={p.equipamentoId}
          onMudouIncidencias={onMudou}
        />
      )}
    </div>
  )
}

function Num({ rotulo, valor, destaque, nota }: { rotulo: string; valor: string; destaque?: boolean; nota?: string }) {
  return (
    <div style={c.num}>
      <span style={c.numRotulo}>{rotulo}</span>
      <span style={{ ...c.numValor, ...(destaque ? { color: 'var(--primary)', fontWeight: 800 } : {}) }}>{valor}</span>
      {nota && <span style={c.numNota}>{nota}</span>}
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 12 },
  totais: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 },
  tCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  tTitulo: { fontSize: 12, color: 'var(--muted)' },
  tValor: { fontSize: 17, fontWeight: 800, color: 'var(--foreground)' },
  tEur: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  filtroBar: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  filtroBusca: { flex: '1 1 220px', minWidth: 160, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  filtroLimpar: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  filtros: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  filtroBtn: { border: '1px solid var(--border)', background: '#fff', color: 'var(--muted)', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  filtroBtnAtivo: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  cartaoPago: { border: '1px solid #6EE7B7', background: '#F0FDF4' },
  cartaoInc: { border: '1px solid #FCA5A5' },
  badgeInc: { display: 'inline-block', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '1px 8px', color: '#B91C1C', background: '#FEE2E2', marginLeft: 8, verticalAlign: 'middle' },
  dossieToggle: { alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: '4px 0' },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  cartaoTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  cartaoMeta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  estadoPill: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' },
  progresso: { display: 'flex', flexDirection: 'column', gap: 4 },
  progressoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  progressoLabel: { fontSize: 12.5, color: 'var(--muted)' },
  progressoPct: { fontSize: 13, fontWeight: 800 },
  barraFundo: { height: 8, borderRadius: 999, background: '#EEF0F3', overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 999, transition: 'width .3s' },
  semVenda: { fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' },
  detalhes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, paddingTop: 8, borderTop: '1px solid #f2f2f2' },
  num: { display: 'flex', flexDirection: 'column', gap: 1, borderLeft: '3px solid var(--border)', paddingLeft: 8 },
  numRotulo: { fontSize: 11, color: 'var(--muted)' },
  numValor: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)' },
  numNota: { fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' },
  rodape: { fontSize: 12, color: 'var(--muted)', paddingTop: 4 },
}
