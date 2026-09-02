'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarEmDivida, listarPedidos, carregarConfig, guardarConfig, enviarPedidos,
  elegivelAuto, preencherModelo, textoAtraso, ASSUNTO_PADRAO, MENSAGEM_PADRAO,
  CONFIG_PADRAO, type DocEmDivida, type PedidoPagamento, type ConfigPedidos,
} from '@/lib/pedidosPagamento'
import { definirLembretesAuto, formatarEuro, formatarData } from '@/lib/contasCorrentes'
import { categoriaInfo } from '@/lib/categorizacaoFinanceira'

// Pedidos de pagamento: o que está por receber, com envio do pedido ao cliente —
// à mão (um clique) ou automático de X em X dias, nos documentos com os lembretes
// ligados. A lista sai da conta corrente, por isso um documento desaparece daqui
// assim que fica liquidado.

type Filtro = 'todos' | 'vencidos' | 'auto' | 'sem_email'

export default function PedidosPagamentoPage() {
  const { perfil } = useAuth()
  const [docs, setDocs] = useState<DocEmDivida[]>([])
  const [historico, setHistorico] = useState<PedidoPagamento[]>([])
  const [cfg, setCfg] = useState<ConfigPedidos>(CONFIG_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [aEnviar, setAEnviar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [abrirConfig, setAbrirConfig] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [d, h, c] = await Promise.all([listarEmDivida(), listarPedidos(30), carregarConfig()])
    setDocs(d); setHistorico(h); setCfg(c)
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const visiveis = useMemo(() => docs.filter((d) => {
    if (filtro === 'vencidos') return d.diasAtraso > 0
    if (filtro === 'auto') return d.movimento.lembretes_auto
    if (filtro === 'sem_email') return !d.clienteEmail
    return true
  }), [docs, filtro])

  const totais = useMemo(() => ({
    total: docs.reduce((s, d) => s + d.porLiquidar, 0),
    vencido: docs.filter((d) => d.diasAtraso > 0).reduce((s, d) => s + d.porLiquidar, 0),
    nVencidos: docs.filter((d) => d.diasAtraso > 0).length,
    semEmail: docs.filter((d) => !d.clienteEmail).length,
    proximos: docs.filter((d) => elegivelAuto({
      lembretes_auto: d.movimento.lembretes_auto,
      porLiquidar: d.porLiquidar,
      diasAtraso: d.diasAtraso,
      ultimoPedido: d.ultimoPedido,
      temEmail: !!d.clienteEmail,
    }, cfg)).length,
  }), [docs, cfg])

  function alternar(id: string) {
    setSel((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }
  const selecionaveis = visiveis.filter((d) => d.clienteEmail).map((d) => d.movimento.id)
  const todosSel = selecionaveis.length > 0 && selecionaveis.every((id) => sel.has(id))

  async function enviar(ids: string[]) {
    if (ids.length === 0) return
    const quantos = ids.length
    if (!confirm(`Enviar ${quantos} pedido(s) de pagamento ao(s) cliente(s)?`)) return
    setAEnviar(true); setMsg(null)
    const r = await enviarPedidos(ids)
    setMsg(
      r.falhas === 0
        ? `${r.enviados} pedido(s) enviado(s).`
        : `${r.enviados} enviado(s), ${r.falhas} com problema: ${r.erros.slice(0, 3).join(' · ')}`
    )
    setSel(new Set())
    await carregar()
    setAEnviar(false)
  }

  async function alternarAuto(d: DocEmDivida) {
    await definirLembretesAuto([d.movimento.id], !d.movimento.lembretes_auto)
    await carregar()
  }

  async function ligarAutoSelecionados(ativo: boolean) {
    const ids = [...sel]
    if (ids.length === 0) return
    await definirLembretesAuto(ids, ativo)
    setSel(new Set())
    await carregar()
  }

  async function gravarConfig() {
    await guardarConfig(cfg, perfil?.nome ?? null)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  const previa = preencherModelo(cfg.mensagem_modelo || MENSAGEM_PADRAO, {
    cliente: 'Clínica Exemplo Lda', documento: 'FT2026/101', valor: 1230,
    vencimento: '2026-06-09', diasAtraso: 22,
  })

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>📨 Pedidos de Pagamento</h1>
          <p style={c.sub}>O que está por receber, com o pedido de pagamento ao cliente.</p>
        </div>
        <button style={c.btnSec} onClick={() => setAbrirConfig((v) => !v)}>
          ⚙️ Pedidos automáticos {cfg.lembretes_ativos ? '(ligados)' : '(desligados)'}
        </button>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Indicadores */}
      <div style={c.cards}>
        <div style={c.card}><span style={c.cardTit}>Por receber</span><span style={c.cardVal}>{formatarEuro(totais.total)}</span><span style={c.cardNota}>{docs.length} documento(s)</span></div>
        <div style={c.card}><span style={c.cardTit}>Vencido</span><span style={{ ...c.cardVal, color: totais.vencido > 0 ? '#B91C1C' : undefined }}>{formatarEuro(totais.vencido)}</span><span style={c.cardNota}>{totais.nVencidos} documento(s)</span></div>
        <div style={c.card}><span style={c.cardTit}>Envio automático</span><span style={c.cardVal}>{totais.proximos}</span><span style={c.cardNota}>elegível(is) na próxima corrida</span></div>
        <div style={c.card}><span style={c.cardTit}>Sem email</span><span style={{ ...c.cardVal, color: totais.semEmail > 0 ? '#B45309' : undefined }}>{totais.semEmail}</span><span style={c.cardNota}>cliente(s) por contactar</span></div>
      </div>

      {/* Configuração dos pedidos automáticos */}
      {abrirConfig && (
        <section style={c.painel}>
          <div style={c.painelTit}>Pedidos automáticos</div>
          <p style={c.nota}>
            Corre todos os dias úteis. Só envia aos documentos com o automático ligado (coluna <strong>Auto</strong>),
            vencidos há pelo menos os dias indicados e respeitando a cadência entre pedidos.
          </p>
          <div style={c.formLinha}>
            <label style={c.check}>
              <input type="checkbox" checked={cfg.lembretes_ativos} onChange={(e) => setCfg({ ...cfg, lembretes_ativos: e.target.checked })} />
              Ativar envio automático
            </label>
            <label style={c.campo}>Cadência (dias)
              <input type="number" min={1} max={365} value={cfg.cadencia_dias} onChange={(e) => setCfg({ ...cfg, cadencia_dias: Number(e.target.value) })} style={c.input} />
            </label>
            <label style={c.campo}>Só após (dias de atraso)
              <input type="number" min={0} max={365} value={cfg.dias_apos_vencimento} onChange={(e) => setCfg({ ...cfg, dias_apos_vencimento: Number(e.target.value) })} style={c.input} />
            </label>
            <label style={c.campo}>Valor mínimo (€)
              <input type="number" min={0} step="0.01" value={cfg.valor_minimo} onChange={(e) => setCfg({ ...cfg, valor_minimo: Number(e.target.value) })} style={c.input} />
            </label>
          </div>
          <label style={c.campoLargo}>Assunto
            <input value={cfg.assunto_modelo ?? ''} placeholder={ASSUNTO_PADRAO} onChange={(e) => setCfg({ ...cfg, assunto_modelo: e.target.value })} style={c.input} />
          </label>
          <label style={c.campoLargo}>Mensagem
            <textarea value={cfg.mensagem_modelo ?? ''} placeholder={MENSAGEM_PADRAO} rows={8} onChange={(e) => setCfg({ ...cfg, mensagem_modelo: e.target.value })} style={c.textarea} />
          </label>
          <p style={c.nota}>
            Marcadores: <code style={c.code}>{'{cliente}'}</code> <code style={c.code}>{'{documento}'}</code> <code style={c.code}>{'{valor}'}</code> <code style={c.code}>{'{vencimento}'}</code> <code style={c.code}>{'{atraso}'}</code> <code style={c.code}>{'{dias}'}</code>
          </p>
          <details style={c.previa}>
            <summary style={c.previaTit}>Pré-visualizar</summary>
            <pre style={c.previaTexto}>{previa}</pre>
          </details>
          <div style={c.acoes}>
            <button style={c.btnPrim} onClick={gravarConfig}>Guardar definições</button>
            {guardado && <span style={c.ok}>Guardado ✓</span>}
          </div>
        </section>
      )}

      {/* Filtros + ações em lote */}
      <div style={c.filtros}>
        {([['todos', 'Todos'], ['vencidos', 'Vencidos'], ['auto', 'Com automático'], ['sem_email', 'Sem email']] as [Filtro, string][]).map(([v, l]) => (
          <button key={v} style={{ ...c.chip, ...(filtro === v ? c.chipOn : {}) }} onClick={() => setFiltro(v)}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        {sel.size > 0 && (
          <>
            <span style={c.selInfo}>{sel.size} selecionado(s)</span>
            <button style={c.btnSec} onClick={() => ligarAutoSelecionados(true)}>Ligar automático</button>
            <button style={c.btnSec} onClick={() => ligarAutoSelecionados(false)}>Desligar</button>
            <button style={c.btnPrim} disabled={aEnviar} onClick={() => enviar([...sel])}>
              {aEnviar ? 'A enviar...' : `Enviar ${sel.size} pedido(s)`}
            </button>
          </>
        )}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : visiveis.length === 0 ? (
        <p style={c.estado}>Nada por cobrar. 🎉</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>
              <input type="checkbox" checked={todosSel} onChange={(e) => setSel(e.target.checked ? new Set(selecionaveis) : new Set())} />
            </span>
            <span>Cliente</span>
            <span>Documento</span>
            <span style={{ textAlign: 'right' }}>Em dívida</span>
            <span>Vencimento</span>
            <span style={{ textAlign: 'center' }}>Pedidos</span>
            <span style={{ textAlign: 'center' }}>Auto</span>
            <span style={{ textAlign: 'right' }}>Ação</span>
          </div>
          {visiveis.map((d) => {
            const m = d.movimento
            const cat = categoriaInfo(m.categoria)
            return (
              <div key={m.id} style={c.linha}>
                <span>
                  <input type="checkbox" checked={sel.has(m.id)} disabled={!d.clienteEmail} onChange={() => alternar(m.id)} />
                </span>
                <span>
                  <Link href={`/financeiro/contas-correntes/cliente/${m.cliente_id}`} style={c.link}>{m.entidade_nome ?? '—'}</Link>
                  <span style={c.emailLinha}>{d.clienteEmail ?? '⚠️ sem email'}</span>
                </span>
                <span>
                  {m.documento_ref ?? '—'}
                  {cat && <span style={{ ...c.badge, color: cat.cor, background: cat.bg }}>{cat.icon} {cat.label}</span>}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(d.porLiquidar)}</span>
                <span>
                  {formatarData(m.data_vencimento)}
                  <span style={{ ...c.atraso, color: d.diasAtraso > 0 ? '#B91C1C' : 'var(--muted)' }}>{textoAtraso(d.diasAtraso)}</span>
                </span>
                <span style={{ textAlign: 'center' }}>
                  {d.nPedidos > 0 ? <span title={`Último: ${formatarData(d.ultimoPedido?.slice(0, 10) ?? null)}`}>{d.nPedidos}×</span> : <span style={c.muted}>—</span>}
                </span>
                <span style={{ textAlign: 'center' }}>
                  <button
                    style={{ ...c.toggle, ...(m.lembretes_auto ? c.toggleOn : {}) }}
                    onClick={() => alternarAuto(d)}
                    title={m.lembretes_auto ? 'Automático ligado' : 'Automático desligado'}
                  >
                    {m.lembretes_auto ? 'ON' : 'OFF'}
                  </button>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <button style={c.btnLinha} disabled={aEnviar || !d.clienteEmail} onClick={() => enviar([m.id])}>
                    Enviar pedido
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <section style={c.painel}>
          <div style={c.painelTit}>Últimos pedidos enviados</div>
          <div style={c.hist}>
            {historico.map((h) => (
              <div key={h.id} style={c.histLinha}>
                <span style={c.muted}>{new Date(h.enviado_em).toLocaleString('pt-PT')}</span>
                <span>{h.cliente_nome ?? '—'} · {h.documento_ref ?? '—'}</span>
                <span style={{ fontWeight: 600 }}>{formatarEuro(h.valor)}</span>
                <span style={c.muted}>{h.automatico ? 'automático' : h.enviado_por_nome ?? 'manual'}</span>
                <span style={{ color: h.ok ? '#065F46' : '#B91C1C' }}>{h.ok ? 'enviado ✓' : `falhou — ${h.erro ?? ''}`}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1150, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 },
  card: { display: 'flex', flexDirection: 'column', gap: 2, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  cardTit: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  cardVal: { fontSize: 20, fontWeight: 700 },
  cardNota: { fontSize: 12, color: 'var(--muted)' },
  painel: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  painelTit: { fontWeight: 700, color: 'var(--primary)', fontSize: 15 },
  nota: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 },
  formLinha: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--muted)' },
  campoLargo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--muted)' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--foreground)' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, minWidth: 120 },
  textarea: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.5 },
  code: { background: '#F3F4F6', borderRadius: 4, padding: '1px 5px', fontSize: 12 },
  previa: { border: '1px solid var(--border)', borderRadius: 8, padding: 10 },
  previaTit: { fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--primary)' },
  previaTexto: { whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, marginTop: 8, fontFamily: 'inherit' },
  acoes: { display: 'flex', gap: 10, alignItems: 'center' },
  ok: { color: '#065F46', fontSize: 13, fontWeight: 600 },
  filtros: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  chip: { background: '#fff', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  chipOn: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700 },
  selInfo: { fontSize: 13, color: 'var(--muted)' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnLinha: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '32px 1.8fr 1.6fr 1fr 1.2fr 0.7fr 0.6fr 1.1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 920 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  link: { color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, display: 'block' },
  emailLinha: { display: 'block', fontSize: 11.5, color: 'var(--muted)' },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', marginLeft: 6, whiteSpace: 'nowrap' },
  atraso: { display: 'block', fontSize: 11.5 },
  toggle: { background: '#F3F4F6', color: '#6B7280', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  toggleOn: { background: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' },
  hist: { display: 'flex', flexDirection: 'column', gap: 4 },
  histLinha: { display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.8fr 1fr 1.2fr', gap: 8, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
}
