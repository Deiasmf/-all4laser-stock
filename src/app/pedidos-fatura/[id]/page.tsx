'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterPedidoFatura, atualizarPedidoFatura, eliminarPedidoFatura,
  alterarEstadoPedido, marcarPagoPedido, carregarDocumentoPedido, removerDocumentoPedido,
  recusarPedidoFatura, cancelarPedidoFatura, pedirFaturaFinal,
  guardarDadosFatura, extrairDadosFatura, enviarPedidoAoCliente,
  registarEnvioWhatsapp, contactoCliente, carregarConfigPedidos,
  type EtapaDoc,
} from '@/lib/pedidosFatura'
import {
  estadoPedidoInfo, tipoPedidoLabel, formatarEuro, formatarData, etapaDocumento, pedidoFechado,
  type PedidoFatura, type PedidoFaturaEstado, type PedidoFaturaConfig,
} from '@/types/pedidoFatura'

const hoje = () => new Date().toISOString().slice(0, 10)

// Link WhatsApp a partir do telefone (normaliza indicativo PT). Igual ao das Leads.
function linkWhatsapp(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  let d = telefone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && !d.startsWith('351')) d = '351' + d
  return d.length < 8 ? null : `https://wa.me/${d}`
}

// Campos do documento na etapa (a pró-forma tem colunas próprias; a fatura fiscal
// usa as colunas canónicas).
function dadosEtapa(p: PedidoFatura, etapa: EtapaDoc) {
  return etapa === 'proforma'
    ? { url: p.proforma_url, caminho: p.proforma_caminho, num: p.proforma_num, data: p.proforma_data, valor: p.proforma_valor }
    : { url: p.documento_url, caminho: p.documento_caminho, num: p.num_fatura, data: p.data_fatura, valor: p.valor_total }
}

// Substitui os marcadores do template com os dados do pedido na etapa certa.
function preencherTemplate(tpl: string, p: PedidoFatura, contacto: string | null, etapa: EtapaDoc): string {
  const d = dadosEtapa(p, etapa)
  return tpl
    .replaceAll('{n_fatura}', d.num ?? '')
    .replaceAll('{nome_cliente}', p.cliente_nome ?? '')
    .replaceAll('{nome_contacto}', contacto || p.cliente_nome || '')
    .replaceAll('{data_fatura}', formatarData(d.data))
    .replaceAll('{valor_total}', d.valor != null ? d.valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : '')
}

export default function DetalhePedidoFaturaPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const { perfil, isFinanceiro, isGestorUtilizadores } = useAuth()
  const [pedido, setPedido] = useState<PedidoFatura | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [cfg, setCfg] = useState<PedidoFaturaConfig | null>(null)
  const [contacto, setContacto] = useState<{ telefone: string | null; contacto_nome: string | null }>({ telefone: null, contacto_nome: null })
  const [preview, setPreview] = useState<{ assunto: string; corpo: string; etapa: EtapaDoc } | null>(null)
  // Sub-pedido "pagamento recebido → pedir fatura final"
  const [ffAberto, setFfAberto] = useState(false)
  const [ffComprovativo, setFfComprovativo] = useState<File | null>(null)
  const [ffNota, setFfNota] = useState('')

  const recarregar = useCallback(async () => {
    const { data } = await obterPedidoFatura(id)
    const ped = (data as PedidoFatura) ?? null
    setPedido(ped)
    setCarregando(false)
    if (ped?.cliente_id) contactoCliente(ped.cliente_id).then(setContacto)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => { carregarConfigPedidos().then(setCfg) }, [])

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

  async function upload(file: File | undefined, etapa: EtapaDoc) {
    if (!file || !pedido) return
    setATrabalhar(true); setMsg(null)
    const r = await carregarDocumentoPedido(id, file, etapa, pedido.tipo)
    if (!r.ok) setMsg('Erro no upload: ' + (r.motivo ?? ''))
    await recarregar()
    setATrabalhar(false)
  }

  async function removerDoc(etapa: EtapaDoc, caminho: string | null) {
    if (!pedido) return
    if (!confirm('Remover o documento anexado?')) return
    setATrabalhar(true); setMsg(null)
    await removerDocumentoPedido(id, caminho, etapa, pedido.tipo)
    await recarregar()
    setATrabalhar(false)
  }

  // Extrai nº/data/valor do PDF anexado na etapa e pré-preenche (a Vanessa confirma).
  async function extrair(etapa: EtapaDoc) {
    setATrabalhar(true); setMsg(null)
    const r = await extrairDadosFatura(id, etapa)
    if (!r.ok || !r.extraido) { setMsg('⚠️ ' + (r.erro ?? 'Não consegui extrair.')); setATrabalhar(false); return }
    const e = r.extraido
    const d = pedido ? dadosEtapa(pedido, etapa) : { num: null, data: null, valor: null }
    await guardarDadosFatura(id, {
      num_fatura: e.num_fatura ?? d.num ?? null,
      data_fatura: e.data_fatura ?? d.data ?? null,
      valor_total: e.valor_total ?? d.valor ?? null,
    }, etapa)
    await recarregar()
    setMsg('✅ Dados extraídos — confirma antes de enviar.')
    setATrabalhar(false)
  }

  // Abre a pré-visualização do email para a etapa ativa (assunto/corpo editáveis).
  function abrirPreview() {
    if (!pedido || !cfg) return
    const etapa = etapaDocumento(pedido)
    setPreview({
      etapa,
      assunto: preencherTemplate(cfg.assunto_template, pedido, contacto.contacto_nome, etapa),
      corpo: preencherTemplate(cfg.corpo_template, pedido, contacto.contacto_nome, etapa),
    })
  }

  async function confirmarEnvio() {
    if (!preview) return
    setATrabalhar(true); setMsg(null)
    const r = await enviarPedidoAoCliente(id, preview.assunto, preview.corpo)
    const eraProforma = preview.etapa === 'proforma'
    setPreview(null)
    setMsg(r.ok
      ? (eraProforma
          ? '✅ Pró-forma enviada ao cliente. Fica a aguardar pagamento.'
          : '✅ Fatura enviada ao cliente (a partir da Vanessa, com CC à Andreia).')
      : '⚠️ ' + (r.erro ?? 'Não foi possível enviar.'))
    await recarregar()
    setATrabalhar(false)
  }

  async function recusar() {
    const motivo = prompt('Motivo da recusa (devolve o pedido ao colega):')
    if (!motivo || !motivo.trim()) return
    setATrabalhar(true); setMsg(null)
    await recusarPedidoFatura(id, motivo.trim())
    await recarregar()
    setATrabalhar(false)
  }

  async function cancelar() {
    const motivo = prompt('Motivo do cancelamento:')
    if (!motivo || !motivo.trim()) return
    setATrabalhar(true); setMsg(null)
    await cancelarPedidoFatura(id, motivo.trim())
    await recarregar()
    setATrabalhar(false)
  }

  // Sub-pedido: pagamento recebido → pedir fatura final (criador + financeiro).
  async function submeterFaturaFinal() {
    setATrabalhar(true); setMsg(null)
    const r = await pedirFaturaFinal(id, { comprovativo: ffComprovativo, nota: ffNota })
    if (!r.ok) { setMsg('⚠️ ' + (r.motivo ?? 'Não foi possível.')); setATrabalhar(false); return }
    setFfAberto(false); setFfComprovativo(null); setFfNota('')
    setMsg('✅ Pagamento registado. A fatura final foi pedida à faturação.')
    await recarregar()
    setATrabalhar(false)
  }

  async function marcarWhatsapp() {
    if (!pedido) return
    await registarEnvioWhatsapp(id, pedido.canais_usados)
    await recarregar()
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
  const podeApagar = isGestorUtilizadores || souCriador
  const isProforma = pedido.tipo === 'pro_forma'
  const estado = pedido.estado
  const atingiuFF = isProforma && ['fatura_pedida', 'fatura_realizada', 'fechado'].includes(estado)
  const fechado = pedidoFechado(pedido)
  const terminal = fechado || estado === 'recusado' || estado === 'cancelado'
  const podePedirFaturaFinal = estado === 'aguarda_pagamento' && (souCriador || isFinanceiro)

  // Secção de documento de uma etapa (pró-forma ou fatura).
  function SeccaoDoc(etapa: EtapaDoc, titulo: string) {
    const p = pedido!
    const d = dadosEtapa(p, etapa)
    // O financeiro pode anexar/editar enquanto a etapa estiver "aberta" (antes de enviada).
    const podeTratar = isFinanceiro && !terminal && (
      etapa === 'proforma'
        ? ['nao_realizado', 'a_realizar', 'realizado'].includes(estado)
        : (isProforma ? ['fatura_pedida', 'fatura_realizada'].includes(estado) : ['nao_realizado', 'a_realizar', 'realizado'].includes(estado))
    )
    return (
      <section style={c.card} key={etapa}>
        <div style={c.cardTitulo}>{titulo}</div>
        <div style={c.docLinha}>
          <span>{etapa === 'proforma' ? 'Pró-forma' : 'Fatura'}</span>
          {d.url
            ? <a href={d.url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : <span style={c.muted}>— por emitir</span>}
        </div>
        {podeTratar ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <label style={c.uploadLabel}>
              {d.url ? 'Substituir documento' : 'Anexar documento emitido'}
              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0], etapa)} disabled={aTrabalhar} />
            </label>
            {d.url && <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => removerDoc(etapa, d.caminho)}>Remover documento</button>}
          </div>
        ) : (
          !d.url && <p style={c.ajuda}>A aguardar emissão pelo departamento financeiro.</p>
        )}

        {/* Dados do documento (nº/data/valor) — pré-extraíveis do PDF */}
        {isFinanceiro && d.url && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={c.rotulo}>Dados {etapa === 'proforma' ? 'da pró-forma' : 'da fatura'}</span>
              {podeTratar && <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => extrair(etapa)}>✨ Extrair do PDF</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 8 }}>
              <label style={c.campoEdit}>
                <span style={c.rotulo}>Nº</span>
                <input key={'nf' + etapa + (d.num ?? '')} defaultValue={d.num ?? ''} disabled={aTrabalhar || !podeTratar}
                  onBlur={(e) => guardarCampo(etapa === 'proforma' ? { proforma_num: e.target.value.trim() || null } : { num_fatura: e.target.value.trim() || null })}
                  style={{ ...c.input, marginTop: 4 }} />
              </label>
              <label style={c.campoEdit}>
                <span style={c.rotulo}>Data</span>
                <input key={'df' + etapa + (d.data ?? '')} type="date" defaultValue={d.data ?? ''} disabled={aTrabalhar || !podeTratar}
                  onBlur={(e) => guardarCampo(etapa === 'proforma' ? { proforma_data: e.target.value || null } : { data_fatura: e.target.value || null })}
                  style={{ ...c.input, marginTop: 4 }} />
              </label>
              <label style={c.campoEdit}>
                <span style={c.rotulo}>Valor total (€)</span>
                <input key={'vt' + etapa + (d.valor ?? '')} type="number" step="0.01" min="0" defaultValue={d.valor ?? ''} disabled={aTrabalhar || !podeTratar}
                  onBlur={(e) => { const t = e.target.value.trim(); const n = t === '' ? null : Number(t.replace(',', '.')); if (n === null || (!isNaN(n) && n >= 0)) guardarCampo(etapa === 'proforma' ? { proforma_valor: n } : { valor_total: n }) }}
                  style={{ ...c.input, marginTop: 4 }} />
              </label>
            </div>
          </div>
        )}
      </section>
    )
  }

  const etapaAtiva = etapaDocumento(pedido)
  const dAtiva = dadosEtapa(pedido, etapaAtiva)
  // Mostrar o botão "enviar" quando o documento da etapa ativa existe e ainda não foi enviado.
  const podeEnviar = !!dAtiva.url && (
    isProforma
      ? (etapaAtiva === 'proforma' ? estado === 'realizado' : estado === 'fatura_realizada')
      : estado === 'realizado'
  )
  const jaEnviado = isProforma
    ? (estado === 'aguarda_pagamento' || estado === 'fechado')
    : estado === 'enviado_cliente'

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

      {/* Documentos — uma secção por etapa */}
      {isProforma ? (
        <>
          {SeccaoDoc('proforma', 'Pró-forma (1ª etapa)')}
          {pedido.proforma_enviada_em && <p style={c.ajudaSolta}>Pró-forma enviada ao cliente em {formatarData(pedido.proforma_enviada_em)}.</p>}
          {atingiuFF && SeccaoDoc('fatura', 'Fatura final (2ª etapa)')}
          {pedido.fatura_ajuste_nota && (
            <p style={c.ajudaSolta}>Ajuste da fatura final: {pedido.fatura_ajuste_nota}</p>
          )}
        </>
      ) : (
        <>
          {SeccaoDoc('fatura', 'Documento emitido')}
          {pedido.enviado_em && <p style={c.ajudaSolta}>Enviado ao cliente em {formatarData(pedido.enviado_em)}.</p>}
        </>
      )}

      {/* Comprovativo de pagamento (se anexado) */}
      {pedido.comprovativo_url && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Comprovativo de pagamento</div>
          <a href={pedido.comprovativo_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver comprovativo ↗</a>
        </section>
      )}

      {/* Aguarda pagamento → pedir fatura final (criador + financeiro) */}
      {podePedirFaturaFinal && (
        <section style={{ ...c.card, borderColor: '#9A3412' }}>
          <div style={c.cardTitulo}>Aguarda pagamento do cliente</div>
          <p style={c.ajuda}>Quando o cliente pagar, regista aqui para pedir a fatura final à faturação — tudo fica no mesmo pedido.</p>
          {!ffAberto ? (
            <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => setFfAberto(true)}>💶 Pagamento recebido → pedir fatura final</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <label style={c.campoEdit}>
                <span style={c.rotulo}>Comprovativo de pagamento (opcional)</span>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setFfComprovativo(e.target.files?.[0] ?? null)} style={{ ...c.input, padding: 8, marginTop: 4 }} />
                {ffComprovativo && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ffComprovativo.name}</span>}
              </label>
              <label style={c.campoEdit}>
                <span style={c.rotulo}>Nota (se a fatura final diferir da pró-forma)</span>
                <textarea value={ffNota} onChange={(e) => setFfNota(e.target.value)} placeholder="ex.: pagamento parcial, valor acordado alterado…" style={{ ...c.input, minHeight: 56, resize: 'vertical', marginTop: 4 }} />
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => { setFfAberto(false); setFfComprovativo(null); setFfNota('') }}>Cancelar</button>
                <button style={c.btnPrimario} disabled={aTrabalhar} onClick={submeterFaturaFinal}>{aTrabalhar ? 'A registar…' : 'Confirmar pagamento e pedir fatura'}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Fluxo (financeiro) */}
      {isFinanceiro && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Financeiro — tratamento</div>

          <div style={c.rotulo}>Estado</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {estado === 'nao_realizado' && (
              <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => mudarEstado('a_realizar')}>Assumir (A realizar)</button>
            )}
            {estado === 'a_realizar' && (
              <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudarEstado('nao_realizado')}>Voltar a Não realizado</button>
            )}
            {podeEnviar && !jaEnviado && (
              <button
                style={c.btnPrimario}
                disabled={aTrabalhar || !pedido.cliente_email}
                onClick={abrirPreview}
                title={pedido.cliente_email ? undefined : 'O cliente não tem email definido'}
              >
                ✉️ {etapaAtiva === 'proforma' ? 'Enviar pró-forma ao cliente' : 'Enviar fatura ao cliente'}
              </button>
            )}
            {jaEnviado && (
              <button style={c.btnGhost} disabled={aTrabalhar} onClick={abrirPreview} title="Reenviar o documento">Reenviar ao cliente</button>
            )}
            {linkWhatsapp(contacto.telefone) && dAtiva.url && (
              <>
                <a href={dAtiva.url} target="_blank" rel="noopener noreferrer" download style={c.btnGhost}>1. Descarregar documento</a>
                <a href={linkWhatsapp(contacto.telefone)!} target="_blank" rel="noopener noreferrer" style={c.btnWhats} onClick={marcarWhatsapp}>
                  2. Abrir WhatsApp
                </a>
              </>
            )}
            {!terminal && estado !== 'nao_realizado' && (
              <button style={c.btnApagar} disabled={aTrabalhar} onClick={recusar}>Recusar</button>
            )}
            {!terminal && (
              <button style={c.btnApagar} disabled={aTrabalhar} onClick={cancelar}>Cancelar</button>
            )}
          </div>
          {linkWhatsapp(contacto.telefone) && (
            <p style={c.ajuda}>WhatsApp: o link não anexa ficheiros — descarrega o documento (1) e anexa-o na conversa depois de abrir o WhatsApp (2).</p>
          )}
          {(estado === 'recusado' || estado === 'cancelado') && pedido.motivo_recusa && (
            <p style={{ ...c.ajuda, color: '#B91C1C' }}>{estado === 'recusado' ? 'Recusado' : 'Cancelado'}: {pedido.motivo_recusa}</p>
          )}
          {estado === 'aguarda_pagamento' && (
            <p style={c.ajuda}>Pró-forma enviada. A aguardar pagamento do cliente — fora da tua fila de trabalho até o pagamento entrar.</p>
          )}
          {!dAtiva.url && !terminal && estado !== 'aguarda_pagamento' && (
            <p style={c.ajuda}>Anexa o documento emitido para o poder enviar ao cliente.</p>
          )}
          {dAtiva.url && !pedido.cliente_email && (
            <p style={c.ajuda}>Para enviar ao cliente é preciso um email. Pede a quem criou o pedido, ou adiciona na ficha do cliente.</p>
          )}

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

      {/* Pré-visualização editável do email (antes de enviar) */}
      {preview && (
        <div style={c.backdrop} onClick={() => setPreview(null)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>{preview.etapa === 'proforma' ? 'Enviar pró-forma ao cliente' : 'Enviar fatura ao cliente'}</h2>
              <button onClick={() => setPreview(null)} style={c.fechar}>✕</button>
            </div>
            <p style={c.ajuda}>De: Vanessa · CC: Andreia · Para: {pedido.cliente_email}. A assinatura da Vanessa é acrescentada automaticamente.</p>
            <label style={{ ...c.campoEdit, marginTop: 10 }}>
              <span style={c.rotulo}>Assunto</span>
              <input value={preview.assunto} onChange={(e) => setPreview({ ...preview, assunto: e.target.value })} style={{ ...c.input, marginTop: 4 }} />
            </label>
            <label style={{ ...c.campoEdit, marginTop: 10 }}>
              <span style={c.rotulo}>Mensagem</span>
              <textarea value={preview.corpo} onChange={(e) => setPreview({ ...preview, corpo: e.target.value })} style={{ ...c.input, minHeight: 180, resize: 'vertical', marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={c.btnGhost} onClick={() => setPreview(null)} disabled={aTrabalhar}>Cancelar</button>
              <button style={c.btnPrimario} onClick={confirmarEnvio} disabled={aTrabalhar}>{aTrabalhar ? 'A enviar…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
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
  ajudaSolta: { color: 'var(--muted)', fontSize: 13, margin: '-4px 2px 0' },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  campoEdit: { display: 'flex', flexDirection: 'column' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  uploadLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnWhats: { background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14, textDecoration: 'none' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: 'var(--surface, #fff)', borderRadius: 12, padding: 20, width: 560, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 999, padding: '6px 14px 6px 8px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 6, minWidth: 110 },
  toggleKnob: { width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', display: 'inline-block' },
  toggleTexto: { marginLeft: 4 },
}
