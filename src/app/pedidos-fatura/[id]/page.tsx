'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterPedidoFatura, atualizarPedidoFatura, eliminarPedidoFatura,
  alterarEstadoPedido, marcarPagoPedido, carregarDocumentoPedido, removerDocumentoPedido,
} from '@/lib/pedidosFatura'
import {
  estadoPedidoInfo, tipoPedidoLabel, formatarEuro, formatarData,
  type PedidoFatura, type PedidoFaturaEstado,
} from '@/types/pedidoFatura'

const hoje = () => new Date().toISOString().slice(0, 10)

export default function DetalhePedidoFaturaPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const { perfil, isAdmin, isFinanceiro } = useAuth()
  const [pedido, setPedido] = useState<PedidoFatura | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    const { data } = await obterPedidoFatura(id)
    setPedido((data as PedidoFatura) ?? null)
    setCarregando(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  const utilizador = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
  const souCriador = !!pedido && pedido.criado_por === perfil?.id
  const podeEditarCampos = souCriador && pedido?.estado === 'nao_realizado'

  async function mudarEstado(estado: PedidoFaturaEstado) {
    setATrabalhar(true); setMsg(null)
    const { error } = await alterarEstadoPedido(id, estado, utilizador)
    if (error) { setMsg('Não foi possível mudar o estado: ' + error.message); setATrabalhar(false); return }
    await recarregar()
    setATrabalhar(false)
  }

  async function guardarCampo(patch: Partial<PedidoFatura>) {
    setATrabalhar(true); setMsg(null)
    await atualizarPedidoFatura(id, patch)
    await recarregar()
    setATrabalhar(false)
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setATrabalhar(true); setMsg(null)
    const r = await carregarDocumentoPedido(id, file)
    if (!r.ok) setMsg('Erro no upload: ' + (r.motivo ?? ''))
    await recarregar()
    setATrabalhar(false)
  }

  async function removerDoc() {
    if (!pedido) return
    if (!confirm('Remover o documento anexado? O pedido volta a "A realizar".')) return
    setATrabalhar(true); setMsg(null)
    await removerDocumentoPedido(id, pedido.documento_caminho)
    await recarregar()
    setATrabalhar(false)
  }

  async function enviarAoCliente() {
    setATrabalhar(true); setMsg(null)
    try {
      const r = await fetch('/api/pedidos-fatura/enviar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const j = await r.json()
      setMsg(j.ok ? '✅ Documento enviado ao cliente.' : '⚠️ ' + (j.erro ?? 'Não foi possível enviar.'))
    } catch {
      setMsg('⚠️ Erro de rede ao enviar o documento.')
    }
    await recarregar()
    setATrabalhar(false)
  }

  async function togglePago() {
    if (!pedido) return
    setATrabalhar(true); setMsg(null)
    await marcarPagoPedido(id, !pedido.pago, !pedido.pago ? hoje() : null)
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarDataPagamento(data: string) {
    setATrabalhar(true)
    await marcarPagoPedido(id, true, data || hoje())
    await recarregar()
    setATrabalhar(false)
  }

  async function apagarPedido() {
    if (!confirm('Apagar este pedido? Esta ação não pode ser revertida.')) return
    setATrabalhar(true); setMsg(null)
    const { error } = await eliminarPedidoFatura(id)
    if (error) { setMsg('Não foi possível apagar: ' + error.message); setATrabalhar(false); return }
    router.push('/pedidos-fatura')
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!pedido) return <main style={c.page}><p style={c.muted}>Pedido não encontrado.</p></main>

  const i = estadoPedidoInfo(pedido.estado)
  const podeApagar = isAdmin || souCriador

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{pedido.numero ?? 'Pedido'}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>{i.label}</span>
            <span style={c.tipoTag}>{tipoPedidoLabel(pedido.tipo)}</span>
            {pedido.pago && <span style={c.pagoTag}>💶 Pago</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {podeApagar && <button style={c.btnApagar} disabled={aTrabalhar} onClick={apagarPedido}>🗑 Apagar</button>}
          <Link href="/pedidos-fatura" style={c.voltar}>← Pedidos</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Dados do pedido */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Pedido</div>
        <Linha rotulo="Cliente" valor={pedido.cliente_nome} />
        {podeEditarCampos ? (
          <label style={c.campoEdit}>
            <span style={c.rotulo}>Email do cliente</span>
            <input
              key={'email' + (pedido.cliente_email ?? '')}
              type="email"
              defaultValue={pedido.cliente_email ?? ''}
              onBlur={(e) => guardarCampo({ cliente_email: e.target.value.trim() || null })}
              disabled={aTrabalhar}
              style={{ ...c.input, marginTop: 4 }}
            />
          </label>
        ) : (
          <Linha rotulo="Email do cliente" valor={pedido.cliente_email} />
        )}
        {podeEditarCampos ? (
          <>
            <label style={c.campoEdit}>
              <span style={c.rotulo}>Descrição</span>
              <textarea
                key={'desc' + pedido.descricao}
                defaultValue={pedido.descricao}
                onBlur={(e) => e.target.value.trim() && guardarCampo({ descricao: e.target.value.trim() })}
                disabled={aTrabalhar}
                style={{ ...c.input, minHeight: 56, resize: 'vertical', marginTop: 4 }}
              />
            </label>
            <label style={c.campoEdit}>
              <span style={c.rotulo}>Valor (€)</span>
              <input
                key={'valor' + (pedido.valor ?? '')}
                type="number"
                step="0.01"
                min="0"
                defaultValue={pedido.valor ?? ''}
                onBlur={(e) => {
                  const t = e.target.value.trim()
                  const n = t === '' ? null : Number(t.replace(',', '.'))
                  if (n === null || (!isNaN(n) && n >= 0)) guardarCampo({ valor: n })
                }}
                disabled={aTrabalhar}
                style={{ ...c.input, marginTop: 4, maxWidth: 200 }}
              />
            </label>
          </>
        ) : (
          <>
            <Linha rotulo="Descrição" valor={pedido.descricao} />
            <Linha rotulo="Valor" valor={formatarEuro(pedido.valor)} />
          </>
        )}
        <Linha rotulo="Pedido por" valor={pedido.criado_por_nome} />
        <Linha rotulo="Data do pedido" valor={formatarData(pedido.created_at)} />
        {pedido.responsavel_nome && <Linha rotulo="Tratado por (financeiro)" valor={pedido.responsavel_nome} />}
        {pedido.notas && <Linha rotulo="Notas" valor={pedido.notas} />}
      </section>

      {/* Documento emitido */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Documento emitido</div>
        <div style={c.docLinha}>
          <span>{tipoPedidoLabel(pedido.tipo)}</span>
          {pedido.documento_url
            ? <a href={pedido.documento_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : <span style={c.muted}>— por emitir</span>}
        </div>
        {pedido.enviado_em && <p style={c.ajuda}>Enviado ao cliente em {formatarData(pedido.enviado_em)}.</p>}
        {isFinanceiro ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <label style={c.uploadLabel}>
              {pedido.documento_url ? 'Substituir documento' : 'Anexar documento emitido'}
              <input type="file" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} disabled={aTrabalhar} />
            </label>
            {pedido.documento_url && (
              <button style={c.btnGhost} disabled={aTrabalhar} onClick={removerDoc}>Remover documento</button>
            )}
          </div>
        ) : (
          !pedido.documento_url && <p style={c.ajuda}>A aguardar emissão pelo departamento financeiro.</p>
        )}
      </section>

      {/* Fluxo (financeiro) */}
      {isFinanceiro && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Financeiro — tratamento</div>

          <div style={c.rotulo}>Estado</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {pedido.estado === 'nao_realizado' && (
              <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => mudarEstado('a_realizar')}>Assumir (A realizar)</button>
            )}
            {pedido.estado === 'a_realizar' && (
              <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudarEstado('nao_realizado')}>Voltar a Não realizado</button>
            )}
            {pedido.documento_url && pedido.estado !== 'enviado_cliente' && (
              <button
                style={c.btnPrimario}
                disabled={aTrabalhar || !pedido.cliente_email}
                onClick={enviarAoCliente}
                title={pedido.cliente_email ? undefined : 'O cliente não tem email definido'}
              >
                ✉️ Enviar ao cliente
              </button>
            )}
            {pedido.estado === 'enviado_cliente' && (
              <button style={c.btnGhost} disabled={aTrabalhar} onClick={enviarAoCliente} title="Reenviar o documento">Reenviar ao cliente</button>
            )}
          </div>
          {pedido.documento_url && !pedido.cliente_email && (
            <p style={c.ajuda}>Para enviar ao cliente é preciso um email. Pede a quem criou o pedido, ou adiciona na ficha do cliente.</p>
          )}
          {!pedido.documento_url && <p style={c.ajuda}>Anexa o documento emitido para o marcar como “Realizado” e poder enviar ao cliente.</p>}

          {/* Pagamento */}
          <div style={{ marginTop: 16 }}>
            <div style={c.rotulo}>Pagamento</div>
            <button
              onClick={togglePago}
              disabled={aTrabalhar}
              style={{ ...c.toggle, background: pedido.pago ? '#15803D' : '#DC2626' }}
              aria-pressed={pedido.pago}
            >
              <span style={{ ...c.toggleKnob, transform: pedido.pago ? 'translateX(26px)' : 'translateX(0)' }} />
              <span style={c.toggleTexto}>{pedido.pago ? 'Pago' : 'Não pago'}</span>
            </button>
            {pedido.pago && (
              <div style={{ marginTop: 10 }}>
                <label style={c.rotulo}>Data de pagamento</label>
                <input type="date" value={pedido.data_pagamento ?? hoje()} onChange={(e) => mudarDataPagamento(e.target.value)} style={{ ...c.input, maxWidth: 200, display: 'block', marginTop: 4 }} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pagamento (leitura para não-financeiro) */}
      {!isFinanceiro && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Pagamento</div>
          <Linha rotulo="Estado" valor={pedido.pago ? 'Pago' : 'Por pagar'} />
          {pedido.pago && <Linha rotulo="Data de pagamento" valor={formatarData(pedido.data_pagamento)} />}
        </section>
      )}
    </main>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div style={c.linhaInfo}>
      <span style={c.linhaRotulo}>{rotulo}</span>
      <span style={{ whiteSpace: 'pre-wrap' }}>{valor || '—'}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  tipoTag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', background: 'var(--accent-bg, #eef1f6)', color: 'var(--primary-dark, #3730A3)' },
  pagoTag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', background: '#D1FAE5', color: '#065F46' },
  btnApagar: { background: 'transparent', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  linhaInfo: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, fontSize: 14 },
  linhaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  docLinha: { display: 'flex', justifyContent: 'space-between', fontSize: 14 },
  link: { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  ajuda: { color: 'var(--muted)', fontSize: 13, margin: 0 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  campoEdit: { display: 'flex', flexDirection: 'column' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  uploadLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 999, padding: '6px 14px 6px 8px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 6, minWidth: 110 },
  toggleKnob: { width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', display: 'inline-block' },
  toggleTexto: { marginLeft: 4 },
}
