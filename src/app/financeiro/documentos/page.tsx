'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  listarDocumentos, anexarFicheiro, removerFicheiro, urlAssinado,
  totaisDocumentos, exportarDocumentosCsv, descarregarCsv,
  FILTROS_VAZIOS, type FiltrosDoc,
} from '@/lib/documentosFinanceiros'
import {
  TIPOS_DOCUMENTO, tipoDocInfo, formatarEuro, formatarData, type MovimentoCC,
} from '@/lib/contasCorrentes'
import {
  listarCategorias, opcoesPlanas, resolverSelecao, mapaNomes, categorizarMovimentos,
  type Categoria,
} from '@/lib/categoriasFinanceiras'

export default function DocumentosPage() {
  const [docs, setDocs] = useState<MovimentoCC[]>([])
  const [cats, setCats] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [f, setF] = useState<FiltrosDoc>(FILTROS_VAZIOS)
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [catMassa, setCatMassa] = useState('__x__')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setDocs(await listarDocumentos(f))
    setSel(new Set())
    setCarregando(false)
  }, [f])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { listarCategorias().then(setCats) }, [])

  const opcoes = useMemo(() => opcoesPlanas(cats), [cats])
  const nomes = useMemo(() => mapaNomes(cats), [cats])
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
  async function remover(m: MovimentoCC) {
    if (!m.ficheiro_caminho) return
    if (!confirm('Remover o ficheiro deste documento?')) return
    setATrabalhar(m.id); setMsg(null)
    await removerFicheiro(m.id, m.ficheiro_caminho)
    await carregar()
    setATrabalhar(null)
  }

  // ── Categorizar 1 documento (dropdown na linha) ──
  async function categorizarUm(m: MovimentoCC, value: string) {
    const { categoria_id, subcategoria_id } = resolverSelecao(cats, value)
    const r = await categorizarMovimentos([m.id], categoria_id, subcategoria_id)
    if (!r.ok) { setMsg('Erro: ' + (r.erro ?? '')); return }
    setDocs((prev) => prev.map((d) => d.id === m.id ? { ...d, categoria_id, subcategoria_id } : d))
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
    const { categoria_id, subcategoria_id } = resolverSelecao(cats, catMassa === '__sem__' ? '' : catMassa)
    const ids = Array.from(sel)
    const r = await categorizarMovimentos(ids, categoria_id, subcategoria_id)
    if (!r.ok) { setMsg('Erro: ' + (r.erro ?? '')); return }
    setDocs((prev) => prev.map((d) => sel.has(d.id) ? { ...d, categoria_id, subcategoria_id } : d))
    setSel(new Set())
    const alvo = categoria_id ? (nomes.get(subcategoria_id ?? categoria_id) ?? 'categoria') : 'sem categoria'
    setMsg(`✅ ${ids.length} documento(s) → ${alvo}.`)
  }

  function exportar() {
    if (docs.length === 0) return
    descarregarCsv(exportarDocumentosCsv(docs, nomes), `documentos-financeiros.csv`)
  }

  const comFicheiro = docs.filter((d) => d.ficheiro_caminho).length

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🧾 Documentos</h1>
          <p style={c.sub}>Faturas, recibos e notas de crédito — categorizados e com o PDF anexo.</p>
        </div>
        <div style={c.topoAcoes}>
          <Link href="/financeiro/categorias" style={c.btnGhost}>🏷️ Categorias</Link>
          <Link href="/financeiro/contas-correntes/novo" style={c.btnPrimario}>+ Novo documento</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg} <button style={c.fecharAviso} onClick={() => setMsg(null)}>✕</button></div>}

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
          <option value="sem">— Sem categoria —</option>
          {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <span>{totais.n} documento(s) · {comFicheiro} com ficheiro</span>
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
            <span>Categoria</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span style={{ textAlign: 'center' }}>Ficheiro</span>
          </div>
          {docs.map((m) => {
            const valor = m.valor_debito || m.valor_credito
            const ocupado = aTrabalhar === m.id
            const valSel = m.subcategoria_id ?? m.categoria_id ?? ''
            return (
              <div key={m.id} style={{ ...c.linha, ...(sel.has(m.id) ? c.linhaSel : null) }}>
                <span style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => alternarSel(m.id)} />
                </span>
                <span style={c.muted}>{formatarData(m.data_documento)}</span>
                <span>{tipoDocInfo(m.tipo_documento).label}{m.documento_ref ? ` ${m.documento_ref}` : ''}</span>
                <span>{m.entidade_nome ?? '—'}<span style={c.entTipo}> · {m.entidade_tipo}</span></span>
                <span>
                  <select value={valSel} onChange={(e) => categorizarUm(m, e.target.value)} style={c.selCat}>
                    <option value="">— sem categoria —</option>
                    {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(valor)}</span>
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
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  topoAcoes: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  fecharAviso: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 },
  filtros: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  dataLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  totais: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  massaBar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.4fr 0.9fr 1.5fr 1.8fr 1.6fr 1fr 1.1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 900 },
  linhaSel: { background: '#F5F3FF' },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  entTipo: { color: 'var(--muted)', fontSize: 12 },
  selCat: { padding: '6px 8px', border: '1px solid #ddd', borderRadius: 8, fontSize: 12.5, maxWidth: '100%', background: '#fff' },
  ficheiroAcoes: { display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  removerBtn: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  anexarLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
}
