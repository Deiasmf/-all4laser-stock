'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  listarDocumentos, anexarFicheiro, removerFicheiro, urlAssinado,
  FILTROS_VAZIOS, type FiltrosDoc,
} from '@/lib/documentosFinanceiros'
import {
  TIPOS_DOCUMENTO, tipoDocInfo, formatarEuro, formatarData,
  definirCategoria, marcarPago, marcarPorPagar, type MovimentoCC,
} from '@/lib/contasCorrentes'
import { CATEGORIAS, categoriaInfo, type CategoriaDoc } from '@/lib/categorizacaoFinanceira'

export default function DocumentosPage() {
  const [docs, setDocs] = useState<MovimentoCC[]>([])
  const [carregando, setCarregando] = useState(true)
  const [f, setF] = useState<FiltrosDoc>(FILTROS_VAZIOS)
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setDocs(await listarDocumentos(f))
    setCarregando(false)
  }, [f])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

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
  async function classificar(m: MovimentoCC, valor: string) {
    setATrabalhar(m.id); setMsg(null)
    const { error } = await definirCategoria(m.id, (valor || null) as CategoriaDoc | null)
    if (error) setMsg('Erro ao classificar: ' + error.message)
    await carregar()
    setATrabalhar(null)
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

  const comFicheiro = docs.filter((d) => d.ficheiro_caminho).length
  const porClassificar = docs.filter((d) => !d.categoria).length

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🧾 Documentos</h1>
          <p style={c.sub}>Faturas, recibos e notas de crédito — com o PDF anexo.</p>
        </div>
        <Link href="/financeiro/contas-correntes/novo" style={c.btnPrimario}>+ Novo documento</Link>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

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
        <select value={f.categoria} onChange={(e) => set('categoria', e.target.value as FiltrosDoc['categoria'])} style={c.input}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((k) => <option key={k.valor} value={k.valor}>{k.icon} {k.label}</option>)}
          <option value="por_classificar">⚠️ Por classificar</option>
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

      <div style={c.resumo}>
        {docs.length} documento(s) · {comFicheiro} com ficheiro
        {porClassificar > 0 && (
          <button style={c.resumoAviso} onClick={() => set('categoria', 'por_classificar')}>
            ⚠️ {porClassificar} por classificar
          </button>
        )}
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : docs.length === 0 ? (
        <p style={c.estado}>Sem documentos.</p>
      ) : (
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Data</span>
            <span>Documento</span>
            <span>Entidade</span>
            <span style={{ textAlign: 'right' }}>Valor</span>
            <span>Categoria</span>
            <span style={{ textAlign: 'center' }}>Pagamento</span>
            <span style={{ textAlign: 'center' }}>Origem</span>
            <span style={{ textAlign: 'center' }}>Ficheiro</span>
          </div>
          {docs.map((m) => {
            const valor = m.valor_debito || m.valor_credito
            const ocupado = aTrabalhar === m.id
            const cat = categoriaInfo(m.categoria)
            const liquidavel = m.tipo_documento === 'fatura' || m.tipo_documento === 'pro_forma'
            const pago = m.estado === 'liquidado'
            return (
              <div key={m.id} style={c.linha}>
                <span style={c.muted}>{formatarData(m.data_documento)}</span>
                <span>{tipoDocInfo(m.tipo_documento).label}{m.documento_ref ? ` ${m.documento_ref}` : ''}</span>
                <span>{m.entidade_nome ?? '—'}<span style={c.entTipo}> · {m.entidade_tipo}</span></span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(valor)}</span>
                <span>
                  <select
                    value={m.categoria ?? ''}
                    disabled={ocupado}
                    onChange={(e) => classificar(m, e.target.value)}
                    style={{ ...c.selCat, ...(cat ? { color: cat.cor, background: cat.bg, borderColor: cat.bg } : c.selCatVazio) }}
                    title={m.categoria_manual ? 'Classificada à mão' : 'Proposta pela importação'}
                  >
                    <option value="">Por classificar</option>
                    {CATEGORIAS.map((k) => <option key={k.valor} value={k.valor}>{k.icon} {k.label}</option>)}
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
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1050, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  filtros: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: 9, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  dataLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  resumo: { background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  resumoAviso: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  selCat: { border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 600, maxWidth: '100%' },
  selCatVazio: { color: '#92400E', background: '#FEF3C7', borderColor: '#FCD34D' },
  pagoBtn: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  pagoOn: { background: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' },
  estado: { color: 'var(--muted)', padding: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.9fr 1.5fr 1.7fr 0.9fr 1.3fr 1.1fr 0.9fr 1fr', gap: 8, padding: '10px 8px', fontSize: 13.5, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 1080 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  entTipo: { color: 'var(--muted)', fontSize: 12 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' },
  badgeManual: { color: '#374151', background: '#E5E7EB' },
  badgeKi: { color: '#5B21B6', background: '#EDE9FE' },
  ficheiroAcoes: { display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  removerBtn: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  anexarLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
}
