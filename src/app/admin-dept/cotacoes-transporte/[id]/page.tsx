'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import PedidoEditor, { type EstadoEditor } from '@/components/freight/PedidoEditor'
import {
  obterPedido, listarLinhas, guardarLinhas, atualizarPedido, mudarEstadoPedido,
  listarBoxes, listarTemplates, listarGrupos, listarForwarders,
  listarDestinatarios, prepararDestinatarios, removerDestinatario,
  listarCotacoes, criarCotacao, eliminarCotacao, anexarPdfCotacao, urlPdfCotacao, marcarVencedor,
  obterSettings, type QuoteInput,
} from '@/lib/freight'
import {
  render, varsAssunto, moradaOrigem, moradaDestino, datasTexto, extrasTexto, tabelaVolumesEmail,
  tipoTransporteAdjetivo, estadoPedidoInfo, tipoTransporteLabel, destinoCurto,
  type FreightRequest, type StandardBox, type FreightEmailTemplate, type ForwarderGroup,
  type FreightForwarder, type FreightRecipient, type FreightQuote, type CargoLine, type EstadoPedido,
} from '@/types/freight'

function pedidoParaEditor(p: FreightRequest, linhas: CargoLine[]): EstadoEditor {
  return {
    pedido: {
      tipo_transporte: p.tipo_transporte,
      origem_nome: p.origem_nome, origem_morada: p.origem_morada, origem_cp: p.origem_cp,
      origem_localidade: p.origem_localidade, origem_pais: p.origem_pais,
      destino_pais: p.destino_pais, destino_cidade_cp: p.destino_cidade_cp, destino_morada: p.destino_morada,
      data_recolha: p.data_recolha, flexibilidade: p.flexibilidade,
      extra_paletizar: p.extra_paletizar, extra_seguro: p.extra_seguro,
      extra_plataforma: p.extra_plataforma, extra_urgente: p.extra_urgente,
      observacoes: p.observacoes, idioma: p.idioma, assunto_email: p.assunto_email,
      remetente: p.remetente, group_id: p.group_id,
    },
    linhas: linhas.map((l) => ({
      box_id: l.box_id, descricao: l.descricao, ext_c: l.ext_c, ext_l: l.ext_l, ext_a: l.ext_a,
      quantidade: l.quantidade, peso_volume: l.peso_volume,
    })),
  }
}

function diasUteisAhead(n: number): string {
  const d = new Date(); let r = Math.max(1, n)
  while (r > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) r-- }
  return d.toISOString().slice(0, 10)
}

const quoteVazia = (): QuoteInput => ({ forwarder_id: null, recipient_id: null, valor: null, moeda: 'EUR', prazo_transito: null, validade: null, notas: null })

