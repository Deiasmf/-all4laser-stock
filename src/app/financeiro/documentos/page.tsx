'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  listarDocumentos, anexarFicheiro, removerFicheiro, urlAssinado,
  totaisDocumentos, exportarDocumentosCsv, descarregarCsv, temDetalheApi,
  FILTROS_VAZIOS, type FiltrosDoc,
} from '@/lib/documentosFinanceiros'
import DetalheFaturaModal from './DetalheFaturaModal'
import {
  TIPOS_DOCUMENTO, tipoDocInfo, formatarEuro, formatarData,
  marcarPago, marcarPorPagar, type MovimentoCC,
} from '@/lib/contasCorrentes'
import {
  listarCategorias, listarSubcategorias, opcoesPlanas, resolverValor, valorDe,
  mapaCategorias, mapaSubcategorias, nomeCategoriaDe, categorizarMovimentos,
  type CategoriaFin, type Subcategoria,
} from '@/lib/categoriasFin'
import { faturasSemCategoriaCliente, definirCategoriaDefeitoCliente } from '@/lib/clientesCategoria'

export default function DocumentosPage() {
  const [docs, setDocs] = useState<MovimentoCC[]>([])
  const [cats, setCats] = useState<CategoriaFin[]>([])
  const [subs, setSubs] = useState<Subcategoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [f, setF] = useState<FiltrosDoc>(FILTROS_VAZIOS)
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [catMassa, setCatMassa] = useState('__x__')
  const [detalheIdx, setDetalheIdx] = useState<number | null>(null)
  // Proposta "aplicar às restantes X faturas sem categoria deste cliente".
  const [proposta, setProposta] = useState<
    { clienteId: string; clienteNome: string; value: string; label: string; ids: string[] } | null
  >(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setDocs(await listarDocumentos(f))
    setSel(new Set())
    setCarregando(false)
  }, [f])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    listarCategorias().then(setCats)
    listarSubcategorias().then(setSubs)
  }, [])

  const opcoes = useMemo(() => opcoesPlanas(cats, subs), [cats, subs])
  const catMap = useMemo(() => mapaCategorias(cats), [cats])
  const subMap = useMemo(() => mapaSubcategorias(subs), [subs])
  const totais = useMemo(() => totaisDocumentos(docs), [docs])

  function set<K extends keyof FiltrosDoc>(k: K, v: FiltrosDoc[K]) {
    setF((prev) => ({ ...prev, [k]: v }))
  }
  const temFiltros = JSON.stringify(f) !== JSON.stringify(FILTROS_VAZIOS)

  async function anexar(id: string, file: File | undefined) {
    if (!file) return
    setATrabalhar(id); setMsg(null)
    const r = await anexarFicheiro(id, file)
    if (!r.ok) setMsg('Erro ao anexar: ' + (r.motivo ?? ''))
    await carregar()
    setATrabalhar(null)
  }
  async function ver(caminho: string) {
    const url = await urlAssinado(caminho)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setMsg('Não foi possível abrir o ficheiro.')
  }

  // Classificar 1 documento (dropdown plano na linha ou no painel de detalhe).
  async function categorizarUm(m: MovimentoCC, value: string) {
    const { categoria_chave, subcategoria_id } = resolverValor(value, subs, cats)
    setATrabalhar(m.id); setMsg(null)
    const r = await categorizarMovimentos([m.id], categoria_chave, subcategoria_id)
    if (!r.ok) { setMsg('Erro ao classificar: ' + (r.erro ?? '')); setATrabalhar(null); return }
    setDocs((prev) => prev.map((d) => d.id === m.id
      ? { ...d, categoria: categoria_chave, subcategoria_id, categoria_manual: categoria_chave !== null, categoria_auto: false } : d))
    setATrabalhar(null)
    // Memória por cliente: se catalogou (não "por classificar") uma fatura de um
    // cliente com outras faturas sem categoria, propõe aplicar às restantes.
    if (categoria_chave && m.cliente_id) {
      const ids = await faturasSemCategoriaCliente(m.cliente_id, m.id)
      if (ids.length > 0) {
        const label = catMap.get(categoria_chave)?.label ?? 'esta categoria'
        setProposta({ clienteId: m.cliente_id, clienteNome: m.entidade_nome ?? 'este cliente', value, label, ids })
      }
    }
  }

  // "Aplicar a todas": categoriza as restantes faturas do cliente e grava a
  // categoria-defeito na ficha (as futuras entram pré-categorizadas).
  async function aplicarPropostaATodas() {
    if (!proposta) return
    const { categoria_chave, subcategoria_id } = resolverValor(proposta.value, subs, cats)
    const alvo = proposta.ids
    const r = await categorizarMovimentos(alvo, categoria_chave, subcategoria_id)
    if (!r.ok) { setMsg('Erro: ' + (r.erro ?? '')); return }
    await definirCategoriaDefeitoCliente(proposta.clienteId, categoria_chave, subcategoria_id)
    setDocs((prev) => prev.map((d) => alvo.includes(d.id)
      ? { ...d, categoria: categoria_chave, subcategoria_id, categoria_manual: true, categoria_auto: false } : d))
    setMsg(`✅ ${alvo.length} fatura(s) → ${proposta.label}. Categoria-defeito guardada para ${proposta.clienteNome}.`)
    setProposta(null)
  }

  async function alternarPagamento(m: MovimentoCC) {
    const pago = m.estado === 'liquidado'
    setATrabalhar(m.id); setMsg(null)
    const { error } = pago ? await marcarPorPagar(m.id) : await marcarPago(m)
    if (error) setMsg('Erro ao atualizar o pagamento: ' + error.message)
    await carregar()
    setATrabalhar(null)
  }

  async function remover(m: MovimentoCC) {
    if (!m.ficheiro_caminho) return
    if (!confirm('Remover o ficheiro deste documento?')) return
    setATrabalhar(m.id); setMsg(null)
    await removerFicheiro(m.id, m.ficheiro_caminho)
    await carregar()
    setATrabalhar(null)
  }

  // ── Categorizar em massa ──
  function alternarSel(id: string) {
    setSel((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  function alternarTodos() {
    setSel((prev) => prev.size === docs.length ? new Set() : new Set(docs.map((d) => d.id)))
  }
  async function aplicarMassa() {
    if (sel.size === 0 || catMassa === '__x__') return
    const value = catMassa === '__sem__' ? '' : catMassa
    const { categoria_chave, subcategoria_id } = resolverValor(value, subs, cats)
    const ids = Array.from(sel)
    const r = await categorizarMovimentos(ids, categoria_chave, subcategoria_id)
    if (!r.ok) { setMsg('Erro: ' + (r.erro ?? '')); return }
    setDocs((prev) => prev.map((d) => sel.has(d.id)
      ? { ...d, categoria: categoria_chave, subcategoria_id, categoria_manual: categoria_chave !== null } : d))
    setSel(new Set()); setCatMassa('__x__')
    const alvo = categoria_chave ? (catMap.get(categoria_chave)?.label ?? 'categoria') : 'sem categoria'
    setMsg(`✅ ${ids.length} documento(s) → ${alvo}.`)
  }

  function exportar() {
    if (docs.length === 0) return
    descarregarCsv(exportarDocumentosCsv(docs, (m) => nomeCategoriaDe(m, catMap, subMap)), 'documentos-financeiros.csv')
  }

  const comFicheiro = docs.filter((d) => d.ficheiro_caminho).length
  const porClassificar = docs.filter((d) => !d.categoria).length

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🧾 Documentos</h1>
          <p style={c.sub}>Faturas, recibos e notas de crédito — categorizar, marcar pago e exportar.</p>
        </div>
        <div style={c.topoAcoes}>
          <Link href="/financeiro/categorias" style={c.btnGhost}>🏷️ Categorias</Link>
          <Link href="/financeiro/contas-correntes/novo" style={c.btnPrimario}>+ Novo documento</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg} <button style={c.fecharAviso} onClick={() => setMsg(null)}>✕</button></div>}

      {proposta && (
        <div style={c.proposta}>
          <span>
            Aplicar <strong>{proposta.label}</strong> às restantes <strong>{proposta.ids.length}</strong> fatura(s) sem
            categoria de <strong>{proposta.clienteNome}</strong>?
          </span>
          <span style={c.propostaAcoes}>
            <button style={c.btnPrimario} onClick={aplicarPropostaATodas}>Aplicar a todas</button>
            <button style={c.btnGhost} onClick={() => setProposta(null)}>Só a esta</button>
          </span>
        </div>
      )}

      {/* Filtros */}
      <div style={c.filtros}>
        <input placeholder="Procurar por nº ou entidade..." value={f.texto} onChange={(e) => set('texto', e.target.value)} style={{ ...c.input, flex: 1, minWidth: 180 }} />
        <select value={f.entidade_tipo} onChange={(e) => set('entidade_tipo', e.target.value as FiltrosDoc['entidade_tipo'])} style={c.input}>
          <option value="">Clientes e fornecedores</option>
          <option value="cliente">Clientes</option>
          <option value="fornecedor">Fornecedores</option>
        </select>
        <select value={f.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value as FiltrosDoc['tipo_documento'])} style={c.input}>
          <option value="">Todos os tipos</option>
          {TIPOS_DOCUMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
        <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)} style={c.input}>
          <option value="">Todas as categorias</option>
          <option value="por_classificar">⚠️ Por classificar</option>
          {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={f.pagamento} onChange={(e) => set('pagamento', e.target.value as FiltrosDoc['pagamento'])} style={c.input}>
          <option value="">Pagos e por pagar</option>
          <option value="pago">Pagamento confirmado</option>
          <option value="por_confirmar">Por confirmar</option>
        </select>
        <select value={f.origem} onChange={(e) => set('origem', e.target.value as FiltrosDoc['origem'])} style={c.input}>
          <option value="">Todas as origens</option>
          <option value="manual">Manual</option>
          <option value="keyinvoice">Keyinvoice</option>
        </select>
        <select value={f.ficheiro} onChange={(e) => set('ficheiro', e.target.value as FiltrosDoc['ficheiro'])} style={c.input}>
          <option value="">Com e sem ficheiro</option>
          <option value="com">Com ficheiro</option>
          <option value="sem">Sem ficheiro</option>
        </select>
        <label style={c.dataLabel}>De <input type="date" value={f.de} onChange={(e) => set('de', e.target.value)} style={c.input} /></label>
        <label style={c.dataLabel}>Até <input type="date" value={f.ate} onChange={(e) => set('ate', e.target.value)} style={c.input} /></label>
        {temFiltros && <button style={c.btnGhost} onClick={() => setF(FILTROS_VAZIOS)}>Limpar</button>}
      </div>

      {/* Resumo + totais + export */}
      <div style={c.resumo}>
        <span style={c.resumoLinha}>
          {docs.length} documento(s) · {comFicheiro} com ficheiro
          {porClassificar > 0 && (
            <button style={c.resumoAviso} onClick={() => set('categoria', 'por_classificar')}>
              ⚠️ {porClassificar} por classificar
            </button>
          )}
        </span>
        <span style={c.totais}>
          <span>Faturado: <strong>{formatarEuro(totais.faturado)}</strong></span>
          <span>Créditos: <strong>{formatarEuro(totais.creditado)}</strong></span>
        </span>
        <button style={c.btnGhost} onClick={exportar} disabled={docs.length === 0}>⬇️ Exportar CSV</button>
      </div>

      {/* Barra de categorização em massa */}
      {sel.size > 0 && (
        <div style={c.massaBar}>
          <span><strong>{sel.size}</strong> selecionado(s)</span>
          <select value={catMassa} onChange={(e) => setCatMassa(e.target.value)} style={c.input}>
            <option value="__x__">Escolher categoria...</option>
            <option value="__sem__">— Sem categoria —</option>
            {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button style={c.btnPrimario} onClick={aplicarMassa} disabled={catMassa === '__x__'}>Aplicar categoria</button>
          <button style={c.btnGhost} onClick={() => setSel(new Set())}>Cancelar</button>
        </div>
      )}

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : docs.length === 0 ? (
        <p style={c.estado}>Sem documentos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span style={{ textAlign: 'center' }}>
              <input type="checkbox" checked={sel.size === docs.length && docs.length > 0} onChange={alternarTodos} title="Selecionar todos" />
            </span>
            <span>Data</span>
            <span>Documento</span>
            <span>Entidade</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span>Categoria</span>
            <span style={{ textAlign: 'center' }}>Pagamento</span>
            <span style={{ textAlign: 'center' }}>Origem</span>
            <span style={{ textAlign: 'center' }}>Ficheiro</span>
          </div>
          {docs.map((m, idx) => {
            const valor = m.valor_debito || m.valor_credito
            const ocupado = aTrabalhar === m.id
            const cat = m.categoria ? catMap.get(m.categoria) : null
            const liquidavel = m.tipo_documento === 'fatura' || m.tipo_documento === 'pro_forma'
            const pago = m.estado === 'liquidado'
            const estilaCat = cat ? { color: cat.cor ?? undefined, background: cat.bg ?? undefined, borderColor: cat.bg ?? undefined } : c.selCatVazio
            return (
              <div key={m.id} style={{ ...c.linha, ...(sel.has(m.id) ? c.linhaSel : null) }}>
                <span style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => alternarSel(m.id)} />
                </span>
                <span style={c.muted}>{formatarData(m.data_documento)}</span>
                <span>
                  <button style={c.docBtn} onClick={() => setDetalheIdx(idx)} title="Ver detalhe / catalogar">
                    {tipoDocInfo(m.tipo_documento).label}{m.documento_ref ? ` ${m.documento_ref}` : ''}
                  </button>
                  {m.categoria_auto && <span style={c.autoTag} title="Categoria automática — por rever">auto</span>}
                  {temDetalheApi(m) && <span style={c.lupa} title="Tem linhas e PDF">🔍</span>}
                </span>
                <span>{m.entidade_nome ?? '—'}<span style={c.entTipo}> · {m.entidade_tipo}</span></span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(valor)}</span>
                <span>
                  <select
                    value={valorDe(m)}
                    disabled={ocupado}
                    onChange={(e) => categorizarUm(m, e.target.value)}
                    style={{ ...c.selCat, ...estilaCat }}
                    title={m.categoria_manual ? 'Classificada à mão' : 'Proposta pela importação'}
                  >
                    <option value="">Por classificar</option>
                    {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </span>
                <span style={{ textAlign: 'center' }}>
                  {liquidavel ? (
                    <button style={{ ...c.pagoBtn, ...(pago ? c.pagoOn : {}) }} disabled={ocupado} onClick={() => alternarPagamento(m)}
                      title={pago ? `Pago${m.data_pagamento ? ' em ' + formatarData(m.data_pagamento) : ''} — clicar para reverter` : 'Marcar como pago'}>
                      {pago ? `✓ ${formatarData(m.data_pagamento)}` : 'Marcar pago'}
                    </button>
                  ) : (
                    <span style={c.muted}>—</span>
                  )}
                </span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{ ...c.badge, ...(m.origem === 'keyinvoice' ? c.badgeKi : c.badgeManual) }}>
                    {m.origem === 'keyinvoice' ? 'Keyinvoice' : 'Manual'}
                  </span>
                </span>
                <span style={{ textAlign: 'center' }}>
                  {m.ficheiro_caminho ? (
                    <span style={c.ficheiroAcoes}>
                      <button style={c.linkBtn} disabled={ocupado} onClick={() => ver(m.ficheiro_caminho!)} title={m.ficheiro_nome ?? 'Ver'}>Ver ↗</button>
                      <button style={c.removerBtn} disabled={ocupado} onClick={() => remover(m)} title="Remover ficheiro">✕</button>
                    </span>
                  ) : (
                    <label style={c.anexarLabel}>
                      {ocupado ? '...' : '+ Anexar'}
                      <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} disabled={ocupado} onChange={(e) => anexar(m.id, e.target.files?.[0])} />
                    </label>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {detalheIdx !== null && docs[detalheIdx] && (
        <DetalheFaturaModal
          doc={docs[detalheIdx]}
          opcoes={opcoes}
          temAnterior={detalheIdx > 0}
          temSeguinte={detalheIdx < docs.length - 1}
          ocupado={aTrabalhar === docs[detalheIdx].id}
          onNav={(dir) => setDetalheIdx((i) => (i === null ? i : Math.min(docs.length - 1, Math.max(0, i + dir))))}
          onClose={() => setDetalheIdx(null)}
          onCategorizar={categorizarUm}
        />
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1150, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  topoAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fecharAviso: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 },
  proposta: { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  propostaAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  filtros: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  dataLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  resumoLinha: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  resumoAviso: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  totais: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  massaBar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 },
  selCat: { border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 600, maxWidth: '100%' },
  selCatVazio: { color: '#92400E', background: '#FEF3C7', borderColor: '#FCD34D' },
  pagoBtn: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  pagoOn: { background: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.4fr 0.9fr 1.5fr 1.7fr 0.9fr 1.4fr 1.1fr 0.9fr 1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 1160 },
  linhaSel: { background: '#F5F3FF' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  docBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13.5, padding: 0, textAlign: 'left', textDecoration: 'underline' },
  autoTag: { marginLeft: 6, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', verticalAlign: 'middle' },
  lupa: { marginLeft: 6, fontSize: 11, opacity: 0.6 },
  entTipo: { color: 'var(--muted)', fontSize: 12 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  badgeManual: { color: '#374151', background: '#E5E7EB' },
  badgeKi: { color: '#5B21B6', background: '#EDE9FE' },
  ficheiroAcoes: { display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  removerBtn: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  anexarLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
}
