'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  obterPedido, listarItens, listarCotacoes, listarFornecedores,
  criarCotacao, selecionarCotacao, aprovarEncomendar, registarRececao, marcarUrgente,
} from '@/lib/compras'
import { ESTADO_PEDIDO_CONFIG, type PedidoCompra, type PedidoItem, type Cotacao, type Fornecedor } from '@/types/compras'

function eur(v: number | null) {
  return v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export default function DetalhePedidoPage() {
  const { perfil, session } = useAuth()
  const id = useParams().id as string
  const [pedido, setPedido] = useState<PedidoCompra | null>(null)
  const [itens, setItens] = useState<PedidoItem[]>([])
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)

  // form cotação
  const [forn, setForn] = useState(''); const [fornOutro, setFornOutro] = useState('')
  const [valor, setValor] = useState(''); const [prazo, setPrazo] = useState(''); const [cotNotas, setCotNotas] = useState('')
  // receção
  const [rececaoAberta, setRececaoAberta] = useState(false)
  const [recebido, setRecebido] = useState<Record<string, string>>({})

  async function carregar() {
    const { data } = await obterPedido(id)
    setPedido((data as PedidoCompra) ?? null)
    setItens(await listarItens(id))
    setCotacoes(await listarCotacoes(id))
    setCarregando(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    listarFornecedores(true).then(setFornecedores)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (carregando) return <p style={{ color: 'var(--a4l-text-light)', padding: 24 }}>A carregar...</p>
  if (!pedido) return <div style={{ maxWidth: 800, margin: '0 auto' }}><Link href="/compras" style={voltar}>← Pedidos de Compra</Link><p style={{ padding: 24 }}>Pedido não encontrado.</p></div>

  const cfg = ESTADO_PEDIDO_CONFIG[pedido.estado]
  const autor = { id: session?.user.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }
  const selecionada = cotacoes.find((c) => c.selecionado)
  const podeReceber = pedido.estado === 'encomendado' || pedido.estado === 'recebido_parcial'

  async function adicionarCotacao() {
    const f = (forn === '__outro__' ? fornOutro : forn).trim()
    if (!f) { alert('Indica o fornecedor.'); return }
    await criarCotacao(id, {
      fornecedor: f,
      valor_total: valor.trim() === '' ? null : Number(valor),
      prazo_entrega_dias: prazo.trim() === '' ? null : Number(prazo),
      notas: cotNotas.trim() || null,
    }, autor)
    setForn(''); setFornOutro(''); setValor(''); setPrazo(''); setCotNotas('')
    carregar()
  }

  async function confirmarRececao() {
    const map: Record<string, number> = {}
    for (const it of itens) map[it.id] = Math.max(0, Number(recebido[it.id] ?? it.quantidade_recebida) || 0)
    await registarRececao(id, itens, map)
    setRececaoAberta(false)
    carregar()
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Link href="/compras" style={voltar}>← Pedidos de Compra</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--a4l-text-dark)' }}>{pedido.numero}</h1>
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 999, padding: '3px 12px' }}>{cfg.label}</span>
        {pedido.urgente && <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>🔴 Urgente</span>}
        {!pedido.urgente && <button className="a4l-btn-ghost" style={{ marginLeft: 'auto' }} onClick={async () => { await marcarUrgente(id); carregar() }}>Marcar como urgente</button>}
      </div>

      {/* Itens */}
      <div className="a4l-card" style={{ marginBottom: 14 }}>
        <h2 style={h2}>Itens ({itens.length})</h2>
        {itens.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '0.5px solid var(--a4l-border)', fontSize: 14 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--a4l-text-dark)' }}>{it.peca_nome}</div>
              {it.notas && <div style={{ fontSize: 12.5, color: 'var(--a4l-text-light)' }}>{it.notas}</div>}
            </div>
            <div style={{ whiteSpace: 'nowrap', color: 'var(--a4l-text-mid)' }}>
              {it.quantidade_recebida > 0 ? `${it.quantidade_recebida}/${it.quantidade}` : `qt. ${it.quantidade}`}
            </div>
          </div>
        ))}
        {pedido.notas && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--a4l-text-mid)', whiteSpace: 'pre-wrap' }}>{pedido.notas}</p>}
      </div>

      {/* Cotações */}
      <div className="a4l-card" style={{ marginBottom: 14 }}>
        <h2 style={h2}>Cotações de Fornecedores</h2>
        {cotacoes.length === 0 ? (
          <p style={{ color: 'var(--a4l-text-light)', fontSize: 13 }}>Sem cotações.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {cotacoes.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: c.selecionado ? '1px solid var(--a4l-3)' : '0.5px solid var(--a4l-border)', background: c.selecionado ? '#F7F6FF' : undefined }}>
                <div style={{ fontSize: 14 }}>
                  <div style={{ fontWeight: 700, color: 'var(--a4l-text-dark)' }}>{c.fornecedor}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--a4l-text-light)' }}>
                    {eur(c.valor_total)}{c.prazo_entrega_dias != null ? ` · ${c.prazo_entrega_dias} dias` : ''}{c.notas ? ` · ${c.notas}` : ''}
                  </div>
                </div>
                {c.selecionado
                  ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--a4l-3)' }}>✓ Selecionada</span>
                  : <button className="a4l-btn-ghost" onClick={async () => { await selecionarCotacao(id, c.id); carregar() }}>Selecionar</button>}
              </div>
            ))}
          </div>
        )}

        {/* Adicionar cotação */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '0.5px solid var(--a4l-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--a4l-text-mid)' }}>Adicionar cotação</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="a4l-input" style={{ flex: 1, minWidth: 150 }} value={forn} onChange={(e) => setForn(e.target.value)}>
              <option value="">Fornecedor...</option>
              {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              <option value="__outro__">Outro...</option>
            </select>
            <input className="a4l-input" style={{ width: 110 }} placeholder="Valor €" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            <input className="a4l-input" style={{ width: 100 }} placeholder="Prazo (d)" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
          {forn === '__outro__' && <input className="a4l-input" placeholder="Nome do fornecedor" value={fornOutro} onChange={(e) => setFornOutro(e.target.value)} />}
          <input className="a4l-input" placeholder="Notas (opcional)" value={cotNotas} onChange={(e) => setCotNotas(e.target.value)} />
          <button className="a4l-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={adicionarCotacao}>+ Adicionar cotação</button>
        </div>

        {selecionada && pedido.estado !== 'encomendado' && !podeReceber && (
          <button className="a4l-btn" style={{ marginTop: 12 }} onClick={async () => { await aprovarEncomendar(id); carregar() }}>
            Aprovar e Encomendar ({selecionada.fornecedor})
          </button>
        )}
      </div>

      {/* Receção */}
      {(podeReceber || pedido.estado === 'recebido_total') && (
        <div className="a4l-card">
          <h2 style={h2}>Receção</h2>
          {pedido.estado === 'recebido_total'
            ? <p style={{ color: '#00A87A', fontWeight: 700, fontSize: 14 }}>✓ Tudo recebido.</p>
            : <button className="a4l-btn" onClick={() => { setRecebido(Object.fromEntries(itens.map((i) => [i.id, String(i.quantidade_recebida || i.quantidade)]))); setRececaoAberta(true) }}>Registar Receção</button>}
        </div>
      )}

      {rececaoAberta && (
        <div onClick={() => setRececaoAberta(false)} style={backdrop}>
          <div onClick={(e) => e.stopPropagation()} className="a4l-card" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 12 }}>Registar Receção</h2>
            {itens.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontSize: 14, color: 'var(--a4l-text-mid)', flex: 1 }}>{it.peca_nome} <span style={{ color: 'var(--a4l-text-light)' }}>(de {it.quantidade})</span></span>
                <input className="a4l-input" style={{ width: 80 }} type="number" min={0} max={it.quantidade} value={recebido[it.id] ?? ''} onChange={(e) => setRecebido((r) => ({ ...r, [it.id]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="a4l-btn-ghost" onClick={() => setRececaoAberta(false)}>Cancelar</button>
              <button className="a4l-btn" onClick={confirmarRececao}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const voltar: React.CSSProperties = { color: 'var(--a4l-text-light)', textDecoration: 'none', fontSize: 14 }
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--a4l-text-dark)', marginBottom: 8 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(13,11,43,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
