'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarContas, carregarMovimentos, resumoConciliacao, confirmarMatch, desfazerMatch,
  ignorarMovimento, reabrirMovimento, alocacoesDoMovimento, interpretarDescritivoIA,
  formatarValor, IGNORAR_CATEGORIAS,
  type ContaBancaria, type BankMovimento, type ResumoConciliacao, type EstadoMov, type IgnorarCategoria, type AlocacaoFeita,
} from '@/lib/conciliacaoBancaria'
import {
  carregarFaturasEmDivida, carregarClientesIndex, sugerir, clientesPorNome,
  type FaturaDivida, type ClienteIdx, type Sugestao,
} from '@/lib/matchBancario'
import { listarContas as listarContasCC, formatarMoeda, type ContaComSaldo } from '@/lib/cc'
import { listarProcessos, type Processo } from '@/lib/ccProcessos'
import { conciliarBankCC, desconciliarBankCC, ccMovimentosDoBanco, type AlocacaoCC, type CCMovimentoDoBanco } from '@/lib/ccConciliacao'

const ESTADOS: { valor: EstadoMov; label: string }[] = [
  { valor: 'por_conciliar', label: 'Por conciliar' },
  { valor: 'conciliado', label: 'Conciliados' },
  { valor: 'ignorado', label: 'Ignorados' },
]