export default function DetalhePedidoPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdministrativo, perfilCarregado } = useAuth()

  const [pedido, setPedido] = useState<FreightRequest | null>(null)
  const [editor, setEditor] = useState<EstadoEditor | null>(null)
  const [assunto, setAssunto] = useState('')
  const [boxes, setBoxes] = useState<StandardBox[]>([])
  const [templates, setTemplates] = useState<FreightEmailTemplate[]>([])
  const [grupos, setGrupos] = useState<ForwarderGroup[]>([])
  const [forwarders, setForwarders] = useState<FreightForwarder[]>([])
  const [destinatarios, setDestinatarios] = useState<FreightRecipient[]>([])
  const [cotacoes, setCotacoes] = useState<FreightQuote[]>([])
  const [diasAlerta, setDiasAlerta] = useState(3)
  const [remetentes, setRemetentes] = useState<string[]>([])

  const [aGravar, setAGravar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [novaCotacao, setNovaCotacao] = useState<QuoteInput>(quoteVazia)
  const [ordenarPor, setOrdenarPor] = useState<'valor' | 'prazo'>('valor')

  const carregar = useCallback(async () => {
    const [{ data: p }, ls, bx, tpl, gp, fw, dst, cot, st] = await Promise.all([
      obterPedido(id), listarLinhas(id), listarBoxes(true), listarTemplates(),
      listarGrupos(true), listarForwarders(), listarDestinatarios(id), listarCotacoes(id), obterSettings(),
    ])
    if (!p) { setPedido(null); return }
    const ped = p as FreightRequest
    setPedido(ped)
    setEditor(pedidoParaEditor(ped, ls))
    setAssunto(ped.assunto_email ?? '')
    setBoxes(bx); setTemplates(tpl); setGrupos(gp); setForwarders(fw)
    setDestinatarios(dst); setCotacoes(cot)
    if (st) { setDiasAlerta(st.dias_uteis_alerta); setRemetentes(st.remetentes ?? []) }
  }, [id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const template = useMemo(() => templates.find((t) => t.idioma === (editor?.pedido.idioma ?? 'pt')), [templates, editor])

  // Assunto sugerido (se o campo estiver vazio).
  const assuntoSugerido = useMemo(() => {
    if (!editor || !template) return ''
    return render(template.assunto_template, varsAssunto(editor.pedido))
  }, [editor, template])

  // Pré-visualização (usa o 1.º destinatário como exemplo de saudação).
  const preview = useMemo(() => {
    if (!editor || !template) return null
    const exemplo = destinatarios[0]
    const vars: Record<string, string> = {
      tipo: tipoTransporteAdjetivo(editor.pedido.tipo_transporte),
      origem: moradaOrigem(editor.pedido),
      destino: moradaDestino(editor.pedido) || (editor.pedido.destino_pais ?? ''),
      datas: datasTexto(editor.pedido, editor.pedido.idioma),
      tabela_volumes: tabelaVolumesEmail(editor.linhas, editor.pedido.idioma),
      extras: extrasTexto(editor.pedido, editor.pedido.idioma),
      prazo_resposta: diasUteisAhead(diasAlerta),
      saudacao: exemplo?.saudacao ?? exemplo?.nome_empresa ?? '[nome do transitário]',
    }
    return {
      assunto: (assunto.trim() || assuntoSugerido),
      corpo: render(template.corpo_template, vars),
    }
  }, [editor, template, destinatarios, assunto, assuntoSugerido, diasAlerta])

  const fechado = pedido?.estado === 'fechado' || pedido?.estado === 'cancelado'
  const nomeForwarder = (fid: string | null) => forwarders.find((f) => f.id === fid)?.nome ?? '—'

  async function guardar() {
    if (!editor || !pedido) return
    setAGravar(true)
    const { error } = await atualizarPedido(id, { ...editor.pedido, assunto_email: assunto.trim() || null } as Partial<FreightRequest>)
    if (!error) await guardarLinhas(id, editor.linhas)
    setAGravar(false)
    setToast(error ? 'Erro ao guardar: ' + error.message : 'Guardado.')
    if (!error) carregar()
  }

  async function preparar() {
    if (!editor?.pedido.group_id) { setToast('Escolhe primeiro um grupo de transitários.'); return }
    // garante que o grupo escolhido fica gravado no pedido
    await atualizarPedido(id, { group_id: editor.pedido.group_id })
    const { criados, error } = await prepararDestinatarios(id, editor.pedido.group_id)
    if (error) { setToast(error); return }
    setToast(criados > 0 ? `${criados} destinatário(s) preparado(s).` : 'Sem novos destinatários a acrescentar.')
    carregar()
  }

  async function enviar(recipientIds?: string[]) {
    if (!pedido) return
    setEnviando(true)
    // Garante que as últimas alterações (assunto/carga) estão gravadas antes de enviar.
    await guardar()
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setEnviando(false); setToast('Sessão expirada. Volta a entrar.'); return }
    try {
      const r = await fetch('/api/freight/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, recipientIds }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) setToast('Envio: ' + (j.erro ?? `erro ${r.status}`))
      else setToast(`Enviados: ${j.enviados}${j.falhados ? ` · falhados: ${j.falhados}` : ''}.`)
    } catch {
      setToast('Erro de rede ao enviar.')
    }
    setEnviando(false)
    carregar()
  }

  async function mudarEstado(e: EstadoPedido) {
    await mudarEstadoPedido(id, e); carregar()
  }

  async function guardarCotacao() {
    if (novaCotacao.valor == null && !novaCotacao.notas) { setToast('Indica pelo menos o valor.'); return }
    const fromRec = destinatarios.find((d) => d.id === novaCotacao.recipient_id)
    const { data, error } = await criarCotacao(id, { ...novaCotacao, forwarder_id: fromRec?.forwarder_id ?? novaCotacao.forwarder_id })
    if (error || !data) { setToast('Erro ao registar cotação: ' + (error?.message ?? '')); return }
    if (pedido?.estado === 'enviado') await mudarEstadoPedido(id, 'em_rececao')
    setNovaCotacao(quoteVazia()); setToast('Cotação registada.'); carregar()
  }

  async function anexarPdf(quote: FreightQuote, file: File) {
    const r = await anexarPdfCotacao(quote.id, id, file)
    setToast(r.ok ? 'PDF anexado.' : 'Erro ao anexar: ' + (r.motivo ?? '')); if (r.ok) carregar()
  }
  async function abrirPdf(path: string) {
    const url = await urlPdfCotacao(path); if (url) window.open(url, '_blank', 'noopener'); else setToast('Sem PDF.')
  }
  async function escolherVencedor(q: FreightQuote) {
    if (!window.confirm(`Marcar ${nomeForwarder(q.forwarder_id)} como vencedor e fechar o pedido?`)) return
    const r = await marcarVencedor(id, q); setToast(r.ok ? 'Pedido fechado com vencedor.' : 'Erro: ' + (r.motivo ?? '')); if (r.ok) carregar()
  }

  const cotacoesOrdenadas = useMemo(() => {
    const arr = [...cotacoes]
    if (ordenarPor === 'valor') arr.sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity))
    else arr.sort((a, b) => (a.prazo_transito ?? '').localeCompare(b.prazo_transito ?? ''))
    return arr
  }, [cotacoes, ordenarPor])

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>
  if (!pedido || !editor) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  const est = estadoPedidoInfo(pedido.estado)
  const enviados = destinatarios.filter((d) => d.estado === 'enviado').length

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
          <h1 style={c.titulo}>{pedido.numero ?? 'Pedido'} <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span></h1>
          <p style={c.sub}>{tipoTransporteLabel(pedido.tipo_transporte)} · {destinoCurto(pedido)} · {enviados}/{destinatarios.length} enviados · {cotacoes.length} cotações</p>
        </div>
        <div style={c.topoAcoes}>
          <button style={c.btnSecundario} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Guardar'}</button>
          {pedido.estado !== 'cancelado' && pedido.estado !== 'fechado' && (
            <button style={c.btnSecundario} onClick={() => mudarEstado('cancelado')}>Cancelar pedido</button>
          )}
          {fechado && <button style={c.btnSecundario} onClick={() => mudarEstado('em_rececao')}>Reabrir</button>}
        </div>
      </div>

      {/* Editor do pedido */}
      <section style={c.card}>
        <PedidoEditor value={editor} onChange={setEditor} boxes={boxes} />
        <label style={{ ...c.campo, marginTop: 12 }}><span style={c.rot}>Assunto do email</span>
          <input style={c.input} value={assunto} placeholder={assuntoSugerido} onChange={(e) => setAssunto(e.target.value)} />
        </label>
      </section>

      {/* Grupo + envio */}
      <section style={c.card}>
        <h2 style={c.h2}>Envio</h2>
        <div style={c.linhaEnvio}>
          <label style={c.campo}><span style={c.rot}>Enviar de</span>
            <select style={c.input} value={editor.pedido.remetente ?? ''} onChange={(e) => setEditor({ ...editor, pedido: { ...editor.pedido, remetente: e.target.value || null } })}>
              {editor.pedido.remetente && !remetentes.includes(editor.pedido.remetente) && (
                <option value={editor.pedido.remetente}>{editor.pedido.remetente}</option>
              )}
              {remetentes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={c.campo}><span style={c.rot}>Grupo de transitários</span>
            <select style={c.input} value={editor.pedido.group_id ?? ''} onChange={(e) => setEditor({ ...editor, pedido: { ...editor.pedido, group_id: e.target.value || null } })}>
              <option value="">— escolher grupo —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.idioma.toUpperCase()})</option>)}
            </select>
          </label>
          <button style={c.btnSecundario} onClick={preparar} disabled={fechado}>Preparar destinatários</button>
          <button style={c.btnPrimario} onClick={() => enviar()} disabled={enviando || fechado || destinatarios.every((d) => d.estado === 'enviado')}>
            {enviando ? 'A enviar…' : 'Enviar a pendentes'}
          </button>
        </div>

        {/* Pré-visualização */}
        {preview && (
          <details style={c.preview}>
            <summary style={c.previewSum}>Pré-visualização do email</summary>
            <div style={c.previewBox}>
              <div style={c.previewAssunto}><strong>Assunto:</strong> {preview.assunto}</div>
              <pre style={c.previewCorpo}>{preview.corpo}</pre>
            </div>
          </details>
        )}

        {/* Destinatários */}
        {destinatarios.length > 0 && (
          <div style={c.tabelaWrap}>
            <table style={c.tabela}>
              <thead><tr>
                <th style={c.th}>Transitário</th><th style={c.th}>Emails</th><th style={c.th}>Estado</th>
                <th style={c.th}>Tent.</th><th style={c.th}>Enviado</th><th style={c.th}></th>
              </tr></thead>
              <tbody>
                {destinatarios.map((d) => (
                  <tr key={d.id} style={c.tr}>
                    <td style={c.td}>{d.nome_empresa}</td>
                    <td style={c.td}>{d.emails.join(', ')}</td>
                    <td style={c.td}>
                      <span style={{ ...c.pillEstado, ...(d.estado === 'enviado' ? c.pillOk : d.estado === 'falhou' ? c.pillErro : c.pillPend) }}>
                        {d.estado === 'enviado' ? 'Enviado' : d.estado === 'falhou' ? 'Falhou' : 'Pendente'}
                      </span>
                      {d.estado === 'falhou' && d.erro && <div style={c.erroMini} title={d.erro}>{d.erro.slice(0, 60)}</div>}
                    </td>
                    <td style={c.td}>{d.tentativas}</td>
                    <td style={c.td}>{d.enviado_em ? d.enviado_em.slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td style={c.tdAcoes}>
                      {d.estado !== 'enviado' && !fechado && <button style={c.btnMini} title="Enviar / repetir" onClick={() => enviar([d.id])} disabled={enviando}>↻</button>}
                      {d.estado !== 'enviado' && <button style={c.btnMini} title="Remover" onClick={async () => { await removerDestinatario(d.id); carregar() }}>🗑️</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cotações recebidas + comparador */}
      <section style={c.card}>
        <h2 style={c.h2}>Cotações recebidas</h2>

        {/* Registo manual */}
        <div style={c.formCotacao}>
          <select style={c.inputMini} value={novaCotacao.recipient_id ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, recipient_id: e.target.value || null })}>
            <option value="">Transitário…</option>
            {destinatarios.map((d) => <option key={d.id} value={d.id}>{d.nome_empresa}</option>)}
          </select>
          <input style={c.inputNum} type="number" placeholder="Valor" value={novaCotacao.valor ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, valor: e.target.value === '' ? null : Number(e.target.value) })} />
          <input style={c.inputMoeda} value={novaCotacao.moeda} onChange={(e) => setNovaCotacao({ ...novaCotacao, moeda: e.target.value })} />
          <input style={c.inputMini} placeholder="Prazo de trânsito" value={novaCotacao.prazo_transito ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, prazo_transito: e.target.value || null })} />
          <input style={c.inputData} type="date" title="Validade" value={novaCotacao.validade ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, validade: e.target.value || null })} />
          <input style={c.inputMini} placeholder="Notas" value={novaCotacao.notas ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, notas: e.target.value || null })} />
          <button style={c.btnSecundario} onClick={guardarCotacao}>Registar</button>
        </div>

        {cotacoes.length === 0 ? (
          <p style={c.muted}>Ainda sem cotações registadas.</p>
        ) : (
          <div style={c.tabelaWrap}>
            <div style={c.ordenar}>
              Ordenar por:
              <button style={{ ...c.chip, ...(ordenarPor === 'valor' ? c.chipOn : {}) }} onClick={() => setOrdenarPor('valor')}>Valor</button>
              <button style={{ ...c.chip, ...(ordenarPor === 'prazo' ? c.chipOn : {}) }} onClick={() => setOrdenarPor('prazo')}>Prazo</button>
            </div>
            <table style={c.tabela}>
              <thead><tr>
                <th style={c.th}>Transitário</th><th style={c.th}>Valor</th><th style={c.th}>Prazo</th>
                <th style={c.th}>Validade</th><th style={c.th}>Notas</th><th style={c.th}>PDF</th><th style={c.th}></th>
              </tr></thead>
              <tbody>
                {cotacoesOrdenadas.map((q) => (
                  <tr key={q.id} style={{ ...c.tr, ...(q.escolhido ? c.trVencedor : {}) }}>
                    <td style={c.td}>{q.escolhido ? '🏆 ' : ''}{nomeForwarder(q.forwarder_id)}</td>
                    <td style={c.td}>{q.valor != null ? `${q.valor} ${q.moeda}` : '—'}</td>
                    <td style={c.td}>{q.prazo_transito ?? '—'}</td>
                    <td style={c.td}>{q.validade ?? '—'}</td>
                    <td style={c.td}>{q.notas ?? '—'}</td>
                    <td style={c.td}>
                      {q.pdf_path ? <button style={c.btnMini} title="Abrir PDF" onClick={() => abrirPdf(q.pdf_path!)}>📄</button> : null}
                      <label style={c.btnMini} title="Anexar PDF">📎
                        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) anexarPdf(q, f) }} />
                      </label>
                    </td>
                    <td style={c.tdAcoes}>
                      {!fechado && <button style={c.btnEscolher} onClick={() => escolherVencedor(q)}>Escolher</button>}
                      <button style={c.btnMini} title="Apagar" onClick={async () => { if (window.confirm('Apagar cotação?')) { await eliminarCotacao(q.id); carregar() } }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  topoAcoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  card: { border: '1px solid #eee', borderRadius: 12, padding: 16, background: '#fff' },
  h2: { fontSize: 16, fontWeight: 700, margin: '0 0 12px' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  linhaEnvio: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 },
  preview: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginBottom: 12, background: '#fafafa' },
  previewSum: { cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  previewBox: { marginTop: 8 },
  previewAssunto: { fontSize: 13, marginBottom: 8 },
  previewCorpo: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10, margin: 0, overflowX: 'auto' },
  tabelaWrap: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trVencedor: { background: '#D1FAE5' },
  td: { padding: '8px', verticalAlign: 'top' },
  tdAcoes: { padding: '8px', whiteSpace: 'nowrap' },
  pillEstado: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  pillOk: { background: '#D1FAE5', color: '#065F46' },
  pillErro: { background: '#FEE2E2', color: '#B91C1C' },
  pillPend: { background: '#F3F4F6', color: '#374151' },
  erroMini: { fontSize: 11, color: '#B91C1C', marginTop: 2 },
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700 },
  formCotacao: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' },
  inputMini: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', minWidth: 120 },
  inputNum: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: 90 },
  inputMoeda: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: 60 },
  inputData: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff' },
  ordenar: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 8 },
  chip: { padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 999, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12 },
  chipOn: { background: '#111827', color: '#fff', borderColor: '#111827' },
  muted: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnMini: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', marginRight: 4, fontSize: 14, padding: '0 6px' },
  btnEscolher: { padding: '5px 10px', border: '1px solid #059669', borderRadius: 8, background: '#ECFDF5', color: '#065F46', cursor: 'pointer', font: 'inherit', fontWeight: 700, marginRight: 4 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
