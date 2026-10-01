'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  construirMapa, obterConfig, guardarConfig, rotuloMes, formatarMoeda,
  listarCategorias, listarDespesasFixas, guardarDespesaFixa, eliminarDespesaFixa,
  listarPontuais, guardarPontual, eliminarPontual, marcarPontualRealizado,
  listarPlanos, criarPlano, eliminarPlano, gerarPrestacoesPlano, marcarPrestPlanoRecebida,
  type MapaCashflow, type CashflowConfig, type Categoria, type RecurringExpense,
  type ManualEntry, type PaymentPlan, type PlanoPrest,
} from '@/lib/cashflow'

type Vista = 'mapa' | 'planos' | 'despesas' | 'pontuais' | 'definicoes'
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'planos', label: 'Planos' },
  { id: 'despesas', label: 'Despesas fixas' },
  { id: 'pontuais', label: 'Pontuais' },
  { id: 'definicoes', label: 'Definições' },
]

function parseNum(v: string): number { const n = Number((v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }

export default function CashflowPage() {
  const { perfilCarregado, isFinanceiro } = useAuth()
  const router = useRouter()
  const [vista, setVista] = useState<Vista>('mapa')

  useEffect(() => { if (perfilCarregado && !isFinanceiro) router.replace('/') }, [perfilCarregado, isFinanceiro, router])
  if (!perfilCarregado) return <main style={c.page}><p style={c.estado}>A carregar…</p></main>
  if (!isFinanceiro) return <main style={c.page}><p style={c.estado}>🔒 Sem acesso ao Cashflow.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>📊 Mapa de Cashflow</h1>
          <p style={c.sub}>Previsão mensal de entradas e saídas. Os valores são derivados das fontes — corrige-se na origem, nunca na célula.</p>
        </div>
      </div>

      <div style={c.tabs}>
        {VISTAS.map((v) => (
          <button key={v.id} style={{ ...c.tab, ...(vista === v.id ? c.tabAtiva : {}) }} onClick={() => setVista(v.id)}>{v.label}</button>
        ))}
      </div>

      {vista === 'mapa' && <Mapa />}
      {vista === 'planos' && <Planos />}
      {vista === 'despesas' && <DespesasFixas />}
      {vista === 'pontuais' && <Pontuais />}
      {vista === 'definicoes' && <Definicoes />}
    </main>
  )
}

// ─── Vista: Mapa ─────────────────────────────────────────────────────────────
function Mapa() {
  const [mapa, setMapa] = useState<MapaCashflow | null>(null)
  const [incluirProvaveis, setIncluirProvaveis] = useState(true)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setMapa(await construirMapa(incluirProvaveis))
    setCarregando(false)
  }, [incluirProvaveis])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  if (carregando || !mapa) return <p style={c.estado}>A calcular o mapa…</p>
  const { meses } = mapa

  return (
    <div>
      <div style={c.barra}>
        <label style={c.toggle}>
          <input type="checkbox" checked={incluirProvaveis} onChange={(e) => setIncluirProvaveis(e.target.checked)} />
          incluir entradas prováveis
        </label>
      </div>

      {mapa.avisos.length > 0 && (
        <div style={c.qualidade}>
          <strong style={{ fontSize: 13 }}>⚠️ Fontes do mapa</strong>
          {mapa.avisos.map((a) => (
            <div key={a.chave} style={c.avisoLinha}>
              • {a.mensagem}{a.href && <Link href={a.href} style={c.avisoLink}> corrigir →</Link>}
            </div>
          ))}
        </div>
      )}

      <div style={c.grelhaWrap}>
        <table style={c.grelha}>
          <thead>
            <tr>
              <th style={{ ...c.th, ...c.thFonte }}>Fonte</th>
              {meses.map((m) => <th key={m} style={c.th}>{rotuloMes(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td style={c.grupoTd} colSpan={meses.length + 1}>ENTRADAS</td></tr>
            {mapa.entradas.map((l) => (
              <tr key={l.chave}>
                <td style={c.tdFonte}>{l.label}{l.estimado && <span style={c.tag}>est.</span>}{l.provavel && <span style={c.tagProv}>prov.</span>}</td>
                {meses.map((m) => <td key={m} style={c.td}>{cell(l.porMes[m])}</td>)}
              </tr>
            ))}
            <tr style={c.totalTr}>
              <td style={c.tdFonteTotal}>Total entradas</td>
              {meses.map((m) => <td key={m} style={c.tdTotal}>{cell(mapa.totalEntradas[m])}</td>)}
            </tr>

            <tr><td style={c.grupoTd} colSpan={meses.length + 1}>SAÍDAS</td></tr>
            {mapa.saidas.map((l) => (
              <tr key={l.chave}>
                <td style={c.tdFonte}>{l.label}{l.estimado && <span style={c.tag}>est.</span>}</td>
                {meses.map((m) => <td key={m} style={{ ...c.td, color: l.porMes[m] ? '#9A3412' : 'var(--muted)' }}>{l.porMes[m] ? `(${cell(l.porMes[m])})` : '—'}</td>)}
              </tr>
            ))}
            <tr style={c.totalTr}>
              <td style={c.tdFonteTotal}>Total saídas</td>
              {meses.map((m) => <td key={m} style={{ ...c.tdTotal, color: '#9A3412' }}>{mapa.totalSaidas[m] ? `(${cell(mapa.totalSaidas[m])})` : '—'}</td>)}
            </tr>

            <tr style={c.saldoTr}>
              <td style={c.tdFonteTotal}>Saldo do mês</td>
              {meses.map((m) => <td key={m} style={{ ...c.tdTotal, color: mapa.saldoMes[m] < 0 ? '#B91C1C' : '#065F46' }}>{cell(mapa.saldoMes[m])}</td>)}
            </tr>
            <tr style={c.acumTr}>
              <td style={c.tdFonteTotal}>Saldo acumulado</td>
              {meses.map((m) => (
                <td key={m} style={{ ...c.tdTotal, ...(mapa.saldoAcumulado[m] < 0 ? c.negativo : {}) }}>{cell(mapa.saldoAcumulado[m])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={c.nota}>Caixa inicial: <strong>{formatarMoeda(mapa.saldoInicial, 'EUR')}</strong> · ajusta em Definições. Meses a vermelho = saldo acumulado negativo.</p>
    </div>
  )
}

function cell(v: number | undefined): string {
  if (!v) return '—'
  return Math.round(v).toLocaleString('pt-PT')
}

// ─── Vista: Definições ───────────────────────────────────────────────────────
function Definicoes() {
  const { perfil } = useAuth()
  const [cfg, setCfg] = useState<CashflowConfig | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { obterConfig().then(setCfg) }, [])
  if (!cfg) return <p style={c.estado}>A carregar…</p>

  async function guardar() {
    setMsg(null)
    await guardarConfig({
      saldo_inicial: cfg!.saldo_inicial, data_saldo_inicial: cfg!.data_saldo_inicial,
      horizonte_meses: cfg!.horizonte_meses, prazo_fatura_dias: cfg!.prazo_fatura_dias,
    }, perfil?.nome ?? null)
    setMsg('Guardado ✓')
  }

  return (
    <div style={c.card}>
      {msg && <div style={c.ok}>{msg}</div>}
      <div style={c.grelha3}>
        <label style={c.campo}><span style={c.rotulo}>Caixa inicial (EUR)</span>
          <input inputMode="decimal" value={String(cfg.saldo_inicial)} onChange={(e) => setCfg({ ...cfg, saldo_inicial: parseNum(e.target.value) })} style={c.input} /></label>
        <label style={c.campo}><span style={c.rotulo}>Data do saldo inicial</span>
          <input type="date" value={cfg.data_saldo_inicial ?? ''} onChange={(e) => setCfg({ ...cfg, data_saldo_inicial: e.target.value })} style={c.input} /></label>
        <label style={c.campo}><span style={c.rotulo}>Horizonte (meses)</span>
          <input inputMode="numeric" value={String(cfg.horizonte_meses)} onChange={(e) => setCfg({ ...cfg, horizonte_meses: Math.max(1, Math.min(24, parseInt(e.target.value) || 6)) })} style={c.input} /></label>
        <label style={c.campo}><span style={c.rotulo}>Prazo faturas (dias)</span>
          <input inputMode="numeric" value={String(cfg.prazo_fatura_dias)} onChange={(e) => setCfg({ ...cfg, prazo_fatura_dias: parseInt(e.target.value) || 30 })} style={c.input} />
          <span style={c.ajuda}>Faturas sem vencimento entram no mês de (emissão + este prazo).</span></label>
      </div>
      <div><button style={c.btnPrim} onClick={guardar}>Guardar definições</button></div>
    </div>
  )
}

// ─── Vista: Despesas fixas ───────────────────────────────────────────────────
function DespesasFixas() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<RecurringExpense[]>([])
  const [cats, setCats] = useState<Categoria[]>([])
  const [edit, setEdit] = useState<Partial<RecurringExpense> | null>(null)

  const recarregar = useCallback(async () => { setLista(await listarDespesasFixas()) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar(); listarCategorias().then(setCats) }, [recarregar])

  async function guardar() {
    if (!edit?.descricao || !edit?.valor || !edit?.data_inicio) return
    await guardarDespesaFixa(edit, perfil?.nome ?? null)
    setEdit(null); recarregar()
  }
  async function remover(id: string) { if (window.confirm('Eliminar esta despesa fixa?')) { await eliminarDespesaFixa(id); recarregar() } }
  const nomeCat = (id: string | null) => cats.find((c0) => c0.id === id)?.nome ?? '—'

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>{lista.length} despesa(s) fixa(s)</span>
        <button style={c.btnPrimSm} onClick={() => setEdit({ periodicidade: 'mensal', moeda: 'EUR', ativo: true, data_inicio: new Date().toISOString().slice(0, 10) })}>+ Nova</button>
      </div>
      {edit && (
        <div style={c.card}>
          <div style={c.grelha3}>
            <label style={c.campo}><span style={c.rotulo}>Descrição</span><input value={edit.descricao ?? ''} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Categoria</span>
              <select value={edit.categoria_id ?? ''} onChange={(e) => setEdit({ ...edit, categoria_id: e.target.value || null })} style={c.input}>
                <option value="">—</option>{cats.map((ct) => <option key={ct.id} value={ct.id}>{ct.nome}</option>)}
              </select></label>
            <label style={c.campo}><span style={c.rotulo}>Valor (EUR)</span><input inputMode="decimal" value={edit.valor != null ? String(edit.valor) : ''} onChange={(e) => setEdit({ ...edit, valor: parseNum(e.target.value) })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Periodicidade</span>
              <select value={edit.periodicidade ?? 'mensal'} onChange={(e) => setEdit({ ...edit, periodicidade: e.target.value as RecurringExpense['periodicidade'] })} style={c.input}>
                <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option>
              </select></label>
            <label style={c.campo}><span style={c.rotulo}>Início</span><input type="date" value={edit.data_inicio ?? ''} onChange={(e) => setEdit({ ...edit, data_inicio: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Fim (opcional)</span><input type="date" value={edit.data_fim ?? ''} onChange={(e) => setEdit({ ...edit, data_fim: e.target.value || null })} style={c.input} /></label>
          </div>
          <div style={c.acoes}>
            <button style={c.btnPrim} onClick={guardar}>Guardar</button>
            <button style={c.btnSec} onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={c.lista}>
        {lista.map((d) => (
          <div key={d.id} style={{ ...c.linhaItem, opacity: d.ativo ? 1 : 0.5 }}>
            <div><strong>{d.descricao}</strong> <span style={c.muted}>· {nomeCat(d.categoria_id)} · {d.periodicidade}</span></div>
            <div style={c.linhaDir}>
              <span>{formatarMoeda(d.valor, d.moeda)}</span>
              <button style={c.miniBtn} onClick={() => setEdit(d)}>Editar</button>
              <button style={c.miniPerigo} onClick={() => remover(d.id)}>×</button>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p style={c.estado}>Sem despesas fixas. Adiciona salários, renda, seguros…</p>}
      </div>
    </div>
  )
}

// ─── Vista: Pontuais ─────────────────────────────────────────────────────────
function Pontuais() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<ManualEntry[]>([])
  const [edit, setEdit] = useState<Partial<ManualEntry> | null>(null)

  const recarregar = useCallback(async () => { setLista(await listarPontuais()) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function guardar() {
    if (!edit?.descricao || !edit?.valor || !edit?.data_prevista) return
    await guardarPontual(edit, perfil?.nome ?? null)
    setEdit(null); recarregar()
  }
  async function remover(id: string) { if (window.confirm('Eliminar este movimento pontual?')) { await eliminarPontual(id); recarregar() } }

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>{lista.length} pontual(is)</span>
        <button style={c.btnPrimSm} onClick={() => setEdit({ tipo: 'entrada', moeda: 'EUR', confianca: 'confirmada', estado: 'previsto', data_prevista: new Date().toISOString().slice(0, 10) })}>+ Novo</button>
      </div>
      {edit && (
        <div style={c.card}>
          <div style={c.grelha3}>
            <label style={c.campo}><span style={c.rotulo}>Tipo</span>
              <select value={edit.tipo ?? 'entrada'} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as 'entrada' | 'saida' })} style={c.input}>
                <option value="entrada">Entrada</option><option value="saida">Saída</option>
              </select></label>
            <label style={c.campo}><span style={c.rotulo}>Descrição</span><input value={edit.descricao ?? ''} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Entidade/cliente</span><input value={edit.entidade_nome ?? ''} onChange={(e) => setEdit({ ...edit, entidade_nome: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Valor (EUR)</span><input inputMode="decimal" value={edit.valor != null ? String(edit.valor) : ''} onChange={(e) => setEdit({ ...edit, valor: parseNum(e.target.value) })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Mês/data prevista</span><input type="date" value={edit.data_prevista ?? ''} onChange={(e) => setEdit({ ...edit, data_prevista: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Confiança</span>
              <select value={edit.confianca ?? 'confirmada'} onChange={(e) => setEdit({ ...edit, confianca: e.target.value as 'confirmada' | 'provavel' })} style={c.input}>
                <option value="confirmada">Confirmada</option><option value="provavel">Provável</option>
              </select></label>
          </div>
          <div style={c.acoes}>
            <button style={c.btnPrim} onClick={guardar}>Guardar</button>
            <button style={c.btnSec} onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={c.lista}>
        {lista.map((e) => (
          <div key={e.id} style={c.linhaItem}>
            <div>
              <span style={{ color: e.tipo === 'entrada' ? '#065F46' : '#9A3412', fontWeight: 700 }}>{e.tipo === 'entrada' ? '▲' : '▼'}</span>{' '}
              <strong>{e.descricao}</strong> <span style={c.muted}>· {e.entidade_nome || '—'} · {e.data_prevista}{e.confianca === 'provavel' ? ' · provável' : ''}{e.estado === 'realizado' ? ' · realizado' : ''}</span>
            </div>
            <div style={c.linhaDir}>
              <span>{formatarMoeda(e.valor, e.moeda)}</span>
              <button style={c.miniBtn} onClick={() => marcarPontualRealizado(e.id, e.estado !== 'realizado').then(recarregar)}>{e.estado === 'realizado' ? 'Reabrir' : 'Realizado'}</button>
              <button style={c.miniBtn} onClick={() => setEdit(e)}>Editar</button>
              <button style={c.miniPerigo} onClick={() => remover(e.id)}>×</button>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p style={c.estado}>Sem movimentos pontuais.</p>}
      </div>
    </div>
  )
}

// ─── Vista: Planos manuais ───────────────────────────────────────────────────
function Planos() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<(PaymentPlan & { prestacoes: PlanoPrest[] })[]>([])
  const [novo, setNovo] = useState<Partial<PaymentPlan> | null>(null)

  const recarregar = useCallback(async () => { setLista(await listarPlanos()) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function criar() {
    if (!novo?.cliente_nome || !novo?.valor_prestacao || !novo?.data_inicio || !novo?.n_prestacoes) return
    const { data } = await criarPlano(novo, perfil?.nome ?? null)
    if (data) await gerarPrestacoesPlano({ ...(data as PaymentPlan) })
    setNovo(null); recarregar()
  }
  async function remover(id: string) { if (window.confirm('Eliminar este plano e as suas prestações?')) { await eliminarPlano(id); recarregar() } }

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>{lista.length} plano(s) manual(is)</span>
        <button style={c.btnPrimSm} onClick={() => setNovo({ periodicidade: 'mensal', moeda: 'EUR', estado: 'ativo', data_inicio: new Date().toISOString().slice(0, 10), n_prestacoes: 12 })}>+ Novo plano</button>
      </div>
      {novo && (
        <div style={c.card}>
          <div style={c.grelha3}>
            <label style={c.campo}><span style={c.rotulo}>Cliente</span><input value={novo.cliente_nome ?? ''} onChange={(e) => setNovo({ ...novo, cliente_nome: e.target.value })} placeholder="ex.: Weldon" style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Descrição</span><input value={novo.descricao ?? ''} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Valor por prestação</span><input inputMode="decimal" value={novo.valor_prestacao != null ? String(novo.valor_prestacao) : ''} onChange={(e) => setNovo({ ...novo, valor_prestacao: parseNum(e.target.value) })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Periodicidade</span>
              <select value={novo.periodicidade ?? 'mensal'} onChange={(e) => setNovo({ ...novo, periodicidade: e.target.value as PaymentPlan['periodicidade'] })} style={c.input}>
                <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option>
              </select></label>
            <label style={c.campo}><span style={c.rotulo}>Nº de prestações</span><input inputMode="numeric" value={novo.n_prestacoes != null ? String(novo.n_prestacoes) : ''} onChange={(e) => setNovo({ ...novo, n_prestacoes: parseInt(e.target.value) || 0 })} style={c.input} /></label>
            <label style={c.campo}><span style={c.rotulo}>Início</span><input type="date" value={novo.data_inicio ?? ''} onChange={(e) => setNovo({ ...novo, data_inicio: e.target.value })} style={c.input} /></label>
          </div>
          <div style={c.acoes}>
            <button style={c.btnPrim} onClick={criar}>Criar plano e gerar prestações</button>
            <button style={c.btnSec} onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map((p) => <CartaoPlanoManual key={p.id} plano={p} onMudou={recarregar} onRemover={() => remover(p.id)} />)}
        {lista.length === 0 && <p style={c.estado}>Sem planos manuais. Cria um para clientes como a Weldon.</p>}
      </div>
    </div>
  )
}

function CartaoPlanoManual({ plano, onMudou, onRemover }: { plano: PaymentPlan & { prestacoes: PlanoPrest[] }; onMudou: () => void; onRemover: () => void }) {
  const pagas = plano.prestacoes.filter((x) => x.estado === 'recebido').length
  return (
    <div style={c.card}>
      <div style={c.barra}>
        <div>
          <strong>{plano.cliente_nome}</strong> <span style={c.muted}>· {plano.descricao || 'plano'} · {pagas}/{plano.prestacoes.length} recebidas</span>
        </div>
        <button style={c.miniPerigo} onClick={onRemover}>Eliminar</button>
      </div>
      <div style={c.lista}>
        {plano.prestacoes.map((pr) => (
          <div key={pr.id} style={c.linhaItem}>
            <div>#{pr.numero} · {pr.data_prevista} {pr.estado === 'recebido' && <span style={c.tagOk}>recebido</span>}</div>
            <div style={c.linhaDir}>
              <span>{formatarMoeda(pr.valor, 'EUR')}</span>
              <button style={c.miniBtn} onClick={() => marcarPrestPlanoRecebida(pr.id, pr.estado !== 'recebido', pr.valor).then(onMudou)}>{pr.estado === 'recebido' ? 'Reabrir' : 'Marcar recebido'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 13.5, maxWidth: 680 },
  estado: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 },
  tab: { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 999, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  toggle: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--foreground)' },
  qualidade: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  avisoLinha: { fontSize: 12.5, color: '#92400E' },
  avisoLink: { color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 },
  grelhaWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 },
  grelha: { borderCollapse: 'collapse', width: '100%', minWidth: 720, fontSize: 13 },
  th: { padding: '8px 10px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--muted)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', background: '#F9FAFB' },
  thFonte: { textAlign: 'left', position: 'sticky', left: 0, background: '#F9FAFB' },
  grupoTd: { padding: '6px 10px', fontSize: 11.5, fontWeight: 800, color: 'var(--primary)', background: '#F3F4F6', letterSpacing: 0.4 },
  td: { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f3f3' },
  tdFonte: { padding: '6px 10px', textAlign: 'left', position: 'sticky', left: 0, background: '#fff', borderBottom: '1px solid #f3f3f3' },
  tag: { fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '0 6px', marginLeft: 6 },
  tagProv: { fontSize: 10, fontWeight: 700, color: '#6D28D9', background: '#EDE9FE', borderRadius: 999, padding: '0 6px', marginLeft: 6 },
  tagOk: { fontSize: 10, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 999, padding: '0 6px', marginLeft: 6 },
  totalTr: { background: '#FAFAFA', fontWeight: 700 },
  tdFonteTotal: { padding: '7px 10px', textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: '#FAFAFA', borderTop: '1px solid var(--border)' },
  tdTotal: { padding: '7px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderTop: '1px solid var(--border)' },
  saldoTr: { background: '#F0F9FF' },
  acumTr: { background: '#EFF6FF', fontWeight: 800 },
  negativo: { color: '#B91C1C', background: '#FEE2E2' },
  nota: { fontSize: 12, color: 'var(--muted)', marginTop: 8 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 },
  ok: { background: '#e6f7f1', color: '#00875f', border: '1px solid #00A87A', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600 },
  grelha3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  ajuda: { fontSize: 11.5, color: 'var(--muted)' },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  lista: { display: 'flex', flexDirection: 'column', gap: 6 },
  linhaItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13.5, padding: '8px 10px', background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' },
  linhaDir: { display: 'flex', gap: 8, alignItems: 'center' },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnSec: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnPrimSm: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  miniBtn: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 7, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  miniPerigo: { background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 7, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
}
