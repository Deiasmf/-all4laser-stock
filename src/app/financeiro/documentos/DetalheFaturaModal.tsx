'use client'

import { useEffect, useState } from 'react'
import { formatarEuro, formatarData, tipoDocInfo, type MovimentoCC } from '@/lib/contasCorrentes'
import { valorDe, type OpcaoCat } from '@/lib/categoriasFin'
import {
  obterDetalheDoc, obterPdfBlobUrl, temDetalheApi, type LinhaDoc,
} from '@/lib/documentosFinanceiros'

type Props = {
  doc: MovimentoCC
  opcoes: OpcaoCat[]
  temAnterior: boolean
  temSeguinte: boolean
  ocupado: boolean
  onNav: (dir: -1 | 1) => void
  onClose: () => void
  onCategorizar: (m: MovimentoCC, value: string) => void
}

export default function DetalheFaturaModal({
  doc, opcoes, temAnterior, temSeguinte, ocupado, onNav, onClose, onCategorizar,
}: Props) {
  const [linhas, setLinhas] = useState<LinhaDoc[] | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)

  const detalhavel = temDetalheApi(doc)

  // Buscar linhas + PDF sempre que muda o documento (anterior/seguinte).
  useEffect(() => {
    if (!detalhavel) { setLinhas(null); setPdfUrl(null); setErro(null); return }
    let vivo = true
    let urlLocal: string | null = null
    setACarregar(true); setErro(null); setLinhas(null); setPdfUrl(null)
    ;(async () => {
      const [det, pdf] = await Promise.all([
        obterDetalheDoc(doc.keyinvoice_doc_id!),
        obterPdfBlobUrl(doc.keyinvoice_doc_id!),
      ])
      if (!vivo) { if (pdf.ok && pdf.url) URL.revokeObjectURL(pdf.url); return }
      if (det.ok) setLinhas(det.linhas ?? [])
      else setErro(det.erro ?? 'Falha a obter as linhas.')
      if (pdf.ok && pdf.url) { urlLocal = pdf.url; setPdfUrl(pdf.url) }
      setACarregar(false)
    })()
    return () => { vivo = false; if (urlLocal) URL.revokeObjectURL(urlLocal) }
  }, [doc.keyinvoice_doc_id, detalhavel])

  // Teclas: ← anterior, → seguinte, Esc fecha.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && temAnterior) onNav(-1)
      else if (e.key === 'ArrowRight' && temSeguinte) onNav(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [temAnterior, temSeguinte, onNav, onClose])

  const valor = doc.valor_debito || doc.valor_credito

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.painel} onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div style={s.cab}>
          <div style={{ minWidth: 0 }}>
            <div style={s.tituloDoc}>
              {tipoDocInfo(doc.tipo_documento).label}{doc.documento_ref ? ` ${doc.documento_ref}` : ''}
            </div>
            <div style={s.subDoc}>
              {doc.entidade_nome ?? '—'} · {formatarData(doc.data_documento)} · <strong>{formatarEuro(valor)}</strong>
            </div>
          </div>
          <div style={s.navBtns}>
            <button style={s.iconBtn} disabled={!temAnterior} onClick={() => onNav(-1)} title="Anterior (←)">←</button>
            <button style={s.iconBtn} disabled={!temSeguinte} onClick={() => onNav(1)} title="Seguinte (→)">→</button>
            <button style={s.fechar} onClick={onClose} title="Fechar (Esc)">✕</button>
          </div>
        </div>

        {/* Categoria (catalogar sem sair) */}
        <div style={s.catLinha}>
          <label style={s.catLabel}>Categoria</label>
          <select
            value={valorDe(doc)}
            disabled={ocupado}
            onChange={(e) => onCategorizar(doc, e.target.value)}
            style={s.catSelect}
          >
            <option value="">Por classificar</option>
            {opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {doc.categoria_auto && <span style={s.badgeAuto} title="Categoria automática — por rever">automática</span>}
        </div>

        <div style={s.corpo}>
          {/* Linhas do documento */}
          <div style={s.coluna}>
            <div style={s.secTitulo}>Linhas</div>
            {!detalhavel ? (
              <p style={s.info}>Este documento não foi sincronizado por API — sem detalhe de linhas.</p>
            ) : aCarregar && !linhas ? (
              <p style={s.info}>A carregar…</p>
            ) : erro ? (
              <p style={s.erro}>{erro}</p>
            ) : linhas && linhas.length > 0 ? (
              <div style={s.tabelaLinhas}>
                <div style={{ ...s.linhaL, ...s.cabL }}>
                  <span>Descrição</span>
                  <span style={{ textAlign: 'right' }}>Qtd</span>
                  <span style={{ textAlign: 'right' }}>Preço</span>
                  <span style={{ textAlign: 'right' }}>Valor</span>
                </div>
                {linhas.map((l, i) => (
                  <div key={i} style={s.linhaL}>
                    <span>{l.descricao || '—'}</span>
                    <span style={{ textAlign: 'right' }}>{l.qtd}</span>
                    <span style={{ textAlign: 'right' }}>{formatarEuro(l.precoUnit)}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatarEuro(l.valor)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={s.info}>Sem linhas.</p>
            )}
          </div>

          {/* Pré-visualização do PDF */}
          <div style={s.coluna}>
            <div style={s.secTitulo}>
              PDF {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={s.abrirPdf}>abrir ↗</a>}
            </div>
            {!detalhavel ? (
              <p style={s.info}>Sem PDF.</p>
            ) : pdfUrl ? (
              <iframe src={pdfUrl} style={s.pdf} title="Pré-visualização do PDF" />
            ) : aCarregar ? (
              <p style={s.info}>A carregar o PDF…</p>
            ) : (
              <p style={s.info}>PDF indisponível.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' },
  painel: { background: '#fff', width: 'min(920px, 100%)', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)', overflow: 'hidden' },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  tituloDoc: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  subDoc: { fontSize: 13.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' },
  navBtns: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  iconBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, fontSize: 16, cursor: 'pointer' },
  fechar: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', marginLeft: 4 },
  catLinha: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #f2f2f2', flexWrap: 'wrap' },
  catLabel: { fontSize: 13, fontWeight: 700, color: 'var(--muted)' },
  catSelect: { padding: 8, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, minWidth: 200 },
  badgeAuto: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D' },
  corpo: { display: 'flex', gap: 0, flex: 1, minHeight: 0, flexWrap: 'wrap' },
  coluna: { flex: '1 1 360px', minWidth: 300, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, borderRight: '1px solid #f2f2f2' },
  secTitulo: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  abrirPdf: { fontSize: 12, color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' },
  tabelaLinhas: { border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' },
  linhaL: { display: 'grid', gridTemplateColumns: '2fr 0.6fr 0.9fr 0.9fr', gap: 8, padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f4f4f4', alignItems: 'center' },
  cabL: { fontWeight: 700, color: 'var(--muted)', fontSize: 11.5, position: 'sticky', top: 0, background: '#fafafa' },
  pdf: { flex: 1, width: '100%', minHeight: 360, border: '1px solid var(--border)', borderRadius: 8 },
  info: { color: 'var(--muted)', fontSize: 13.5 },
  erro: { color: '#c62828', fontSize: 13.5 },
}
