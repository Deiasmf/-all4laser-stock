'use client'

import { useEffect, useState } from 'react'
import { usePortalCC } from '@/lib/portalCCAuth'
import { portalExtrato, formatarMoeda, formatarData, type PortalMovimento } from '@/lib/portalCC'
import { Cartao, AtualizadoEm, Contacto, ACarregar } from '../_comps'

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

export default function DocumentosPage() {
  const { contaSelId, contas, t, lang } = usePortalCC()
  const [linhas, setLinhas] = useState<PortalMovimento[] | null>(null)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const conta = contas.find((c) => c.conta_id === contaSelId) ?? null

  useEffect(() => {
    if (!contaSelId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinhas(null)
    portalExtrato(contaSelId).then(setLinhas)
  }, [contaSelId])

  function gerarPdf() {
    if (!linhas || !conta) return
    const filtradas = linhas.filter((m) => (!de || m.data >= de) && (!ate || m.data <= ate))
    const titulo = lang === 'pt' ? 'Extrato de conta' : 'Account statement'
    const periodo = de || ate
      ? `${de ? formatarData(de) : '…'} — ${ate ? formatarData(ate) : '…'}`
      : t('period_all')
    const linhasHtml = filtradas.map((m) => `
      <tr>
        <td>${esc(formatarData(m.data))}</td>
        <td>${esc(m.descricao ?? '')}</td>
        <td class="r">${m.esperado ? esc(formatarMoeda(m.esperado, m.moeda)) : ''}</td>
        <td class="r">${m.recebido ? esc(formatarMoeda(m.recebido, m.moeda)) : ''}</td>
        <td class="r b">${esc(formatarMoeda(m.saldo, m.moeda))}</td>
      </tr>`).join('')
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
      <title>${esc(titulo)} — ${esc(conta.conta_nome)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:32px;font-size:13px}
        .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0b3d2e;padding-bottom:12px;margin-bottom:16px}
        .brand{font-size:20px;font-weight:800;color:#0b3d2e}
        .meta{text-align:right;color:#6b7280;font-size:12px}
        h1{font-size:16px;margin:0 0 4px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{padding:7px 10px;border-bottom:1px solid #eee;text-align:left}
        th{background:#f7f8fa;color:#6b7280;font-size:11px;text-transform:uppercase}
        .r{text-align:right}.b{font-weight:700}
        .foot{margin-top:18px;color:#9ca3af;font-size:11px}
      </style></head><body>
      <div class="top">
        <div><div class="brand">All4laser</div><div style="color:#6b7280;font-size:12px">${esc(t('brand'))}</div></div>
        <div class="meta">${esc(conta.conta_nome)}<br>${esc(new Date().toLocaleString())}</div>
      </div>
      <h1>${esc(titulo)}</h1>
      <div style="color:#6b7280;font-size:12px">${esc(periodo)}</div>
      <table>
        <thead><tr>
          <th>${esc(t('col_date'))}</th><th>${esc(t('col_description'))}</th>
          <th class="r">${esc(t('col_expected'))}</th><th class="r">${esc(t('col_received'))}</th>
          <th class="r">${esc(t('col_balance'))}</th>
        </tr></thead>
        <tbody>${linhasHtml || `<tr><td colspan="5" style="color:#9ca3af">${esc(t('no_data'))}</td></tr>`}</tbody>
      </table>
      <div class="foot">All4laser · ${new Date().getFullYear()}</div>
      </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  return (
    <Cartao titulo={t('documents_title')}>
      <AtualizadoEm />
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 14 }}>{t('documents_sub')}</p>
      {linhas === null ? <ACarregar /> : (
        <>
          <div style={est.filtros}>
            <label style={est.campo}><span style={est.rot}>{t('col_date')} ({t('col_expected')})</span>
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={est.input} /></label>
            <label style={est.campo}><span style={est.rot}>{t('col_date')} ({t('col_received')})</span>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={est.input} /></label>
            <button style={est.botao} onClick={gerarPdf} disabled={!conta}>{t('generate_pdf')}</button>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12.5, marginTop: 10 }}>{t('period_all')} · {linhas.length}</p>
        </>
      )}
      <div style={{ marginTop: 10 }}><Contacto /></div>
    </Cartao>
  )
}

const est: Record<string, React.CSSProperties> = {
  filtros: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: '#374151' },
  input: { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit' },
  botao: { background: 'var(--primary, #0b3d2e)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
}
