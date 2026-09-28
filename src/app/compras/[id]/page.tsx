'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import PecaAutocomplete from '@/components/PecaAutocomplete'
import {
  obterPedido, listarItens, listarCotacoes, listarFornecedores,
  criarCotacao, selecionarCotacao, aprovarEncomendar, registarRececao, marcarUrgente,
  marcarCotacaoPaga, pedirPagamentoCotacao,
  atualizarPedido, adicionarItemPedido, atualizarItemPedido, eliminarItemPedido,
  listarFotosPedido, carregarFotoPedido, apagarFotoPedido, type PedidoFoto, type ItemInput,
} from '@/lib/compras'
import { ESTADO_PEDIDO_CONFIG, DESTINATARIOS_PAGAMENTO, type PedidoCompra, type PedidoItem, type Cotacao, type Fornecedor } from '@/types/compras'

function eur(v: number | null) {
  return v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function dataCurta(s: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT')
}

// created_at (ISO) → yyyy-mm-dd para o <input type="date">.
function dataInput(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type LinhaEdit = { id?: string; peca_id: string | null; peca_nome: string; quantidade: string; notas: string }

// Assunto + corpo (editáveis) do pedido de pagamento de uma cotação.
function templatePagamento(pedidoNumero: string, c: Cotacao) {
  const assunto = `Pedido de pagamento — ${c.fornecedor ?? 'fornecedor'} (${pedidoNumero})`
  const corpo = [
    'Olá,', '',
    `Pedido de pagamento referente à cotação do fornecedor ${c.fornecedor ?? '—'}:`, '',
    `• Pedido: ${pedidoNumero}`,
    `• Fornecedor: ${c.fornecedor ?? '—'}`,
    `• Valor: ${eur(c.valor_total)}`,
    ...(c.prazo_entrega_dias != null ? [`• Prazo de entrega: ${c.prazo_entrega_dias} dias`] : []),
    ...(c.notas ? [`• Notas: ${c.notas}`] : []),
    '', 'Por favor procedam ao pagamento e marquem como pago na plataforma.', '', 'Obrigada.',
  ].join('\n')
  return { assunto, corpo }
}

export default function DetalhePedidoPage() {
  const { perfil, session } = useAuth()
  const id = useParams().id as string
  const [pedido, setPedido] = useState<PedidoCompra | null>(null)
  const [itens, setItens] = useState<PedidoItem[]>([])
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  // fotos
  const [fotos, setFotos] = useState<PedidoFoto[]>([])
  const [fotoOcupado, setFotoOcupado] = useState(false)
  // edição do pedido
  const [editando, setEditando] = useState(false)
  const [urgenteEd, setUrgenteEd] = useState(false)
  const [dataEd, setDataEd] = useState('')
  const [notasEd, setNotasEd] = useState('')
  const [itensEd, setItensEd] = useState<LinhaEdit[]>([])
  const [aGuardarEd, setAGuardarEd] = useState(false)

  // form cotação
  const [forn, setForn] = useState(''); const [fornOutro, setFornOutro] = useState('')
  const [valor, setValor] = useState(''); const [prazo, setPrazo] = useState(''); const [cotNotas, setCotNotas] = useState('')
  // receção
  const [rececaoAberta, setRececaoAberta] = useState(false)
  const [recebido, setRecebido] = useState<Record<string, string>>({})
  // pedido de pagamento (email editável)
  const [pagCot, setPagCot] = useState<Cotacao | null>(null)
  const [pagDest, setPagDest] = useState('')
  const [pagAssunto, setPagAssunto] = useState('')
  const [pagCorpo, setPagCorpo] = useState('')
  const [pagEnviando, setPagEnviando] = useState(false)
  const [pagErro, setPagErro] = useState<string | null>(null)

  async function carregar() {
    const { data } = await obterPedido(id)
    setPedido((data as PedidoCompra) ?? null)
    setItens(await listarItens(id))
    setCotacoes(await listarCotacoes(id))
    setFotos(await listarFotosPedido(id))
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

  function abrirPedidoPagamento(c: Cotacao) {
    const t = templatePagamento(pedido?.numero ?? '', c)
    setPagCot(c)
    setPagDest((c.destinatarios && c.destinatarios.length ? c.destinatarios : DESTINATARIOS_PAGAMENTO).join(', '))
    setPagAssunto(t.assunto)
    setPagCorpo(t.corpo)
    setPagErro(null)
  }

  async function enviarPedidoPagamento() {
    if (!pagCot) return
    const destinatarios = pagDest.split(',').map((s) => s.trim()).filter(Boolean)
    if (destinatarios.length === 0) { setPagErro('Indica pelo menos um destinatário.'); return }
    setPagEnviando(true); setPagErro(null)
    const r = await pedirPagamentoCotacao({ cotacaoId: pagCot.id, destinatarios, assunto: pagAssunto, corpo: pagCorpo })
    setPagEnviando(false)
    if (!r.ok) { setPagErro(r.erro ?? 'Falha ao enviar.'); return }
    setPagCot(null)
    carregar()
  }

  async function marcarPago(c: Cotacao) {
    if (!window.confirm('Marcar esta cotação como paga? Pára os lembretes.')) return
    await marcarCotacaoPaga(c.id, autor)
    carregar()
  }

  function abrirEdicao() {
    if (!pedido) return
    setUrgenteEd(pedido.urgente)
    setNotasEd(pedido.notas ?? '')
    setDataEd(dataInput(pedido.created_at))
    setItensEd(itens.map((it) => ({ id: it.id, peca_id: it.peca_id, peca_nome: it.peca_nome ?? '', quantidade: String(it.quantidade), notas: it.notas ?? '' })))
    setEditando(true)
  }

  function setLinhaEd(i: number, patch: Partial<LinhaEdit>) {
    setItensEd((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function guardarEdicao() {
    if (!pedido) return
    const linhas = itensEd.filter((l) => l.peca_nome.trim())
    if (linhas.length === 0) { alert('O pedido tem de ter pelo menos um item.'); return }
    setAGuardarEd(true)

    // Dados do pedido (data às 12h para não trocar de dia por fuso horário).
    const createdISO = dataEd ? new Date(dataEd + 'T12:00:00').toISOString() : undefined
    await atualizarPedido(id, { urgente: urgenteEd, notas: notasEd.trim() || null, ...(createdISO ? { created_at: createdISO } : {}) })

    // Itens: apaga os removidos, atualiza os alterados, cria os novos.
    const originais = new Map(itens.map((it) => [it.id, it]))
    const idsMantidos = new Set(itensEd.filter((l) => l.id && l.peca_nome.trim()).map((l) => l.id))
    for (const it of itens) if (!idsMantidos.has(it.id)) await eliminarItemPedido(it.id)
    for (const l of linhas) {
      const nome = l.peca_nome.trim()
      const qtd = Math.max(1, Number(l.quantidade) || 1)
      const notas = l.notas.trim() || null
      if (l.id) {
        const o = originais.get(l.id)
        if (o && (o.peca_nome !== nome || o.peca_id !== l.peca_id || o.quantidade !== qtd || (o.notas ?? null) !== notas)) {
          await atualizarItemPedido(l.id, { peca_id: l.peca_id, peca_nome: nome, quantidade: qtd, notas })
        }
      } else {
        const novo: ItemInput = { peca_id: l.peca_id, peca_nome: nome, quantidade: qtd, notas }
        await adicionarItemPedido(id, novo)
      }
    }

    setAGuardarEd(false)
    setEditando(false)
    carregar()
  }

  async function adicionarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setFotoOcupado(true)
    for (const f of Array.from(files)) {
      const r = await carregarFotoPedido(id, f)
      if (!r.ok) { alert('Não foi possível carregar a foto: ' + (r.motivo ?? '')); break }
    }
    setFotos(await listarFotosPedido(id))
    setFotoOcupado(false)
  }

  async function removerFoto(foto: PedidoFoto) {
    if (!window.confirm('Apagar esta foto?')) return
    setFotoOcupado(true)
    await apagarFotoPedido(foto.id, foto.caminho)
    setFotos(await listarFotosPedido(id))
    setFotoOcupado(false)
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
        {!editando && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!pedido.urgente && <button className="a4l-btn-ghost" onClick={async () => { await marcarUrgente(id); carregar() }}>Marcar como urgente</button>}
            <button className="a4l-btn-ghost" onClick={abrirEdicao}>✎ Editar</button>
          </div>
        )}
      </div>

      {/* Itens (leitura) ou formulário de edição */}
      {editando ? (
        <div className="a4l-card" style={{ marginBottom: 14 }}>
          <h2 style={h2}>Editar pedido</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={lbl}>Data do pedido</span>
                <input className="a4l-input" type="date" value={dataEd} onChange={(e) => setDataEd(e.target.value)} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, cursor: 'pointer', fontWeight: 700, color: urgenteEd ? '#DC2626' : 'var(--a4l-text-dark)' }}>
                <input type="checkbox" checked={urgenteEd} onChange={(e) => setUrgenteEd(e.target.checked)} />
                {urgenteEd ? '🔴 Urgente' : 'Marcar urgente'}
              </label>
            </div>

            <div>
              <span style={lbl}>Itens a comprar</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                {itensEd.map((l, i) => (
                  <div key={l.id ?? `novo-${i}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <PecaAutocomplete
                        valor={l.peca_nome}
                        onTexto={(v) => setLinhaEd(i, { peca_nome: v, peca_id: null })}
                        onEscolher={(p) => setLinhaEd(i, { peca_nome: p.nome, peca_id: p.id })}
                      />
                    </div>
                    <input className="a4l-input" style={{ width: 70 }} type="number" min={1} value={l.quantidade} onChange={(e) => setLinhaEd(i, { quantidade: e.target.value })} />
                    <input className="a4l-input" style={{ flex: 1, minWidth: 140 }} placeholder="Notas (opcional)" value={l.notas} onChange={(e) => setLinhaEd(i, { notas: e.target.value })} />
                    <button type="button" onClick={() => setItensEd((a) => a.filter((_, idx) => idx !== i))} className="a4l-btn-ghost" style={{ padding: '8px 12px' }} title="Remover item">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setItensEd((a) => [...a, { peca_id: null, peca_nome: '', quantidade: '1', notas: '' }])} className="a4l-btn-ghost" style={{ marginTop: 12 }}>+ Adicionar item</button>
            </div>

            <div>
              <span style={lbl}>Notas gerais</span>
              <textarea className="a4l-input" rows={3} value={notasEd} onChange={(e) => setNotasEd(e.target.value)} style={{ marginTop: 6 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="a4l-btn" disabled={aGuardarEd} onClick={guardarEdicao}>{aGuardarEd ? 'A guardar...' : 'Guardar alterações'}</button>
              <button className="a4l-btn-ghost" disabled={aGuardarEd} onClick={() => setEditando(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="a4l-card" style={{ marginBottom: 14 }}>
          <h2 style={h2}>Itens ({itens.length}) · {dataCurta(pedido.created_at)}</h2>
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
      )}

      {/* Fotos */}
      <div className="a4l-card" style={{ marginBottom: 14 }}>
        <h2 style={h2}>Fotos ({fotos.length})</h2>
        {fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 12 }}>
            {fotos.map((foto) => (
              <div key={foto.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '0.5px solid var(--a4l-border)' }}>
                <a href={foto.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="Foto do pedido" style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                </a>
                <button
                  onClick={() => removerFoto(foto)}
                  disabled={fotoOcupado}
                  title="Apagar foto"
                  style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 15, lineHeight: '24px', cursor: 'pointer', padding: 0 }}
                >×</button>
              </div>
            ))}
          </div>
        )}
        <label className="a4l-btn-ghost" style={{ alignSelf: 'flex-start', cursor: fotoOcupado ? 'default' : 'pointer', opacity: fotoOcupado ? 0.6 : 1 }}>
          {fotoOcupado ? 'A carregar...' : '+ Adicionar foto'}
          <input type="file" accept="image/*" multiple disabled={fotoOcupado} onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        </label>
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
const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--a4l-text-mid)', marginBottom: 4 }
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(13,11,43,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
