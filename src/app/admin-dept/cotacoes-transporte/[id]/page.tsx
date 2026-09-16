'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { packingListDoPedido, criarPackingListDePedido } from '@/lib/packingList'
import PedidoEditor, { type EstadoEditor } from '@/components/freight/PedidoEditor'
import {
  obterPedido, listarLinhas, guardarLinhas, atualizarPedido, mudarEstadoPedido,
  listarBoxes, listarTemplates, listarGrupos, listarForwarders,
  listarDestinatarios, prepararDestinatariosDe, removerDestinatario,
  criarForwarderRapido, forwardersSugeridosPorDestino, membrosDoGrupo,
  listarCotacoes, criarCotacao, atualizarCotacao, eliminarCotacao, anexarPdfCotacao, urlPdfCotacao, marcarVencedor,
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
      embalagem: l.embalagem, embalagem_desc: l.embalagem_desc, sobreponivel: l.sobreponivel,
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
  const router = useRouter()
  const { isAdministrativo, perfilCarregado, perfil } = useAuth()

  const [pedido, setPedido] = useState<FreightRequest | null>(null)
  const [editor, setEditor] = useState<EstadoEditor | null>(null)
  const [assunto, setAssunto] = useState('')
  const [corpoEditado, setCorpoEditado] = useState<string | null>(null)  // corpo editado à mão (mantém {{saudacao}})
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
  const [editandoCotacao, setEditandoCotacao] = useState<string | null>(null)
  const [ordenarPor, setOrdenarPor] = useState<'valor' | 'prazo'>('valor')
  const [soValidas, setSoValidas] = useState(false)
  // Proposta de agradecimento aos não escolhidos (aparece ao marcar vencedor).
  const [propostaAgrad, setPropostaAgrad] = useState(false)
  const [incluirNaoResp, setIncluirNaoResp] = useState(false)
  const [agradEnviando, setAgradEnviando] = useState(false)

  // Seleção flexível de destinatários (membros do grupo + avulsos + inline).
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [sugeridos, setSugeridos] = useState<Set<string>>(new Set())
  const [procuraFw, setProcuraFw] = useState('')
  const [painelSel, setPainelSel] = useState(true)
  // A seleção é inicializada UMA vez a partir dos destinatários já existentes,
  // para não sobrepor escolhas do utilizador em recargas seguintes.
  const selInit = useRef(false)
  const [fwNovoNome, setFwNovoNome] = useState('')
  const [fwNovoEmail, setFwNovoEmail] = useState('')

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
    // Pré-marca a seleção com quem já é destinatário (só na 1.ª carga).
    if (!selInit.current && dst.length > 0) {
      setSel(new Set(dst.map((d) => d.forwarder_id).filter((x): x is string => !!x)))
      selInit.current = true
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  // Sugestão por destino: transitários que já responderam a pedidos para o país.
  const destinoPais = editor?.pedido.destino_pais ?? null
  useEffect(() => {
    let ativo = true
    forwardersSugeridosPorDestino(destinoPais).then((ids) => { if (ativo) setSugeridos(new Set(ids)) })
    return () => { ativo = false }
  }, [destinoPais])

  const template = useMemo(() => templates.find((t) => t.idioma === (editor?.pedido.idioma ?? 'pt')), [templates, editor])

  // Assunto sugerido (se o campo estiver vazio).
  const assuntoSugerido = useMemo(() => {
    if (!editor || !template) return ''
    return render(template.assunto_template, varsAssunto(editor.pedido))
  }, [editor, template])

  // Corpo BASE: template já com os dados do pedido, mas mantendo {{saudacao}}
  // (substituída por transitário no envio).
  const corpoBase = useMemo(() => {
    if (!editor || !template) return ''
    const vars: Record<string, string> = {
      tipo: tipoTransporteAdjetivo(editor.pedido.tipo_transporte),
      origem: moradaOrigem(editor.pedido),
      destino: moradaDestino(editor.pedido) || (editor.pedido.destino_pais ?? ''),
      datas: datasTexto(editor.pedido, editor.pedido.idioma),
      tabela_volumes: tabelaVolumesEmail(editor.linhas, editor.pedido.idioma),
      extras: extrasTexto(editor.pedido, editor.pedido.idioma),
      prazo_resposta: diasUteisAhead(diasAlerta),
      saudacao: '{{saudacao}}',
    }
    return render(template.corpo_template, vars)
  }, [editor, template, diasAlerta])

  // Corpo em uso = o editado à mão (se houver) ou o base.
  const corpoEfetivo = corpoEditado ?? corpoBase

  // Pré-visualização (usa o 1.º destinatário como exemplo de saudação).
  const preview = useMemo(() => {
    if (!editor || !template) return null
    const exemplo = destinatarios[0]
    const saud = exemplo?.saudacao ?? exemplo?.nome_empresa ?? '[nome do transitário]'
    return {
      assunto: (assunto.trim() || assuntoSugerido),
      corpo: corpoEfetivo.replace(/\{\{\s*saudacao\s*\}\}/g, saud),
    }
  }, [editor, template, destinatarios, assunto, assuntoSugerido, corpoEfetivo])

  const fechado = pedido?.estado === 'fechado' || pedido?.estado === 'cancelado'
  const nomeForwarder = (fid: string | null) => forwarders.find((f) => f.id === fid)?.nome ?? '—'
  const autor = useMemo(() => ({ id: perfil?.id ?? null, nome: perfil?.nome ?? null }), [perfil])

  // Transitários selecionados que ainda não foram enviados (habilita o "Enviar").
  const porEnviar = useMemo(() => {
    const jaEnviados = new Set(destinatarios.filter((d) => d.estado === 'enviado').map((d) => d.forwarder_id))
    return [...sel].filter((fid) => !jaEnviados.has(fid))
  }, [sel, destinatarios])

  // Lista para o seletor: ativos, filtrados por procura, sugeridos (por destino) primeiro.
  const fwPicker = useMemo(() => {
    const q = procuraFw.trim().toLowerCase()
    const base = forwarders.filter((f) => f.ativo && (!q || f.nome.toLowerCase().includes(q) || (f.pais ?? '').toLowerCase().includes(q)))
    return base.sort((a, b) => {
      const sa = sugeridos.has(a.id) ? 0 : 1, sb = sugeridos.has(b.id) ? 0 : 1
      return sa !== sb ? sa - sb : a.nome.localeCompare(b.nome, 'pt')
    })
  }, [forwarders, sugeridos, procuraFw])

  async function guardar(recarregar = true) {
    if (!editor || !pedido) return
    setAGravar(true)
    const { error } = await atualizarPedido(id, { ...editor.pedido, assunto_email: assunto.trim() || null } as Partial<FreightRequest>)
    if (!error) await guardarLinhas(id, editor.linhas)
    setAGravar(false)
    setToast(error ? 'Erro ao guardar: ' + error.message : 'Guardado.')
    if (!error && recarregar) carregar()
  }

  // Escolher um grupo pré-seleciona os seus membros (ativos). Podes depois
  // desmarcar e juntar avulsos.
  async function escolherGrupo(gid: string) {
    if (!editor) return
    setEditor({ ...editor, pedido: { ...editor.pedido, group_id: gid || null } })
    if (!gid) return
    const membros = await membrosDoGrupo(gid)
    const ativosSet = new Set(forwarders.filter((f) => f.ativo).map((f) => f.id))
    setSel(new Set(membros.filter((m) => ativosSet.has(m))))
    setPainelSel(true)
  }
  function toggleSel(fid: string) {
    setSel((s) => { const n = new Set(s); n.has(fid) ? n.delete(fid) : n.add(fid); return n })
  }
  async function criarFwInline() {
    const nome = fwNovoNome.trim()
    const email = fwNovoEmail.trim()
    if (!nome || !email.includes('@')) { setToast('Indica nome e um email válido.'); return }
    const { data, error } = await criarForwarderRapido(nome, [email], editor?.pedido.destino_pais ?? null)
    if (error || !data) { setToast('Erro ao criar: ' + (error?.message ?? '')); return }
    const novo = data as FreightForwarder
    setForwarders((fs) => [...fs, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')))
    setSel((s) => new Set(s).add(novo.id))
    setFwNovoNome(''); setFwNovoEmail(''); setToast(`Transitário "${novo.nome}" criado e selecionado.`)
  }

  // Sincroniza a tabela de destinatários com a seleção atual (checkboxes):
  // cria os que faltam e remove os pendentes desmarcados (os já enviados
  // mantêm-se). Sem toast/recarga — é um passo interno do envio. Devolve erro
  // ou null. (Substitui o antigo passo manual "Preparar destinatários".)
  async function sincronizarDestinatarios(): Promise<string | null> {
    if (!editor) return 'Erro interno.'
    for (const d of destinatarios) {
      if (d.estado === 'pendente' && d.forwarder_id && !sel.has(d.forwarder_id)) await removerDestinatario(d.id)
    }
    const { error } = await prepararDestinatariosDe(id, [...sel])
    return error ?? null
  }

  async function enviar(recipientIds?: string[]) {
    if (!pedido) return
    setEnviando(true)
    // Grava sempre o pedido (incl. remetente) ANTES de qualquer recarga —
    // é isto que impede o remetente de "voltar sozinho" ao default.
    await guardar(false)
    // Envio a todos os selecionados (sem alvo específico): prepara a lista a
    // partir das checkboxes num só passo. Reenvios individuais (com alvo) não
    // mexem na seleção.
    if (!recipientIds) {
      if (sel.size === 0) { setEnviando(false); setToast('Seleciona pelo menos um transitário.'); return }
      const err = await sincronizarDestinatarios()
      if (err) { setEnviando(false); setToast('Erro ao preparar destinatários: ' + err); return }
    }
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setEnviando(false); setToast('Sessão expirada. Volta a entrar.'); return }
    try {
      const r = await fetch('/api/freight/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, recipientIds, assunto: (assunto.trim() || assuntoSugerido), corpo: corpoEfetivo }),
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

  // Abre (ou cria, pré-preenchida) a packing list deste pedido.
  async function abrirPackingList() {
    const existe = await packingListDoPedido(id)
    if (existe) { router.push(`/admin-dept/cotacoes-transporte/packing-lists/${existe.id}`); return }
    const r = await criarPackingListDePedido(id, perfil?.id ?? null)
    if (r.error || !r.id) { setToast('Erro ao criar packing list: ' + (r.error ?? '')); return }
    router.push(`/admin-dept/cotacoes-transporte/packing-lists/${r.id}`)
  }

  async function guardarCotacao() {
    if (novaCotacao.valor == null && !novaCotacao.notas) { setToast('Indica pelo menos o valor.'); return }
    if (!novaCotacao.prazo_transito || !novaCotacao.prazo_transito.trim()) { setToast('Indica o tempo de trânsito.'); return }
    // Editar uma cotação já registada.
    if (editandoCotacao) {
      const fromRec = destinatarios.find((d) => d.id === novaCotacao.recipient_id)
      const { error } = await atualizarCotacao(editandoCotacao, { ...novaCotacao, forwarder_id: fromRec?.forwarder_id ?? novaCotacao.forwarder_id }, autor)
      if (error) { setToast('Erro ao guardar cotação: ' + error.message); return }
      setEditandoCotacao(null); setNovaCotacao(quoteVazia()); setToast('Cotação atualizada.'); carregar()
      return
    }
    const fromRec = destinatarios.find((d) => d.id === novaCotacao.recipient_id)
    const { data, error } = await criarCotacao(id, { ...novaCotacao, forwarder_id: fromRec?.forwarder_id ?? novaCotacao.forwarder_id }, autor)
    if (error || !data) { setToast('Erro ao registar cotação: ' + (error?.message ?? '')); return }
    if (pedido?.estado === 'enviado') await mudarEstadoPedido(id, 'em_rececao')
    setNovaCotacao(quoteVazia()); setToast('Cotação registada.'); carregar()
  }

  function editarCotacao(q: FreightQuote) {
    setNovaCotacao({ forwarder_id: q.forwarder_id, recipient_id: q.recipient_id, valor: q.valor, moeda: q.moeda, prazo_transito: q.prazo_transito, validade: q.validade, notas: q.notas })
    setEditandoCotacao(q.id)
  }
  function cancelarEdicaoCotacao() { setEditandoCotacao(null); setNovaCotacao(quoteVazia()) }

  async function apagarCotacao(q: FreightQuote) {
    const msg = q.escolhido ? 'Esta é a cotação VENCEDORA. Apagar e reabrir o pedido (volta a “em receção”)?' : 'Apagar esta cotação?'
    if (!window.confirm(msg)) return
    const r = await eliminarCotacao(q, autor)
    if (!r.ok) { setToast('Erro ao apagar: ' + (r.motivo ?? '')); return }
    if (editandoCotacao === q.id) cancelarEdicaoCotacao()
    setToast(r.revertido ? 'Cotação vencedora apagada — pedido reaberto.' : 'Cotação apagada.'); carregar()
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
    const r = await marcarVencedor(id, q)
    if (!r.ok) { setToast('Erro: ' + (r.motivo ?? '')); return }
    setToast('Pedido fechado com vencedor.')
    await carregar()
    setIncluirNaoResp(false)
    setPropostaAgrad(true)   // propõe agradecer aos restantes
  }

  // Não escolhidos elegíveis para agradecimento (enviados, não vencedor, ainda
  // não agradecidos). Por omissão só os que responderam (têm cotação).
  const respostasFwIds = useMemo(() => new Set(cotacoes.map((q) => q.forwarder_id).filter(Boolean)), [cotacoes])
  const naoEscolhidos = useMemo(() => destinatarios.filter((d) =>
    d.estado === 'enviado' && d.forwarder_id !== pedido?.vencedor_forwarder_id && !d.agradecido_em,
  ), [destinatarios, pedido])
  const semResposta = useMemo(() => naoEscolhidos.filter((d) => !d.forwarder_id || !respostasFwIds.has(d.forwarder_id)), [naoEscolhidos, respostasFwIds])
  const paraAgradecer = incluirNaoResp ? naoEscolhidos : naoEscolhidos.filter((d) => d.forwarder_id && respostasFwIds.has(d.forwarder_id))

  async function enviarAgradecimentos() {
    setAgradEnviando(true)
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    if (!tok) { setAgradEnviando(false); setToast('Sessão expirada. Volta a entrar.'); return }
    try {
      const r = await fetch('/api/freight/thanks', {
        method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, incluirNaoResponderam: incluirNaoResp }),
      })
      const j = await r.json()
      setToast(!r.ok || !j.ok ? 'Agradecimento: ' + (j.erro ?? `erro ${r.status}`) : `Agradecimento enviado a ${j.enviados} transitário(s).`)
    } catch { setToast('Erro de rede ao enviar agradecimentos.') }
    setAgradEnviando(false); setPropostaAgrad(false); carregar()
  }

  // Estrelas às 3 mais baratas — calculadas POR MOEDA (nunca se comparam moedas
  // diferentes). ⭐⭐⭐ = mais barata, ⭐⭐ = 2.ª, ⭐ = 3.ª.
  const estrelasPorId = useMemo(() => {
    const m = new Map<string, number>()
    const porMoeda = new Map<string, FreightQuote[]>()
    for (const q of cotacoes) {
      if (q.valor == null) continue
      const arr = porMoeda.get(q.moeda) ?? []; arr.push(q); porMoeda.set(q.moeda, arr)
    }
    for (const arr of porMoeda.values()) {
      arr.sort((a, b) => (a.valor! - b.valor!))
      arr.slice(0, 3).forEach((q, i) => m.set(q.id, 3 - i))
    }
    return m
  }, [cotacoes])

  // Aviso quando há cotações em moedas diferentes no mesmo pedido.
  const misturaMoedas = useMemo(
    () => new Set(cotacoes.filter((q) => q.valor != null).map((q) => q.moeda)).size > 1,
    [cotacoes],
  )

  const hojeIso = new Date().toISOString().slice(0, 10)
  const cotacoesVisiveis = useMemo(() => {
    let arr = [...cotacoes]
    if (soValidas) arr = arr.filter((q) => !q.validade || q.validade >= hojeIso)
    if (ordenarPor === 'valor') arr.sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity))
    else arr.sort((a, b) => (a.prazo_transito ?? '').localeCompare(b.prazo_transito ?? ''))
    return arr
  }, [cotacoes, ordenarPor, soValidas, hojeIso])

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
          <button style={c.btnSecundario} onClick={() => guardar()} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Guardar'}</button>
          <button style={c.btnSecundario} onClick={abrirPackingList}>📦 Packing List</button>
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
          <label style={c.campo}><span style={c.rot}>Grupo (pré-seleciona os membros)</span>
            <select style={c.input} value={editor.pedido.group_id ?? ''} onChange={(e) => escolherGrupo(e.target.value)}>
              <option value="">— escolher grupo —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.idioma.toUpperCase()})</option>)}
            </select>
          </label>
          <button style={c.btnSecundario} onClick={() => setPainelSel((v) => !v)} disabled={fechado}>
            {painelSel ? 'Fechar seleção' : `Escolher destinatários (${sel.size})`}
          </button>
          <button style={c.btnPrimario} onClick={() => enviar()} disabled={enviando || fechado || porEnviar.length === 0}>
            {enviando ? 'A enviar…' : `Enviar${porEnviar.length ? ` (${porEnviar.length})` : ''}`}
          </button>
        </div>

        {/* Painel de seleção flexível de destinatários */}
        {painelSel && (
          <div style={c.selPanel}>
            <div style={c.selTopo}>
              <input style={c.selProcura} placeholder="Procurar transitário ou país…" value={procuraFw} onChange={(e) => setProcuraFw(e.target.value)} />
              <span style={c.selCount}>{sel.size} selecionado(s)</span>
            </div>
            <div style={c.selInline}>
              <input style={c.selInlineIn} placeholder="Nome do novo transitário" value={fwNovoNome} onChange={(e) => setFwNovoNome(e.target.value)} />
              <input style={c.selInlineIn} placeholder="email@transitario.com" value={fwNovoEmail} onChange={(e) => setFwNovoEmail(e.target.value)} />
              <button style={c.btnSecundario} onClick={criarFwInline}>+ Novo transitário</button>
            </div>
            <div style={c.selLista}>
              {fwPicker.map((f) => (
                <label key={f.id} style={c.selItem}>
                  <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggleSel(f.id)} />
                  <span style={c.selNome}>{f.nome}</span>
                  {f.pais && <span style={c.selPais}>{f.pais}</span>}
                  {sugeridos.has(f.id) && <span style={c.selSugerido} title="Já respondeu a pedidos para este destino">★ já cotou</span>}
                </label>
              ))}
              {fwPicker.length === 0 && <p style={c.muted}>Nenhum transitário para a procura.</p>}
            </div>
          </div>
        )}

        {/* Pré-visualização com edição livre (aplica-se a este envio; o template não muda) */}
        {preview && (
          <details style={c.preview}>
            <summary style={c.previewSum}>Pré-visualização do email (editável)</summary>
            <div style={c.previewBox}>
              <div style={c.previewAssunto}><strong>Assunto:</strong> {preview.assunto}</div>
              <div style={c.previewNota}>
                Corpo editável para este envio. <code style={c.code}>{'{{saudacao}}'}</code> é substituído pela saudação de cada transitário.
                {corpoEditado != null && <button type="button" style={c.linkBtn} onClick={() => setCorpoEditado(null)}>repor do template</button>}
              </div>
              <textarea style={c.previewEditor} value={corpoEfetivo} onChange={(e) => setCorpoEditado(e.target.value)} />
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
          <input style={c.inputMini} placeholder="Tempo de trânsito *" value={novaCotacao.prazo_transito ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, prazo_transito: e.target.value || null })} />
          <input style={c.inputData} type="date" title="Validade" value={novaCotacao.validade ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, validade: e.target.value || null })} />
          <input style={c.inputMini} placeholder="Notas" value={novaCotacao.notas ?? ''} onChange={(e) => setNovaCotacao({ ...novaCotacao, notas: e.target.value || null })} />
          <button style={c.btnSecundario} onClick={guardarCotacao}>{editandoCotacao ? 'Guardar alteração' : 'Registar'}</button>
          {editandoCotacao && <button style={c.btnSecundario} onClick={cancelarEdicaoCotacao}>Cancelar</button>}
        </div>
        {editandoCotacao && <p style={c.aEditar}>✏️ A editar uma cotação registada.</p>}

        {cotacoes.length === 0 ? (
          <p style={c.muted}>Ainda sem cotações registadas.</p>
        ) : (
          <div style={c.tabelaWrap}>
            {misturaMoedas && <p style={c.aviso}>⚠️ Há cotações em moedas diferentes — as estrelas comparam só dentro da mesma moeda; não se converte.</p>}
            <div style={c.ordenar}>
              Ordenar por:
              <button style={{ ...c.chip, ...(ordenarPor === 'valor' ? c.chipOn : {}) }} onClick={() => setOrdenarPor('valor')}>Valor</button>
              <button style={{ ...c.chip, ...(ordenarPor === 'prazo' ? c.chipOn : {}) }} onClick={() => setOrdenarPor('prazo')}>Prazo</button>
              <label style={c.filtroValida}>
                <input type="checkbox" checked={soValidas} onChange={(e) => setSoValidas(e.target.checked)} /> só dentro de validade
              </label>
            </div>
            <table style={c.tabela}>
              <thead><tr>
                <th style={c.th}>Transitário</th><th style={c.th}>Valor</th><th style={c.th}>Prazo</th>
                <th style={c.th}>Validade</th><th style={c.th}>Notas</th><th style={c.th}>PDF</th><th style={c.th}></th>
              </tr></thead>
              <tbody>
                {cotacoesVisiveis.map((q) => {
                  const estrelas = estrelasPorId.get(q.id) ?? 0
                  const expirada = !!q.validade && q.validade < hojeIso
                  return (
                  <tr key={q.id} style={{ ...c.tr, ...(q.escolhido ? c.trVencedor : {}) }}>
                    <td style={c.td}>{q.escolhido ? '🏆 ' : ''}{estrelas > 0 ? '⭐'.repeat(estrelas) + ' ' : ''}{nomeForwarder(q.forwarder_id)}</td>
                    <td style={c.td}>{q.valor != null ? `${q.valor} ${q.moeda}` : '—'}</td>
                    <td style={c.td}>{q.prazo_transito ?? '—'}</td>
                    <td style={{ ...c.td, ...(expirada ? c.validadeExpirada : {}) }}>{q.validade ?? '—'}{expirada ? ' (expirada)' : ''}</td>
                    <td style={c.td}>{q.notas ?? '—'}</td>
                    <td style={c.td}>
                      {q.pdf_path ? <button style={c.btnMini} title="Abrir PDF" onClick={() => abrirPdf(q.pdf_path!)}>📄</button> : null}
                      <label style={c.btnMini} title="Anexar PDF">📎
                        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) anexarPdf(q, f) }} />
                      </label>
                    </td>
                    <td style={c.tdAcoes}>
                      {!fechado && <button style={c.btnEscolher} onClick={() => escolherVencedor(q)}>Escolher</button>}
                      <button style={c.btnMini} title="Editar" onClick={() => editarCotacao(q)}>✏️</button>
                      <button style={c.btnMini} title="Apagar" onClick={() => apagarCotacao(q)}>🗑️</button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {propostaAgrad && (
        <div style={c.modalFundo} onClick={() => !agradEnviando && setPropostaAgrad(false)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={c.modalTitulo}>Agradecer aos não escolhidos?</h3>
            <p style={c.modalTexto}>
              Enviar um email de agradecimento (cordial, sem mencionar o vencedor nem valores) a <strong>{paraAgradecer.length}</strong> transitário(s).
            </p>
            {semResposta.length > 0 && (
              <label style={c.modalCheck}>
                <input type="checkbox" checked={incluirNaoResp} onChange={(e) => setIncluirNaoResp(e.target.checked)} />
                Incluir os {semResposta.length} que não responderam
              </label>
            )}
            <div style={c.modalAcoes}>
              <button style={c.btnSecundario} onClick={() => setPropostaAgrad(false)} disabled={agradEnviando}>Agora não</button>
              <button style={c.btnPrimario} onClick={enviarAgradecimentos} disabled={agradEnviando || paraAgradecer.length === 0}>
                {agradEnviando ? 'A enviar…' : `Enviar (${paraAgradecer.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

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
  selPanel: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fafafa' },
  selTopo: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  selProcura: { flex: '1 1 220px', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  selCount: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  selInline: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  selInlineIn: { flex: '1 1 180px', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  selLista: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 8, background: '#fff' },
  selItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 4px', borderRadius: 6 },
  selNome: { fontWeight: 500 },
  selPais: { fontSize: 11, color: '#374151', background: '#F3F4F6', borderRadius: 999, padding: '1px 7px' },
  selSugerido: { fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '1px 7px', fontWeight: 700 },
  preview: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, marginBottom: 12, background: '#fafafa' },
  previewSum: { cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  previewBox: { marginTop: 8 },
  previewAssunto: { fontSize: 13, marginBottom: 8 },
  previewCorpo: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 10, margin: 0, overflowX: 'auto' },
  previewNota: { fontSize: 12, color: 'var(--muted)', marginBottom: 6 },
  previewEditor: { width: '100%', minHeight: 260, boxSizing: 'border-box', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: 10 },
  code: { background: '#F3F4F6', borderRadius: 4, padding: '1px 5px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 },
  linkBtn: { background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 6, textDecoration: 'underline' },
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
  ordenar: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 8, flexWrap: 'wrap' },
  chip: { padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 999, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 12 },
  chipOn: { background: '#111827', color: '#fff', borderColor: '#111827' },
  filtroValida: { display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, cursor: 'pointer' },
  aviso: { fontSize: 12.5, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', margin: '0 0 8px' },
  aEditar: { fontSize: 12.5, color: '#1D4ED8', margin: '0 0 8px', fontWeight: 600 },
  validadeExpirada: { color: '#B91C1C' },
  muted: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  btnMini: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', marginRight: 4, fontSize: 14, padding: '0 6px' },
  btnEscolher: { padding: '5px 10px', border: '1px solid #059669', borderRadius: 8, background: '#ECFDF5', color: '#065F46', cursor: 'pointer', font: 'inherit', fontWeight: 700, marginRight: 4 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
  modalFundo: { position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 },
  modal: { background: '#fff', borderRadius: 12, padding: 20, maxWidth: 440, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,.2)' },
  modalTitulo: { fontSize: 17, fontWeight: 700, margin: '0 0 8px' },
  modalTexto: { fontSize: 14, color: '#374151', margin: '0 0 12px', lineHeight: 1.5 },
  modalCheck: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#374151', marginBottom: 14, cursor: 'pointer' },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
}
