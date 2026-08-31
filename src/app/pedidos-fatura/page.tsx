'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarPedidosFatura, criarPedidoFatura, listarClientesPedido,
  type ClientePedidoOpc,
} from '@/lib/pedidosFatura'
import {
  ESTADOS_PEDIDO, estadoPedidoInfo, TIPOS_PEDIDO, tipoPedidoLabel, formatarEuro,
  type PedidoFatura, type PedidoFaturaTipo,
} from '@/types/pedidoFatura'

function EstadoBadge({ estado }: { estado: string }) {
  const i = estadoPedidoInfo(estado)
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>
      {i.label}
    </span>
  )
}

export default function PedidosFaturaPage() {
  const router = useRouter()
  const { perfil, isFinanceiro } = useAuth()
  const [pedidos, setPedidos] = useState<PedidoFatura[]>([])
  const [clientes, setClientes] = useState<ClientePedidoOpc[]>([])
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [pesquisa, setPesquisa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [soMeus, setSoMeus] = useState(false)

  // Formulário de novo pedido
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<PedidoFaturaTipo>('fatura')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteEmail, setClienteEmail] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setPedidos(await listarPedidosFatura())
    setCarregando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    listarClientesPedido().then(setClientes)
  }, [])

  // Ao escrever o nome do cliente, tenta casar com um cliente existente para
  // pré-preencher o email e o id (autofill). Continua a permitir texto livre.
  function mudarClienteNome(v: string) {
    setClienteNome(v)
    const match = clientes.find((c) => c.nome.toLowerCase() === v.trim().toLowerCase())
    if (match) {
      setClienteId(match.id)
      if (match.email && !clienteEmail) setClienteEmail(match.email)
    } else {
      setClienteId(null)
    }
  }

  function limparForm() {
    setTipo('fatura'); setClienteNome(''); setClienteId(null); setClienteEmail('')
    setDescricao(''); setValor(''); setNotas(''); setErro(null)
  }

  async function submeter() {
    setErro(null)
    if (!clienteNome.trim()) { setErro('Indica o cliente.'); return }
    if (!descricao.trim()) { setErro('Indica a descrição.'); return }
    const valorNum = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    if (valorNum !== null && (isNaN(valorNum) || valorNum < 0)) { setErro('Valor inválido.'); return }

    setAGravar(true)
    const { data, error } = await criarPedidoFatura(
      {
        tipo,
        cliente_id: clienteId,
        cliente_nome: clienteNome.trim(),
        cliente_email: clienteEmail.trim() || null,
        descricao: descricao.trim(),
        valor: valorNum,
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
    )
    setAGravar(false)
    if (error || !data) { setErro('Não foi possível criar o pedido: ' + (error?.message ?? '')); return }
    limparForm()
    setAberto(false)
    await carregar()
  }

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return pedidos
      .filter((p) => !fEstado || p.estado === fEstado)
      .filter((p) => !soMeus || p.criado_por === perfil?.id)
      .filter((p) =>
        !q ||
        (p.numero ?? '').toLowerCase().includes(q) ||
        p.cliente_nome.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        (p.criado_por_nome ?? '').toLowerCase().includes(q)
      )
  }, [pedidos, pesquisa, fEstado, soMeus, perfil?.id])

  const resumo = useMemo(() => {
    let porRealizar = 0, aRealizar = 0, porPagar = 0
    for (const p of pedidos) {
      if (p.estado === 'nao_realizado') porRealizar++
      if (p.estado === 'a_realizar') aRealizar++
      if ((p.estado === 'realizado' || p.estado === 'enviado_cliente') && !p.pago) porPagar++
    }
    return { porRealizar, aRealizar, porPagar }
  }, [pedidos])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>🧾 Pedidos de Fatura</h1>
          <p style={c.sub}>Pede uma fatura ou pró-forma ao departamento financeiro e acompanha o estado.</p>
        </div>
        <button style={c.btnPrimario} onClick={() => { setAberto((a) => !a); setErro(null) }}>
          {aberto ? 'Fechar' : '+ Novo pedido'}
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={c.cards}>
        <div style={{ ...c.card, borderTop: '3px solid #991B1B' }}>
          <div style={c.cardNum}>{resumo.porRealizar}</div>
          <div style={c.cardLbl}>Por realizar</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #1E40AF' }}>
          <div style={c.cardNum}>{resumo.aRealizar}</div>
          <div style={c.cardLbl}>A realizar</div>
        </div>
        <div style={{ ...c.card, borderTop: '3px solid #B45309' }}>
          <div style={c.cardNum}>{resumo.porPagar}</div>
          <div style={c.cardLbl}>Por confirmar pagamento</div>
        </div>
      </div>

      {/* Formulário de novo pedido */}
      {aberto && (
        <section style={c.form}>
          <div style={c.formGrelha}>
            <label style={c.campo}>
              <span style={c.rotulo}>Tipo de documento</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as PedidoFaturaTipo)} style={c.input}>
                {TIPOS_PEDIDO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Cliente *</span>
              <input
                list="clientes-pedido"
                value={clienteNome}
                onChange={(e) => mudarClienteNome(e.target.value)}
                placeholder="Nome do cliente"
                style={c.input}
              />
              <datalist id="clientes-pedido">
                {clientes.map((cl) => <option key={cl.id} value={cl.nome} />)}
              </datalist>
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Email do cliente (para envio)</span>
              <input
                type="email"
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
                placeholder="opcional"
                style={c.input}
              />
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Valor (€)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="opcional"
                style={c.input}
              />
            </label>
          </div>
          <label style={{ ...c.campo, marginTop: 10 }}>
            <span style={c.rotulo}>Descrição *</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que deve constar no documento (serviço/equipamento, referência, etc.)"
              style={{ ...c.input, minHeight: 64, resize: 'vertical' }}
            />
          </label>
          <label style={{ ...c.campo, marginTop: 10 }}>
            <span style={c.rotulo}>Notas para o financeiro (opcional)</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Indicações adicionais"
              style={{ ...c.input, minHeight: 48, resize: 'vertical' }}
            />
          </label>
          {erro && <div style={c.erro}>{erro}</div>}
          <div style={c.formAcoes}>
            <button style={c.btnGhost} onClick={() => { limparForm(); setAberto(false) }} disabled={aGravar}>Cancelar</button>
            <button style={c.btnPrimario} onClick={submeter} disabled={aGravar}>{aGravar ? 'A enviar...' : 'Enviar pedido'}</button>
          </div>
        </section>
      )}

      {/* Filtros */}
      <div style={c.filtros}>
        <input
          placeholder="Procurar por nº, cliente, descrição..."
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          style={{ ...c.input, flex: 1, minWidth: 200 }}
        />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={c.input}>
          <option value="">Todos os estados</option>
          {ESTADOS_PEDIDO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <label style={c.check}>
          <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />
          Só os meus
        </label>
      </div>

      <div style={c.resumoLinha}>
        <span>{filtrados.length} pedido(s)</span>
        {isFinanceiro && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Financeiro — podes emitir e enviar ao cliente</span>}
      </div>

      {/* Lista */}
      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : filtrados.length === 0 ? (
        <p style={c.estado}>Sem pedidos.</p>
      ) : (
        <div style={c.lista}>
          {filtrados.map((p) => (
            <div key={p.id} style={c.cartao} onClick={() => router.push(`/pedidos-fatura/${p.id}`)}>
              <div style={c.cartaoTopo}>
                <span style={c.numero}>{p.numero ?? '—'}</span>
                <span style={c.tipoTag}>{tipoPedidoLabel(p.tipo)}</span>
                <span style={{ flex: 1 }} />
                {p.pago && <span style={c.pagoTag}>💶 Pago</span>}
                <EstadoBadge estado={p.estado} />
              </div>
              <div style={c.cartaoCliente}>{p.cliente_nome}</div>
              <div style={c.cartaoDesc}>{p.descricao}</div>
              <div style={c.meta}>
                {p.valor != null && <span><strong>{formatarEuro(p.valor)}</strong></span>}
                <span>· Pedido por {p.criado_por_nome ?? '—'}</span>
                <span>· {(p.created_at ?? '').slice(0, 10)}</span>
                {p.documento_url && <span style={c.docTag}>📎 documento</span>}
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
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 2 },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' },
  cardNum: { fontSize: 30, fontWeight: 800, color: 'var(--primary)' },
  cardLbl: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 },
  formGrelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15, font: 'inherit', boxSizing: 'border-box', width: '100%' },
  erro: { background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginTop: 10 },
  formAcoes: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--muted)' },
  resumoLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap', gap: 8, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 },
  cartaoTopo: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  numero: { fontWeight: 800, color: 'var(--primary)', fontSize: 14 },
  tipoTag: { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: 'var(--accent-bg, #eef1f6)', color: 'var(--primary-dark, #3730A3)' },
  pagoTag: { fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#D1FAE5', color: '#065F46' },
  cartaoCliente: { fontWeight: 700, fontSize: 15 },
  cartaoDesc: { fontSize: 13.5, color: 'var(--foreground)' },
  meta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6 },
  docTag: { fontWeight: 700, color: 'var(--primary-dark, #3730A3)' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
}
