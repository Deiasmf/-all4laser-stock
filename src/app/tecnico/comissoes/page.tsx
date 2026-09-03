'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarComissoes, resumoComissoes, listarTaxas, guardarTaxa, atribuirTecnico,
  definirPercentagem, definirEstado, ligarFolhaObra, adicionarDespesa, removerDespesa,
  detetarDespesasDoDocumento, folhasSugeridas, guardarNotas, calcularComissao,
  ESTADOS_COMISSAO, estadoComissaoInfo, formatarEuro, formatarData,
  FILTROS_COMISSAO_VAZIOS,
  type ComissaoCalc, type FiltrosComissao, type TaxaTecnico, type FolhaOpc, type EstadoComissao,
} from '@/lib/comissoes'
import { TIPOS_DESPESA, tipoDespesaLabel, type TipoDespesa } from '@/lib/categorizacaoFinanceira'
import { listarTecnicos, type TecnicoOpc } from '@/lib/folhasObra'

// Comissões do serviço técnico. As faturas classificadas como "serviço técnico"
// no Financeiro caem aqui automaticamente; aqui atribui-se o técnico, retiram-se
// as despesas (deslocações, alimentação, estadia) e apura-se a comissão.

export default function ComissoesPage() {
  const { perfil, isFinanceiro } = useAuth()
  const utilizador = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }

  const [linhas, setLinhas] = useState<ComissaoCalc[]>([])
  const [tecnicos, setTecnicos] = useState<TecnicoOpc[]>([])
  const [taxas, setTaxas] = useState<TaxaTecnico[]>([])
  const [f, setF] = useState<FiltrosComissao>(FILTROS_COMISSAO_VAZIOS)
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<string | null>(null)
  const [folhas, setFolhas] = useState<FolhaOpc[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [abrirTaxas, setAbrirTaxas] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [cs, ts] = await Promise.all([listarComissoes(f), listarTaxas()])
    setLinhas(cs); setTaxas(ts)
    setCarregando(false)
  }, [f])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { listarTecnicos().then(setTecnicos) }, [])

  const resumo = useMemo(() => resumoComissoes(linhas), [linhas])
  const taxaDe = useCallback(
    (id: string | null) => (id ? taxas.find((t) => t.tecnico_id === id)?.percentagem ?? null : null),
    [taxas]
  )

  function set<K extends keyof FiltrosComissao>(k: K, v: FiltrosComissao[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }
  const temFiltros = JSON.stringify(f) !== JSON.stringify(FILTROS_COMISSAO_VAZIOS)

  async function abrir(c: ComissaoCalc) {
    if (aberta === c.id) { setAberta(null); return }
    setAberta(c.id)
    setFolhas(await folhasSugeridas(c))
  }

  async function mudarTecnico(c: ComissaoCalc, id: string) {
    const t = tecnicos.find((x) => x.id === id) ?? null
    await atribuirTecnico(c.id, t ? { id: t.id, nome: t.nome } : null)
    await carregar()
  }

  async function mudarFolha(c: ComissaoCalc, id: string) {
    const folha = folhas.find((x) => x.id === id) ?? null
    await ligarFolhaObra(c.id, folha ? { id: folha.id, numero: folha.numero } : null)
    // A folha diz quem fez a intervenção: se ainda não houver técnico, herda-o.
    if (folha?.tecnico_id && !c.tecnico_id) {
      await atribuirTecnico(c.id, { id: folha.tecnico_id, nome: folha.tecnico_nome })
    }
    await carregar()
  }

  async function detetar(c: ComissaoCalc) {
    const n = await detetarDespesasDoDocumento(c, utilizador)
    setMsg(n > 0 ? `${n} despesa(s) detetada(s) na descrição do documento.` : 'Nada a detetar na descrição — lança as despesas à mão.')
    await carregar()
  }

  async function marcar(c: ComissaoCalc, estado: EstadoComissao) {
    if (estado !== 'por_apurar' && (c.percentagem == null || !c.tecnico_id)) {
      setMsg('Atribui o técnico e a percentagem antes de apurar.')
      return
    }
    await definirEstado(c.id, estado, perfil?.nome ?? null)
    await carregar()
  }

  return (
    <main style={s.page}>
      <div style={s.topo}>
        <div>
          <Link href="/tecnico" style={s.voltar}>← Técnico</Link>
          <h1 style={s.titulo}>💰 Comissões</h1>
          <p style={s.sub}>Faturas de serviço técnico, despesas deduzidas e comissão apurada.</p>
        </div>
        <button style={s.btnSec} onClick={() => setAbrirTaxas((v) => !v)}>📐 Taxas por técnico</button>
      </div>

      {msg && <div style={s.aviso} onClick={() => setMsg(null)}>{msg}</div>}

      {/* Indicadores */}
      <div style={s.cards}>
        <div style={s.card}><span style={s.cardTit}>Faturado (líquido)</span><span style={s.cardVal}>{formatarEuro(resumo.faturado)}</span><span style={s.cardNota}>{resumo.n} documento(s) · sem IVA</span></div>
        <div style={s.card}><span style={s.cardTit}>Despesas</span><span style={s.cardVal}>−{formatarEuro(resumo.despesas)}</span><span style={s.cardNota}>deslocações, alimentação, estadia</span></div>
        <div style={s.card}><span style={s.cardTit}>Base elegível</span><span style={s.cardVal}>{formatarEuro(resumo.base)}</span><span style={s.cardNota}>líquido − despesas</span></div>
        <div style={s.card}><span style={s.cardTit}>Comissões</span><span style={{ ...s.cardVal, color: 'var(--primary)' }}>{formatarEuro(resumo.comissoes)}</span><span style={s.cardNota}>{resumo.porApurar} por apurar</span></div>
        <div style={s.card}><span style={s.cardTit}>A pagar</span><span style={s.cardVal}>{formatarEuro(resumo.porPagar)}</span><span style={s.cardNota}>apuradas e ainda não pagas</span></div>
      </div>

      {/* Taxas */}
      {abrirTaxas && (
        <section style={s.painel}>
          <div style={s.painelTit}>Percentagem de comissão por técnico</div>
          <p style={s.nota}>
            A comissão é <strong>(líquido da fatura, sem IVA − despesas) × %</strong>. A percentagem fica gravada na linha ao apurar,
            por isso alterá-la aqui não reescreve o que já foi apurado.
            {!isFinanceiro && ' Só a administração/financeiro pode alterar estes valores.'}
          </p>
          <div style={s.taxas}>
            {tecnicos.map((t) => (
              <label key={t.id} style={s.taxaLinha}>
                <span style={s.taxaNome}>{t.nome ?? t.email ?? '—'}</span>
                <input
                  type="number" min={0} max={100} step="0.5"
                  defaultValue={taxas.find((x) => x.tecnico_id === t.id)?.percentagem ?? 0}
                  disabled={!isFinanceiro}
                  style={s.inputPct}
                  onBlur={async (e) => {
                    if (!isFinanceiro) return
                    await guardarTaxa({ id: t.id, nome: t.nome }, Number(e.target.value), perfil?.nome ?? null)
                    await carregar()
                  }}
                />
                <span style={s.pct}>%</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Filtros */}
      <div style={s.filtros}>
        <input placeholder="Cliente, documento ou técnico..." value={f.texto} onChange={(e) => set('texto', e.target.value)} style={{ ...s.input, flex: 1, minWidth: 180 }} />
        <select value={f.estado} onChange={(e) => set('estado', e.target.value as FiltrosComissao['estado'])} style={s.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_COMISSAO.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
        </select>
        <select value={f.tecnico_id} onChange={(e) => set('tecnico_id', e.target.value)} style={s.input}>
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome ?? t.email}</option>)}
        </select>
        <label style={s.dataLabel}>De <input type="date" value={f.de} onChange={(e) => set('de', e.target.value)} style={s.input} /></label>
        <label style={s.dataLabel}>Até <input type="date" value={f.ate} onChange={(e) => set('ate', e.target.value)} style={s.input} /></label>
        <label style={s.check}>
          <input type="checkbox" checked={f.incluirAnuladas} onChange={(e) => set('incluirAnuladas', e.target.checked)} />
          Incluir origem anulada
        </label>
        {temFiltros && <button style={s.btnGhost} onClick={() => setF(FILTROS_COMISSAO_VAZIOS)}>Limpar</button>}
      </div>

      {carregando ? (
        <p style={s.estado}>A carregar...</p>
      ) : linhas.length === 0 ? (
        <p style={s.estado}>
          Sem comissões. As faturas classificadas como <strong>serviço técnico</strong> no Financeiro aparecem aqui automaticamente.
        </p>
      ) : (
        <div style={s.tabela}>
          <div style={{ ...s.linha, ...s.cab }}>
            <span>Data</span>
            <span>Cliente</span>
            <span>Documento</span>
            <span>Técnico</span>
            <span style={{ textAlign: 'right' }}>Fatura</span>
            <span style={{ textAlign: 'right' }}>Despesas</span>
            <span style={{ textAlign: 'right' }}>Comissão</span>
            <span style={{ textAlign: 'center' }}>Estado</span>
          </div>
          {linhas.map((c) => {
            const est = estadoComissaoInfo(c.estado)
            const editavel = c.estado !== 'paga'
            return (
              <div key={c.id}>
                <div style={{ ...s.linha, ...(c.origem_anulada ? s.anulada : {}) }} onClick={() => abrir(c)}>
                  <span style={s.muted}>{formatarData(c.data_documento)}</span>
                  <span>{c.cliente_nome ?? '—'}</span>
                  <span>
                    {c.documento_ref ?? '—'}
                    {c.origem_anulada && <span style={s.tagAnulada}>origem anulada</span>}
                  </span>
                  <span>
                    {c.tecnico_nome ?? <span style={s.porAtribuir}>por atribuir</span>}
                    {c.percentagem != null && <span style={s.pctLinha}>{c.percentagem}%</span>}
                  </span>
                  <span style={{ textAlign: 'right' }}>{formatarEuro(c.valor_documento)}</span>
                  <span style={{ textAlign: 'right', color: c.totalDespesas > 0 ? '#B45309' : 'var(--muted)' }}>
                    {c.totalDespesas > 0 ? `−${formatarEuro(c.totalDespesas)}` : '—'}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(c.valorComissao)}</span>
                  <span style={{ textAlign: 'center' }}>
                    <span style={{ ...s.badge, color: est.cor, background: est.bg }}>{est.label}</span>
                  </span>
                </div>

                {aberta === c.id && (
                  <div style={s.detalhe}>
                    {c.descricao && <p style={s.descricao}>{c.descricao}</p>}

                    <div style={s.detGrelha}>
                      {/* Atribuição */}
                      <div style={s.bloco}>
                        <div style={s.blocoTit}>Atribuição</div>
                        <label style={s.campo}>Técnico
                          <select value={c.tecnico_id ?? ''} disabled={!editavel} style={s.input} onChange={(e) => mudarTecnico(c, e.target.value)}>
                            <option value="">—</option>
                            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome ?? t.email}</option>)}
                          </select>
                        </label>
                        <label style={s.campo}>Percentagem (%)
                          <input
                            type="number" min={0} max={100} step="0.5" disabled={!editavel}
                            defaultValue={c.percentagem ?? taxaDe(c.tecnico_id) ?? 0}
                            style={s.input}
                            onBlur={async (e) => { await definirPercentagem(c.id, Number(e.target.value)); await carregar() }}
                          />
                        </label>
                        <label style={s.campo}>Folha de obra
                          <select value={c.folha_obra_id ?? ''} disabled={!editavel} style={s.input} onChange={(e) => mudarFolha(c, e.target.value)}>
                            <option value="">— (sem folha associada)</option>
                            {folhas.map((fo) => (
                              <option key={fo.id} value={fo.id}>{fo.numero} · {formatarData(fo.data_intervencao)}{fo.tecnico_nome ? ` · ${fo.tecnico_nome}` : ''}</option>
                            ))}
                          </select>
                        </label>
                        {c.folha_obra_id && (
                          <Link href={`/tecnico/folhas-obra/${c.folha_obra_id}`} style={s.link}>Abrir folha {c.folha_numero ?? ''} ↗</Link>
                        )}
                      </div>

                      {/* Despesas */}
                      <div style={s.bloco}>
                        <div style={s.blocoTit}>
                          Despesas a deduzir
                          <button style={s.btnMini} disabled={!editavel} onClick={() => detetar(c)}>🔍 Detetar da descrição</button>
                        </div>
                        {c.despesas.length === 0 ? (
                          <p style={s.vazio}>Sem despesas lançadas.</p>
                        ) : (
                          c.despesas.map((d) => (
                            <div key={d.id} style={s.despLinha}>
                              <span>{tipoDespesaLabel(d.tipo)}{d.origem === 'auto' && <span style={s.tagAuto}>auto</span>}</span>
                              <span style={s.muted}>{d.descricao ?? '—'}</span>
                              <span style={{ fontWeight: 600 }}>{formatarEuro(d.valor)}</span>
                              <button style={s.remover} disabled={!editavel} onClick={async () => { await removerDespesa(d.id); await carregar() }}>✕</button>
                            </div>
                          ))
                        )}
                        {editavel && <NovaDespesa onGuardar={async (d) => { await adicionarDespesa(c.id, d, utilizador); await carregar() }} />}
                      </div>

                      {/* Apuramento */}
                      <div style={s.bloco}>
                        <div style={s.blocoTit}>Apuramento</div>
                        <Conta c={c} />
                        <textarea
                          defaultValue={c.notas ?? ''} placeholder="Notas do apuramento..." rows={3} disabled={!editavel}
                          style={s.textarea}
                          onBlur={async (e) => { await guardarNotas(c.id, e.target.value); await carregar() }}
                        />
                        <div style={s.acoes}>
                          {c.estado !== 'apurada' && <button style={s.btnPrim} disabled={c.origem_anulada} onClick={() => marcar(c, 'apurada')}>Marcar apurada</button>}
                          {c.estado === 'apurada' && <button style={s.btnPrim} onClick={() => marcar(c, 'paga')}>Marcar paga</button>}
                          {c.estado !== 'por_apurar' && <button style={s.btnSec} onClick={() => marcar(c, 'por_apurar')}>Reabrir</button>}
                        </div>
                        {c.apurada_em && <p style={s.vazio}>Apurada por {c.apurada_por_nome ?? '—'} em {formatarData(c.apurada_em.slice(0, 10))}{c.paga_em ? ` · paga em ${formatarData(c.paga_em)}` : ''}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

// Conta do apuramento, com o mesmo cálculo da biblioteca.
function Conta({ c }: { c: ComissaoCalc }) {
  const r = calcularComissao(c.valor_documento, c.despesas, c.percentagem)
  return (
    <div style={s.conta}>
      <div style={s.contaLinha}><span>Fatura (líquido)</span><span>{formatarEuro(c.valor_documento)}</span></div>
      <div style={s.contaLinha}><span>Despesas</span><span>−{formatarEuro(r.totalDespesas)}</span></div>
      <div style={{ ...s.contaLinha, ...s.contaBase }}><span>Base elegível</span><span>{formatarEuro(r.base)}</span></div>
      <div style={s.contaLinha}><span>Percentagem</span><span>{c.percentagem == null ? '—' : `${c.percentagem}%`}</span></div>
      <div style={{ ...s.contaLinha, ...s.contaTotal }}><span>Comissão</span><span>{formatarEuro(r.valorComissao)}</span></div>
    </div>
  )
}

function NovaDespesa({ onGuardar }: { onGuardar: (d: { tipo: TipoDespesa; descricao: string | null; valor: number }) => Promise<void> }) {
  const [tipo, setTipo] = useState<TipoDespesa>('deslocacao')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  async function guardar() {
    const v = Number(valor.replace(',', '.'))
    if (!v || v <= 0) return
    setAGuardar(true)
    await onGuardar({ tipo, descricao: descricao.trim() || null, valor: v })
    setDescricao(''); setValor('')
    setAGuardar(false)
  }

  return (
    <div style={s.novaDesp}>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDespesa)} style={s.input}>
        {TIPOS_DESPESA.map((t) => <option key={t.valor} value={t.valor}>{t.icon} {t.label}</option>)}
      </select>
      <input placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} style={s.input} />
      <input placeholder="Valor €" value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value)} style={{ ...s.input, width: 90 }} />
      <button style={s.btnMini} disabled={aGuardar || !valor} onClick={guardar}>+ Adicionar</button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12, cursor: 'pointer' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 },
  card: { display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  cardTit: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  cardVal: { fontSize: 19, fontWeight: 700 },
  cardNota: { fontSize: 11.5, color: 'var(--muted)' },
  painel: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  painelTit: { fontWeight: 700, color: 'var(--primary)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  nota: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 },
  taxas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 },
  taxaLinha: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' },
  taxaNome: { flex: 1, fontSize: 13.5 },
  inputPct: { width: 70, padding: 6, border: '1px solid #ccc', borderRadius: 6, fontSize: 13.5, textAlign: 'right' },
  pct: { color: 'var(--muted)', fontSize: 13 },
  filtros: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  dataLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  btnGhost: { background: 'var(--surface, #fff)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnSec: { background: 'var(--surface, #fff)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnMini: { background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.9fr 1.6fr 1.4fr 1.4fr 0.9fr 0.9fr 0.9fr 1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 950, cursor: 'pointer' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)', cursor: 'default' },
  anulada: { opacity: 0.55 },
  tagAnulada: { fontSize: 10.5, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', borderRadius: 999, padding: '1px 7px', marginLeft: 6 },
  tagAuto: { fontSize: 10, fontWeight: 700, color: '#5B21B6', background: '#EDE9FE', borderRadius: 999, padding: '1px 6px', marginLeft: 6 },
  muted: { color: 'var(--muted)', fontSize: 13 },
  porAtribuir: { color: '#B45309', fontSize: 12.5 },
  pctLinha: { color: 'var(--muted)', fontSize: 11.5, marginLeft: 6 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  detalhe: { background: 'var(--accent-bg, #f7f8fa)', borderBottom: '1px solid #eee', padding: 14 },
  descricao: { fontSize: 13, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 },
  detGrelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start' },
  bloco: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  blocoTit: { fontWeight: 700, fontSize: 13.5, color: 'var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--muted)' },
  link: { color: 'var(--primary)', fontSize: 13, textDecoration: 'none', fontWeight: 600 },
  vazio: { fontSize: 12.5, color: 'var(--muted)' },
  despLinha: { display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 0.7fr 24px', gap: 6, alignItems: 'center', fontSize: 12.5, borderBottom: '1px solid #f4f4f4', padding: '4px 0' },
  remover: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  novaDesp: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  conta: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 },
  contaLinha: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  contaBase: { borderTop: '1px solid var(--border)', paddingTop: 4, fontWeight: 600 },
  contaTotal: { borderTop: '2px solid var(--border)', paddingTop: 5, fontWeight: 700, fontSize: 15, color: 'var(--primary)' },
  textarea: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
}
