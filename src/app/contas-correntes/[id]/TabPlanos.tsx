'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarPlanos, criarPlano, gerarPrestacoes, editarPrestacao,
  registarRecebimentoPrestacao, marcarAtrasos,
  estadoPrestacaoInfo, PERIODICIDADES, MOEDAS,
  formatarMoeda, formatarData, hojeISO,
  type ContaComSaldo, type PlanoRow, type Prestacao, type Periodicidade,
} from '@/lib/cc'

function parseNum(v: string): number {
  const n = Number(v.replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

export default function TabPlanos({ conta, onMudou }: {
  conta: ContaComSaldo; onMudou: () => void
}) {
  const [planos, setPlanos] = useState<PlanoRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function recarregar() {
    setPlanos(await listarPlanos(conta.id))
    setCarregando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [conta.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function atualizarAtrasos() {
    setAviso(null)
    const { count, error } = await marcarAtrasos()
    if (error) { setAviso('Erro: ' + error.message); return }
    setAviso(count > 0 ? `${count} prestação(ões) marcada(s) como atrasada(s).` : 'Sem prestações vencidas por marcar.')
    recarregar()
  }

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>{planos.length} plano(s)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={c.btnSecundarioSm} onClick={atualizarAtrasos}>Atualizar atrasos</button>
          <button style={c.btnPrimarioSm} onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? '× Fechar' : '+ Criar plano'}
          </button>
        </div>
      </div>

      {aviso && <div style={c.aviso}>{aviso}</div>}

      {addOpen && (
        <FormPlano
          conta={conta}
          onCancelar={() => setAddOpen(false)}
          onGuardado={() => { setAddOpen(false); recarregar() }}
        />
      )}

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : planos.length === 0 ? (
        <p style={c.estado}>Ainda não há planos de pagamento nesta conta.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {planos.map((p) => (
            <CartaoPlano key={p.id} conta={conta} plano={p} onMudou={() => { recarregar(); onMudou() }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cartão de um plano ──────────────────────────────────────────────────────

function CartaoPlano({ conta, plano, onMudou }: {
  conta: ContaComSaldo; plano: PlanoRow; onMudou: () => void
}) {
  const [aberto, setAberto] = useState(true)
  const pagas = plano.prestacoes.filter((x) => x.estado === 'paga').length
  const total = plano.prestacoes.length
  const recebido = plano.prestacoes.filter((x) => x.estado === 'paga' || x.estado === 'parcial')
    .reduce((s, x) => s + x.valor, 0)

  return (
    <div style={c.cartao}>
      <div style={c.cartaoTopo} onClick={() => setAberto((v) => !v)}>
        <div style={{ minWidth: 0 }}>
          <div style={c.cartaoTitulo}>{plano.descricao || 'Plano de pagamento'}</div>
          <div style={c.cartaoMeta}>
            {formatarMoeda(plano.valor_total, plano.moeda)} · {plano.n_prestacoes}× {PERIODICIDADES.find((x) => x.valor === plano.periodicidade)?.label.toLowerCase()}
            {plano.entrada ? ` · entrada ${formatarMoeda(plano.entrada, plano.moeda)}` : ''} · início {formatarData(plano.data_inicio)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={c.progresso}>{pagas}/{total} pagas</div>
          <div style={c.recebido}>recebido: {formatarMoeda(recebido, plano.moeda)}</div>
          <span style={c.chevron}>{aberto ? '▾' : '▸'}</span>
        </div>
      </div>

      {aberto && (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Nº</span>
            <span>Vencimento</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span style={{ textAlign: 'center' }}>Estado</span>
            <span>Pagamento</span>
            <span style={{ textAlign: 'right' }}>Ações</span>
          </div>
          {plano.prestacoes.map((pr) => (
            <LinhaPrestacao key={pr.id} conta={conta} pr={pr} onMudou={onMudou} />
          ))}
        </div>
      )}
    </div>
  )
}

function LinhaPrestacao({ conta, pr, onMudou }: {
  conta: ContaComSaldo; pr: Prestacao; onMudou: () => void
}) {
  const [modo, setModo] = useState<'ver' | 'receber' | 'editar'>('ver')
  const info = estadoPrestacaoInfo(pr.estado)
  const paga = pr.estado === 'paga'

  return (
    <>
      <div style={c.linha}>
        <span>{pr.numero === 0 ? 'Entrada' : pr.numero}</span>
        <span>{formatarData(pr.data_vencimento)}</span>
        <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatarMoeda(pr.valor, pr.moeda)}</span>
        <span style={{ textAlign: 'center' }}>
          <span style={{ ...c.pill, color: info.cor, background: info.bg }}>{info.label}</span>
        </span>
        <span style={{ color: pr.data_pagamento ? 'var(--foreground)' : 'var(--muted)' }}>{formatarData(pr.data_pagamento)}</span>
        <span style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!paga && <button style={c.acaoBtn} onClick={() => setModo(modo === 'receber' ? 'ver' : 'receber')}>Receber</button>}
          {!paga && <button style={c.acaoBtnGhost} onClick={() => setModo(modo === 'editar' ? 'ver' : 'editar')}>Editar</button>}
        </span>
      </div>

      {modo === 'receber' && (
        <FormRecebimento conta={conta} pr={pr} onCancelar={() => setModo('ver')} onGuardado={() => { setModo('ver'); onMudou() }} />
      )}
      {modo === 'editar' && (
        <FormEditarPrestacao pr={pr} onCancelar={() => setModo('ver')} onGuardado={() => { setModo('ver'); onMudou() }} />
      )}
    </>
  )
}

// ─── Formulário: criar plano ─────────────────────────────────────────────────

function FormPlano({ conta, onCancelar, onGuardado }: {
  conta: ContaComSaldo; onCancelar: () => void; onGuardado: () => void
}) {
  const { perfil } = useAuth()
  const [descricao, setDescricao] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [moeda, setMoeda] = useState(conta.moeda === 'AED' ? 'EUR' : conta.moeda)
  const [nPrest, setNPrest] = useState('12')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [entrada, setEntrada] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const totalNum = parseNum(valorTotal)
  const entradaNum = parseNum(entrada)
  const nNum = parseInt(nPrest) || 0
  const valorPrestacao = nNum > 0 ? (totalNum - entradaNum) / nNum : 0
  const podeGuardar = totalNum > 0 && nNum > 0 && !!dataInicio && entradaNum <= totalNum

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica um valor total, o nº de prestações e a data de início (a entrada não pode exceder o total).'); return }
    setAGuardar(true)
    const { id, error } = await criarPlano(
      {
        conta_id: conta.id,
        descricao: descricao.trim() || null,
        equipamento_id: null,
        valor_total: totalNum,
        moeda: moeda.trim().toUpperCase(),
        n_prestacoes: nNum,
        periodicidade,
        data_inicio: dataInicio,
        entrada: entradaNum > 0 ? entradaNum : null,
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    if (error || !id) { setErro('Não foi possível criar o plano: ' + (error?.message ?? '')); setAGuardar(false); return }
    const g = await gerarPrestacoes(id)
    setAGuardar(false)
    if (g.error) { setErro('Plano criado, mas as prestações falharam: ' + g.error.message); onGuardado(); return }
    onGuardado()
  }

  return (
    <div style={c.formCard}>
      {erro && <div style={c.erro}>{erro}</div>}
      <label style={c.campo}>
        <span style={c.rotulo}>Descrição <span style={c.opc}>(opcional)</span></span>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: Venda GentleMax — 12 meses" style={c.input} />
      </label>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Valor total</span>
          <input inputMode="decimal" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0,00" style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Moeda</span>
          <select value={moeda} onChange={(e) => setMoeda(e.target.value)} style={c.input}>
            {Array.from(new Set([moeda, ...MOEDAS])).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Entrada <span style={c.opc}>(opcional)</span></span>
          <input inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0,00" style={c.input} />
        </label>
      </div>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Nº de prestações</span>
          <input inputMode="numeric" value={nPrest} onChange={(e) => setNPrest(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Periodicidade</span>
          <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)} style={c.input}>
            {PERIODICIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
          </select>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Data de início</span>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={c.input} />
        </label>
      </div>

      <label style={c.campo}>
        <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 44, resize: 'vertical' }} />
      </label>

      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
          {aGuardar ? 'A gerar...' : 'Criar plano e gerar prestações'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
        {valorPrestacao > 0 && (
          <span style={c.previa}>≈ {formatarMoeda(valorPrestacao, moeda)} por prestação</span>
        )}
      </div>
    </div>
  )
}

// ─── Formulário: registar recebimento numa prestação ─────────────────────────

function FormRecebimento({ conta, pr, onCancelar, onGuardado }: {
  conta: ContaComSaldo; pr: Prestacao; onCancelar: () => void; onGuardado: () => void
}) {
  const [valor, setValor] = useState(String(pr.valor))
  const [data, setData] = useState(hojeISO())
  const [taxa, setTaxa] = useState(pr.moeda === 'EUR' ? '1' : (conta.taxa_contratual ? String(conta.taxa_contratual) : ''))
  const [ref, setRef] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valorNum = parseNum(valor)
  const taxaNum = parseNum(taxa)
  const parcial = valorNum > 0 && valorNum < pr.valor
  const podeGuardar = valorNum > 0 && !!data && taxaNum > 0

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica valor, data e taxa (unidades por 1 EUR) maiores que zero.'); return }
    setAGuardar(true)
    const { error } = await registarRecebimentoPrestacao(pr.id, {
      valor: valorNum,
      moeda: pr.moeda,
      taxa: taxaNum,
      referencia: ref.trim() || null,
      fatura_keyinvoice_id: null,
      data,
    })
    setAGuardar(false)
    if (error) { setErro('Não foi possível registar: ' + error.message); return }
    onGuardado()
  }

  return (
    <div style={c.subForm}>
      {erro && <div style={c.erro}>{erro}</div>}
      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Valor recebido</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Taxa ({pr.moeda}/EUR)</span>
          <input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} disabled={pr.moeda === 'EUR'} style={c.input} />
        </label>
      </div>
      <label style={c.campo}>
        <span style={c.rotulo}>Referência bancária <span style={c.opc}>(opcional)</span></span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} style={c.input} />
      </label>
      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
          {aGuardar ? 'A guardar...' : 'Registar recebimento'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
        {parcial && <span style={c.previa}>Fica <strong>parcial</strong> ({formatarMoeda(pr.valor - valorNum, pr.moeda)} em falta).</span>}
      </div>
    </div>
  )
}

// ─── Formulário: editar prestação ────────────────────────────────────────────

function FormEditarPrestacao({ pr, onCancelar, onGuardado }: {
  pr: Prestacao; onCancelar: () => void; onGuardado: () => void
}) {
  const [valor, setValor] = useState(String(pr.valor))
  const [venc, setVenc] = useState(pr.data_vencimento)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valorNum = parseNum(valor)
  const podeGuardar = valorNum > 0 && !!venc

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica um valor e uma data válidos.'); return }
    setAGuardar(true)
    const { error } = await editarPrestacao(pr.id, { valor: valorNum, data_vencimento: venc })
    setAGuardar(false)
    if (error) { setErro('Não foi possível guardar: ' + error.message); return }
    onGuardado()
  }

  return (
    <div style={c.subForm}>
      {erro && <div style={c.erro}>{erro}</div>}
      <div style={c.grelha2}>
        <label style={c.campo}>
          <span style={c.rotulo}>Valor</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Vencimento</span>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} style={c.input} />
        </label>
      </div>
      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
          {aGuardar ? 'A guardar...' : 'Guardar'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  aviso: { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 },
  estado: { color: 'var(--muted)', padding: 12 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', cursor: 'pointer' },
  cartaoTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  cartaoMeta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  progresso: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)' },
  recebido: { fontSize: 12, color: 'var(--muted)' },
  chevron: { fontSize: 12, color: 'var(--muted)' },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.6fr 1fr 1fr 0.9fr 1fr 1.1fr', gap: 8, padding: '8px 8px', fontSize: 13.5, borderBottom: '1px solid #f3f3f3', alignItems: 'center', minWidth: 640 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  pill: { display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' },
  acaoBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 10px', fontWeight: 700, cursor: 'pointer', fontSize: 12 },
  acaoBtnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 },
  subForm: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, margin: '2px 0 8px' },
  formCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  grelha3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  acoes: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnSecundario: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnPrimarioSm: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecundarioSm: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  previa: { fontSize: 13, color: 'var(--muted)' },
}