export default function FilaConciliacaoPage() {
  const { perfil } = useAuth()
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [contaId, setContaId] = useState<string>('')
  const [estado, setEstado] = useState<EstadoMov>('por_conciliar')
  const [movs, setMovs] = useState<BankMovimento[]>([])
  const [faturas, setFaturas] = useState<FaturaDivida[]>([])
  const [clientes, setClientes] = useState<ClienteIdx[]>([])
  const [resumo, setResumo] = useState<ResumoConciliacao | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)   // id do movimento em processamento
  const [override, setOverride] = useState<Record<string, Sugestao>>({})  // sugestão da IA/escolha manual
  const [picker, setPicker] = useState<BankMovimento | null>(null)         // modal de escolha de fatura
  const [pickerCC, setPickerCC] = useState<BankMovimento | null>(null)     // modal de casar com conta corrente
  const [contasCC, setContasCC] = useState<ContaComSaldo[]>([])

  const carregar = useCallback(async () => {
    setACarregar(true)
    const filtro = { conta_id: contaId || undefined, estado }
    const [m, r] = await Promise.all([carregarMovimentos({ ...filtro, sentido: 'credito' }), resumoConciliacao({ conta_id: contaId || undefined })])
    setMovs(m); setResumo(r); setACarregar(false)
  }, [contaId, estado])

  useEffect(() => { listarContas().then(setContas) }, [])
  useEffect(() => { listarContasCC().then((cs) => setContasCC(cs.filter((x) => x.ativa))) }, [])
  useEffect(() => { Promise.all([carregarFaturasEmDivida(), carregarClientesIndex()]).then(([f, c]) => { setFaturas(f); setClientes(c) }) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const sugestoes = useMemo(() => {
    const map: Record<string, Sugestao> = {}
    if (estado !== 'por_conciliar') return map
    for (const m of movs) {
      map[m.id] = override[m.id] ?? sugerir({ valor: m.valor, descritivo: m.descritivo, observacoes: m.observacoes, sentido: m.sentido }, faturas, clientes)
    }
    return map
  }, [movs, faturas, clientes, estado, override])

  async function acao(id: string, fn: () => Promise<{ error: unknown } | unknown>) {
    setOcupado(id)
    const r = (await fn()) as { error?: unknown }
    if (r?.error) { alert('Erro: ' + JSON.stringify(r.error)); setOcupado(null); return }
    // Recarrega tudo (faturas em dívida mudaram).
    const [f] = await Promise.all([carregarFaturasEmDivida()])
    setFaturas(f)
    setOverride((o) => { const n = { ...o }; delete n[id]; return n })
    await carregar()
    setOcupado(null)
  }

  function confirmarSugestao(m: BankMovimento, s: Sugestao) {
    if (s.alocacoes.length === 0) return
    const alocacoes = s.alocacoes.map((a) => ({ movimento_id: a.fatura.id, valor: a.valor }))
    return acao(m.id, () => confirmarMatch(m.id, alocacoes, m.data, perfil?.nome ?? null))
  }

  async function correrIA(m: BankMovimento) {
    setOcupado(m.id)
    const r = await interpretarDescritivoIA(m.descritivo, m.observacoes)
    setOcupado(null)
    if (!r.ok) { alert(r.erro || 'Falha na IA.'); return }
    const cli = clientesPorNome(r.nome, clientes)
    const ids = cli.map((c) => c.id)
    const doCliente = faturas.filter((f) => ids.includes(f.cliente_id))
    const exatas = doCliente.filter((f) => Math.abs(f.porLiquidar - m.valor) < 0.01)
    const nova: Sugestao = exatas.length === 1
      ? { confianca: 'media', motivo: `IA: ${r.nome} — valor exato.`, alocacoes: [{ fatura: exatas[0], valor: m.valor }], candidatas: doCliente, clienteNome: r.nome, clienteIds: ids }
      : { confianca: doCliente.length ? 'baixa' : 'nenhuma', motivo: r.nome ? `IA sugere: ${r.nome}${doCliente.length ? ' — escolhe a fatura' : ' (sem faturas em dívida)'}.` : 'IA não identificou o cliente.', alocacoes: [], candidatas: doCliente, clienteNome: r.nome, clienteIds: ids }
    setOverride((o) => ({ ...o, [m.id]: nova }))
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro/conciliacao" style={c.voltar}>← Importar extrato</Link>
          <h1 style={c.titulo}>🏦 Conciliar recebimentos</h1>
          <p style={c.sub}>Confirma a que fatura corresponde cada entrada do banco. Nada é conciliado sem a tua confirmação.</p>
        </div>
      </div>

      {/* Indicadores */}
      {resumo && (
        <section style={c.indicadores}>
          <Ind cor="#065F46" bg="#ECFDF5" tit="Por conciliar" n={resumo.porConciliar.n} extra={formatarValor(resumo.porConciliar.soma, contas.find((x) => x.id === contaId)?.moeda ?? 'EUR')} />
          <Ind cor="#1E40AF" bg="#DBEAFE" tit="Conciliados" n={resumo.conciliados.n} extra={formatarValor(resumo.conciliados.soma, contas.find((x) => x.id === contaId)?.moeda ?? 'EUR')} />
          <Ind cor="#92400E" bg="#FEF3C7" tit="Ignorados" n={resumo.ignorados.n} extra="" />
        </section>
      )}

      {/* Filtros */}
      <section style={c.filtros}>
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={c.select}>
          <option value="">Todas as contas</option>
          {contas.map((cc) => <option key={cc.id} value={cc.id}>{cc.nome}</option>)}
        </select>
        <div style={c.tabs}>
          {ESTADOS.map((s) => (
            <button key={s.valor} onClick={() => setEstado(s.valor)} style={{ ...c.tab, ...(estado === s.valor ? c.tabAtiva : {}) }}>{s.label}</button>
          ))}
        </div>
        {aCarregar && <span style={c.muted}>A carregar…</span>}
      </section>

      {/* Lista */}
      {movs.length === 0 && !aCarregar && <p style={c.vazio}>Nada aqui. 🎉</p>}

      <div style={c.lista}>
        {movs.map((m) => (
          <MovimentoCard
            key={m.id} m={m} estado={estado} sugestao={sugestoes[m.id]}
            ocupado={ocupado === m.id}
            onConfirmar={() => { const s = sugestoes[m.id]; if (s) confirmarSugestao(m, s) }}
            onIgnorar={(cat) => acao(m.id, () => ignorarMovimento(m.id, cat))}
            onEscolher={() => setPicker(m)}
            onContaCorrente={() => setPickerCC(m)}
            onIA={() => correrIA(m)}
            onDesfazer={() => acao(m.id, () => desfazerMatch(m.id))}
            onDesfazerCC={() => acao(m.id, () => desconciliarBankCC(m.id))}
            onReabrir={() => acao(m.id, () => reabrirMovimento(m.id))}
          />
        ))}
      </div>

      {picker && (
        <PickerFatura
          mov={picker} faturas={faturas} sugeridoIds={(sugestoes[picker.id]?.clienteIds) ?? []}
          onFechar={() => setPicker(null)}
          onConfirmar={(faturaId, valor) => { const mv = picker; setPicker(null); acao(mv.id, () => confirmarMatch(mv.id, [{ movimento_id: faturaId, valor }], mv.data, perfil?.nome ?? null)) }}
        />
      )}

      {pickerCC && (
        <PickerContaCorrente
          mov={pickerCC} contas={contasCC}
          onFechar={() => setPickerCC(null)}
          onConfirmar={(contaId, alocacoes) => { const mv = pickerCC; setPickerCC(null); acao(mv.id, () => conciliarBankCC(mv.id, contaId, alocacoes, mv.data, perfil?.nome ?? null)) }}
        />
      )}
    </main>
  )
}

function Ind({ tit, n, extra, cor, bg }: { tit: string; n: number; extra: string; cor: string; bg: string }) {
  return (
    <div style={{ ...c.ind, background: bg }}>
      <div style={{ ...c.indN, color: cor }}>{n}</div>
      <div style={c.indTit}>{tit}</div>
      {extra && <div style={c.indExtra}>{extra}</div>}
    </div>
  )
}

function ConfBadge({ conf }: { conf: Sugestao['confianca'] }) {
  const map: Record<string, { t: string; cor: string; bg: string }> = {
    alta: { t: 'confiança alta', cor: '#065F46', bg: '#D1FAE5' },
    media: { t: 'confiança média', cor: '#1E40AF', bg: '#DBEAFE' },
    baixa: { t: 'confiança baixa', cor: '#92400E', bg: '#FEF3C7' },
    ambiguo: { t: 'ambíguo', cor: '#9A3412', bg: '#FFEDD5' },
    nenhuma: { t: 'sem sugestão', cor: '#6B7280', bg: '#F3F4F6' },
  }
  const k = map[conf]
  return <span style={{ ...c.badge, color: k.cor, background: k.bg }}>{k.t}</span>
}

function MovimentoCard({ m, estado, sugestao, ocupado, onConfirmar, onIgnorar, onEscolher, onContaCorrente, onIA, onDesfazer, onDesfazerCC, onReabrir }: {
  m: BankMovimento; estado: EstadoMov; sugestao?: Sugestao; ocupado: boolean
  onConfirmar: () => void; onIgnorar: (c: IgnorarCategoria) => void; onEscolher: () => void
  onContaCorrente: () => void; onIA: () => void; onDesfazer: () => void; onDesfazerCC: () => void; onReabrir: () => void
}) {
  const [feitas, setFeitas] = useState<AlocacaoFeita[] | null>(null)
  const [ccFeitas, setCcFeitas] = useState<CCMovimentoDoBanco[] | null>(null)
  useEffect(() => { if (estado === 'conciliado') { alocacoesDoMovimento(m.id).then(setFeitas); ccMovimentosDoBanco(m.id).then(setCcFeitas) } }, [estado, m.id])

  return (
    <div style={c.card}>
      <div style={c.cardEsq}>
        <div style={c.movTopo}>
          <span style={c.movData}>{m.data}</span>
          <span style={c.movConta}>{m.conta_nome}</span>
        </div>
        <div style={c.movDesc}>{m.descritivo}</div>
        {m.observacoes && <div style={c.movObs}>📝 {m.observacoes}</div>}
        <div style={c.movValor}>+{formatarValor(m.valor, m.conta_moeda)}</div>
      </div>

      <div style={c.cardDir}>
        {estado === 'por_conciliar' && sugestao && (
          <>
            <ConfBadge conf={sugestao.confianca} />
            <div style={c.motivo}>{sugestao.motivo}</div>
            {sugestao.alocacoes.length > 0 && (
              <div style={c.faturas}>
                {sugestao.alocacoes.map((a) => (
                  <div key={a.fatura.id} style={c.faturaLinha}>
                    <span>{a.fatura.documento_ref ?? 'fatura'} · <strong>{a.fatura.cliente_nome}</strong></span>
                    <span style={c.muted}>{formatarValor(a.valor, m.conta_moeda)} de {formatarValor(a.fatura.porLiquidar, m.conta_moeda)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={c.acoes}>
              {sugestao.alocacoes.length > 0 && (
                <button style={c.btnPrim} disabled={ocupado} onClick={onConfirmar}>{ocupado ? '…' : '✓ Confirmar'}</button>
              )}
              <button style={c.btnSec} disabled={ocupado} onClick={onEscolher}>Escolher fatura…</button>
              <button style={c.btnSec} disabled={ocupado} onClick={onContaCorrente} title="Casar com uma venda da conta corrente (parceria)">🤝 Conta Corrente…</button>
              <button style={c.btnSec} disabled={ocupado} onClick={onIA} title="Interpretar o descritivo com IA">✨ IA</button>
              <IgnorarMenu disabled={ocupado} onIgnorar={onIgnorar} />
            </div>
          </>
        )}

        {estado === 'conciliado' && (
          <>
            <span style={{ ...c.badge, color: '#065F46', background: '#D1FAE5' }}>conciliado</span>
            {(feitas ?? []).length > 0 && (
              <>
                <div style={c.faturas}>
                  {(feitas ?? []).map((f, i) => (
                    <div key={i} style={c.faturaLinha}>
                      <span>{f.fatura_ref ?? 'fatura'} · <strong>{f.cliente_nome ?? '—'}</strong></span>
                      <span style={c.muted}>{formatarValor(f.valor_aplicado, m.conta_moeda)}</span>
                    </div>
                  ))}
                </div>
                <button style={c.btnSec} disabled={ocupado} onClick={onDesfazer}>↩ Desfazer</button>
              </>
            )}
            {(ccFeitas ?? []).length > 0 && (
              <>
                <div style={c.faturas}>
                  {(ccFeitas ?? []).map((f) => (
                    <div key={f.id} style={c.faturaLinha}>
                      <span>🤝 Conta corrente · <strong>{f.conta_nome ?? '—'}</strong></span>
                      <span style={c.muted}>{formatarMoeda(f.valor, f.moeda)}</span>
                    </div>
                  ))}
                </div>
                <button style={c.btnSec} disabled={ocupado} onClick={onDesfazerCC}>↩ Desfazer (conta corrente)</button>
              </>
            )}
            {(feitas ?? []).length === 0 && (ccFeitas ?? []).length === 0 && (
              <button style={c.btnSec} disabled={ocupado} onClick={onDesfazer}>↩ Desfazer</button>
            )}
          </>
        )}

        {estado === 'ignorado' && (
          <>
            <span style={{ ...c.badge, color: '#92400E', background: '#FEF3C7' }}>ignorado · {m.ignorar_categoria ?? '—'}</span>
            <button style={c.btnSec} disabled={ocupado} onClick={onReabrir}>↩ Reabrir</button>
          </>
        )}
      </div>
    </div>
  )
}

function IgnorarMenu({ onIgnorar, disabled }: { onIgnorar: (c: IgnorarCategoria) => void; disabled: boolean }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button style={c.btnSec} disabled={disabled} onClick={() => setAberto((v) => !v)}>Ignorar como… ▾</button>
      {aberto && (
        <div style={c.menu}>
          {IGNORAR_CATEGORIAS.map((cat) => (
            <button key={cat.valor} style={c.menuItem} onClick={() => { setAberto(false); onIgnorar(cat.valor) }}>{cat.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function PickerFatura({ mov, faturas, sugeridoIds, onFechar, onConfirmar }: {
  mov: BankMovimento; faturas: FaturaDivida[]; sugeridoIds: string[]
  onFechar: () => void; onConfirmar: (faturaId: string, valor: number) => void
}) {
  const [q, setQ] = useState('')
  const [valores, setValores] = useState<Record<string, string>>({})
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = faturas.filter((f) => (t ? (f.cliente_nome.toLowerCase().includes(t) || (f.documento_ref ?? '').toLowerCase().includes(t) || String(f.porLiquidar).includes(t)) : true))
    // clientes sugeridos primeiro
    return base.sort((a, b) => (sugeridoIds.includes(b.cliente_id) ? 1 : 0) - (sugeridoIds.includes(a.cliente_id) ? 1 : 0))
  }, [q, faturas, sugeridoIds])

  return (
    <div style={c.modalFundo} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalTopo}>
          <strong>Escolher fatura para {formatarValor(mov.valor, mov.conta_moeda)}</strong>
          <button style={c.fechar} onClick={onFechar}>✕</button>
        </div>
        <div style={c.movDesc}>{mov.descritivo}</div>
        <input autoFocus placeholder="Procurar por cliente, nº de fatura ou valor…" value={q} onChange={(e) => setQ(e.target.value)} style={c.input} />
        <div style={c.pickerLista}>
          {filtradas.slice(0, 60).map((f) => {
            const sugerido = sugeridoIds.includes(f.cliente_id)
            const vParcial = parseFloat((valores[f.id] ?? '').replace(',', '.'))
            return (
              <div key={f.id} style={{ ...c.pickerLinha, ...(sugerido ? c.pickerSugerido : {}) }}>
                <div style={{ flex: 1 }}>
                  <div><strong>{f.cliente_nome}</strong> {sugerido && <span style={c.tagSug}>sugerido</span>}</div>
                  <div style={c.muted}>{f.documento_ref ?? 'fatura'} · {f.data_documento} · em dívida {formatarValor(f.porLiquidar, mov.conta_moeda)}</div>
                </div>
                <div style={c.pickerAcoes}>
                  <button style={c.btnMini} onClick={() => onConfirmar(f.id, Math.min(mov.valor, f.porLiquidar))} title="Aplicar o valor do movimento (ou o que falta liquidar)">Pagar {formatarValor(Math.min(mov.valor, f.porLiquidar), mov.conta_moeda)}</button>
                  <span style={c.parcial}>
                    <input placeholder="parcial" value={valores[f.id] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [f.id]: e.target.value }))} style={c.inputMini} />
                    <button style={c.btnMini} disabled={isNaN(vParcial) || vParcial <= 0} onClick={() => onConfirmar(f.id, vParcial)}>OK</button>
                  </span>
                </div>
              </div>
            )
          })}
          {filtradas.length === 0 && <p style={c.muted}>Sem faturas em dívida que correspondam.</p>}
        </div>
      </div>
    </div>
  )
}

function parseNum(v: string): number {
  const n = Number((v ?? '').replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

// Picker: casa o movimento bancário (crédito, em EUR) com vendas em dívida de uma
// conta corrente. O valor é introduzido na moeda da conta (ex.: AED); o
// contravalor em EUR (valor ÷ taxa) não pode exceder o valor do banco.
function PickerContaCorrente({ mov, contas, onFechar, onConfirmar }: {
  mov: BankMovimento; contas: ContaComSaldo[]
  onFechar: () => void; onConfirmar: (contaId: string, alocacoes: AlocacaoCC[]) => void
}) {
  const [contaId, setContaId] = useState('')
  const [processos, setProcessos] = useState<Processo[]>([])
  const [aCarregar, setACarregar] = useState(false)
  const [taxa, setTaxa] = useState('1')
  const [valores, setValores] = useState<Record<string, string>>({})

  const conta = contas.find((x) => x.id === contaId) ?? null

  const carregarVendas = useCallback(async () => {
    if (!contaId) { setProcessos([]); return }
    setACarregar(true); setValores({})
    const c0 = contas.find((x) => x.id === contaId)
    const ps = await listarProcessos(contaId)
    const filtrados = ps.filter((p) => p.vendaId && p.emFalta > 0.01)
    // Taxa por defeito: contratual da conta, senão a taxa das consignações (ex.:
    // Laserix usa taxa por máquina, não na conta), senão 1.
    const taxaCons = filtrados.find((p) => p.taxaCusto && p.taxaCusto > 0)?.taxaCusto
    const taxaDefault = c0?.taxa_contratual || taxaCons || (c0 && c0.moeda === 'EUR' ? 1 : null)
    setTaxa(taxaDefault ? String(taxaDefault) : '1')
    setProcessos(filtrados); setACarregar(false)
  }, [contaId, contas])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregarVendas() }, [carregarVendas])

  const taxaNum = parseNum(taxa) || 1
  // Total alocado (na moeda da conta) e o seu contravalor em EUR.
  const totalConta = useMemo(() => Object.values(valores).reduce((s, v) => s + parseNum(v), 0), [valores])
  const totalEur = totalConta / taxaNum
  const excede = totalEur > mov.valor + 0.01
  const algumValor = totalConta > 0.009

  function alocar(vendaId: string, valorConta: number) {
    setValores((v) => ({ ...v, [vendaId]: String(Math.round(valorConta * 100) / 100) }))
  }

  function confirmar() {
    if (!conta || excede || !algumValor) return
    const alocacoes: AlocacaoCC[] = processos
      .filter((p) => parseNum(valores[p.vendaId!]) > 0)
      .map((p) => ({ origem_tipo: 'venda' as const, origem_id: p.vendaId, valor: parseNum(valores[p.vendaId!]), moeda: conta.moeda, taxa: taxaNum }))
    if (alocacoes.length) onConfirmar(conta.id, alocacoes)
  }

  return (
    <div style={c.modalFundo} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalTopo}>
          <strong>Casar {formatarValor(mov.valor, mov.conta_moeda)} com conta corrente</strong>
          <button style={c.fechar} onClick={onFechar}>✕</button>
        </div>
        <div style={c.movDesc}>{mov.descritivo}</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={{ ...c.input, flex: '1 1 220px' }}>
            <option value="">— escolher conta corrente —</option>
            {contas.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.moeda})</option>)}
          </select>
          {conta && conta.moeda !== 'EUR' && (
            <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              Taxa ({conta.moeda}/EUR)
              <input value={taxa} onChange={(e) => setTaxa(e.target.value)} style={{ ...c.inputMini, width: 90 }} />
            </label>
          )}
        </div>

        {aCarregar && <p style={c.muted}>A carregar vendas…</p>}
        {!aCarregar && contaId && processos.length === 0 && <p style={c.muted}>Sem vendas em dívida nesta conta.</p>}

        <div style={c.pickerLista}>
          {processos.map((p) => {
            const emFaltaEur = p.emFalta / taxaNum
            const restaBancoEur = Math.max(0, mov.valor - (totalEur - parseNum(valores[p.vendaId!]) / taxaNum))
            const maxConta = Math.min(p.emFalta, restaBancoEur * taxaNum)
            const titulo = [p.marca, p.modelo].filter(Boolean).join(' ') || 'Equipamento'
            return (
              <div key={p.consignacaoId} style={c.pickerLinha}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><strong>{titulo}</strong>{p.numeroSerie ? <span style={c.muted}> · SN {p.numeroSerie}</span> : null}</div>
                  <div style={c.muted}>em dívida {formatarMoeda(p.emFalta, p.moeda)} ≈ {formatarValor(emFaltaEur, 'EUR')}</div>
                </div>
                <div style={c.pickerAcoes}>
                  <button style={c.btnMini} disabled={maxConta <= 0} onClick={() => alocar(p.vendaId!, maxConta)} title="Alocar o máximo possível">Máx.</button>
                  <input placeholder={`valor (${p.moeda})`} value={valores[p.vendaId!] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [p.vendaId!]: e.target.value }))} style={{ ...c.inputMini, width: 90 }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #eee', paddingTop: 10 }}>
          <span style={{ fontSize: 13, color: excede ? '#B91C1C' : 'var(--foreground)', fontWeight: 600 }}>
            Total: {conta ? formatarMoeda(totalConta, conta.moeda) : '—'} ≈ {formatarValor(totalEur, 'EUR')} de {formatarValor(mov.valor, mov.conta_moeda)}
            {excede && ' — excede o valor do banco'}
          </span>
          <button style={{ ...c.btnPrim, opacity: (!algumValor || excede) ? 0.5 : 1 }} disabled={!algumValor || excede} onClick={confirmar}>✓ Confirmar</button>
        </div>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  indicadores: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  ind: { borderRadius: 12, padding: '10px 16px', minWidth: 130 },
  indN: { fontSize: 24, fontWeight: 800 },
  indTit: { fontSize: 12.5, fontWeight: 700, color: '#374151' },
  indExtra: { fontSize: 12, color: '#6B7280' },
  filtros: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 },
  tabs: { display: 'flex', gap: 6 },
  tab: { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 999, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  vazio: { textAlign: 'center', color: 'var(--muted)', padding: 30, fontSize: 15 },
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { display: 'grid', gridTemplateColumns: '1.1fr 1.4fr', gap: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  cardEsq: { display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid #f0f0f0', paddingRight: 12 },
  cardDir: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' },
  movTopo: { display: 'flex', gap: 8, alignItems: 'center' },
  movData: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 },
  movConta: { fontSize: 11.5, color: '#6B7280', background: '#EEF2FF', borderRadius: 999, padding: '1px 8px' },
  movDesc: { fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)' },
  movObs: { fontSize: 12, color: '#6D28D9' },
  movValor: { fontSize: 18, fontWeight: 800, color: '#065F46', marginTop: 4 },
  motivo: { fontSize: 13, color: '#374151' },
  faturas: { display: 'flex', flexDirection: 'column', gap: 4, width: '100%' },
  faturaLinha: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, background: '#F9FAFB', borderRadius: 6, padding: '5px 8px' },
  acoes: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  badge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  btnSec: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  menu: { position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', zIndex: 10, minWidth: 200 },
  menuItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', fontSize: 13 },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  modalFundo: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 },
  modal: { background: '#fff', borderRadius: 14, padding: 18, width: 'min(700px, 96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 10 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' },
  input: { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 },
  pickerLista: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  pickerLinha: { display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #eee', borderRadius: 8, padding: '8px 10px' },
  pickerSugerido: { borderColor: '#A7F3D0', background: '#F0FDF4' },
  pickerAcoes: { display: 'flex', gap: 6, alignItems: 'center' },
  parcial: { display: 'flex', gap: 4, alignItems: 'center' },
  tagSug: { fontSize: 10.5, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 999, padding: '1px 7px' },
  btnMini: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 12 },
  inputMini: { width: 70, padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 },
}
