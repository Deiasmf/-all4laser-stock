'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { listarBoxes } from '@/lib/freight'
import {
  obterPackingList, listarLinhasPacking, listarPdfsPacking, atualizarPackingList,
  guardarLinhasPacking, guardarVersaoPdf, urlPdfPacking, emailsVencedor, type CabecalhoPacking,
} from '@/lib/packingList'
import { gerarPdfDocumento, descarregarPdf } from '@/lib/fichaPdf'
import { documentoPackingList, totaisPacking, type PackingList, type PackingListPdf, type LinhaPackingInput } from '@/types/packing'
import type { StandardBox } from '@/types/freight'

const linhaVazia = (): LinhaPackingInput => ({ descricao: null, ext_c: null, ext_l: null, ext_a: null, peso_liquido: null, peso_bruto: null, quantidade: 1 })

export default function PackingListEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdministrativo, perfilCarregado } = useAuth()

  const [pl, setPl] = useState<PackingList | null>(null)
  const [cab, setCab] = useState<CabecalhoPacking | null>(null)
  const [linhas, setLinhas] = useState<LinhaPackingInput[]>([])
  const [pdfs, setPdfs] = useState<PackingListPdf[]>([])
  const [boxes, setBoxes] = useState<StandardBox[]>([])
  const [aGuardar, setAGuardar] = useState(false)
  const [aGerar, setAGerar] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Envio por email
  const [envAberto, setEnvAberto] = useState(false)
  const [envPara, setEnvPara] = useState('')
  const [envAssunto, setEnvAssunto] = useState('')
  const [envCorpo, setEnvCorpo] = useState('')
  const [aEnviar, setAEnviar] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data: p }, ls, pd, bx] = await Promise.all([
      obterPackingList(id), listarLinhasPacking(id), listarPdfsPacking(id), listarBoxes(true),
    ])
    if (!p) { setPl(null); return }
    const pkl = p as PackingList
    setPl(pkl)
    setCab({
      idioma: pkl.idioma, destinatario_nome: pkl.destinatario_nome, destinatario_morada: pkl.destinatario_morada,
      referencia: pkl.referencia, tracking_awb: pkl.tracking_awb, observacoes: pkl.observacoes,
    })
    setLinhas(ls.map((l) => ({
      descricao: l.descricao, ext_c: l.ext_c, ext_l: l.ext_l, ext_a: l.ext_a,
      peso_liquido: l.peso_liquido, peso_bruto: l.peso_bruto, quantidade: l.quantidade,
    })))
    setPdfs(pd); setBoxes(bx)
  }, [id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const totais = useMemo(() => totaisPacking(linhas), [linhas])
  const nn = (v: string) => (v === '' ? null : Number(v))

  function alterarLinha(i: number, patch: Partial<LinhaPackingInput>) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function escolherBox(i: number, boxId: string) {
    const b = boxes.find((x) => x.id === boxId)
    if (!b) return
    alterarLinha(i, { descricao: b.nome, ext_c: b.ext_c, ext_l: b.ext_l, ext_a: b.ext_a, peso_liquido: b.peso_tipico ?? linhas[i].peso_liquido, peso_bruto: b.peso_tipico ?? linhas[i].peso_bruto })
  }

  async function guardar(): Promise<boolean> {
    if (!cab) return false
    setAGuardar(true)
    const { error } = await atualizarPackingList(id, cab)
    if (!error) await guardarLinhasPacking(id, linhas)
    setAGuardar(false)
    if (error) { setToast('Erro ao guardar: ' + error.message); return false }
    return true
  }
  async function guardarERecarregar() { if (await guardar()) { setToast('Guardado.'); carregar() } }

  async function gerarPdf() {
    if (!pl || !cab) return
    setAGerar(true)
    if (!(await guardar())) { setAGerar(false); return }
    try {
      const versao = (pdfs[0]?.versao ?? 0) + 1
      const plDoc: PackingList = { ...pl, ...cab }
      const blob = await gerarPdfDocumento(documentoPackingList(plDoc, linhas, versao))
      await descarregarPdf(blob, pl.numero ?? 'packing-list')
      const r = await guardarVersaoPdf(id, pl.numero ?? '', blob)
      setToast(r.motivo ? 'PDF gerado, mas falhou guardar versão: ' + r.motivo : `Packing list gerada (versão ${r.versao}).`)
      carregar()
    } catch (e) {
      setToast('Erro ao gerar PDF: ' + (e instanceof Error ? e.message : ''))
    }
    setAGerar(false)
  }
  async function abrirVersao(p: PackingListPdf) {
    const url = await urlPdfPacking(p.pdf_path)
    if (url) window.open(url, '_blank', 'noopener'); else setToast('PDF indisponível.')
  }

  async function abrirEnvio() {
    setEnvAssunto(`All4laser — Packing List ${pl?.numero ?? ''}`.trim())
    setEnvCorpo('')
    let para = ''
    if (pl?.request_id) { const e = await emailsVencedor(pl.request_id); para = e.join(', ') }
    setEnvPara(para); setEnvAberto(true)
  }
  async function enviarEmail() {
    const para = envPara.split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'))
    if (para.length === 0) { setToast('Indica pelo menos um email.'); return }
    setAEnviar(true)
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    if (!token) { setAEnviar(false); setToast('Sessão expirada.'); return }
    try {
      const r = await fetch('/api/freight/packing-list/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ packingListId: id, para, assunto: envAssunto || undefined, corpo: envCorpo || undefined }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) setToast('Envio: ' + (j.erro ?? `erro ${r.status}`))
      else { setToast('Packing list enviada por email.'); setEnvAberto(false) }
    } catch { setToast('Erro de rede ao enviar.') }
    setAEnviar(false)
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>
  if (!pl || !cab) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/cotacoes-transporte/packing-lists" style={c.voltar}>← Packing Lists</Link>
          <h1 style={c.titulo}>{pl.numero ?? 'Packing List'}</h1>
          {pl.request_id && <p style={c.sub}>Ligada ao pedido de cotação</p>}
        </div>
        <div style={c.topoAcoes}>
          <button style={c.btnSecundario} onClick={guardarERecarregar} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
          <button style={c.btnPrimario} onClick={gerarPdf} disabled={aGerar || linhas.length === 0}>{aGerar ? 'A gerar…' : 'Gerar Packing List (PDF)'}</button>
          <button style={c.btnSecundario} onClick={abrirEnvio} disabled={pdfs.length === 0} title={pdfs.length === 0 ? 'Gera o PDF primeiro' : 'Enviar a última versão por email'}>Enviar por email</button>
        </div>
      </div>

      {/* Cabeçalho */}
      <section style={c.card}>
        <div style={c.grelha}>
          <label style={c.campo}><span style={c.rot}>Idioma</span>
            <select style={c.input} value={cab.idioma} onChange={(e) => setCab({ ...cab, idioma: e.target.value as CabecalhoPacking['idioma'] })}>
              <option value="en">Inglês (EN)</option><option value="pt">Português (PT)</option>
            </select>
          </label>
          <label style={c.campo}><span style={c.rot}>Destinatário (entidade)</span>
            <input style={c.input} value={cab.destinatario_nome ?? ''} onChange={(e) => setCab({ ...cab, destinatario_nome: e.target.value || null })} />
          </label>
          <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Morada de destino</span>
            <input style={c.input} value={cab.destinatario_morada ?? ''} onChange={(e) => setCab({ ...cab, destinatario_morada: e.target.value || null })} />
          </label>
          <label style={c.campo}><span style={c.rot}>Encomenda / EP (ref.)</span>
            <input style={c.input} value={cab.referencia ?? ''} onChange={(e) => setCab({ ...cab, referencia: e.target.value || null })} />
          </label>
          <label style={c.campo}><span style={c.rot}>Tracking / AWB</span>
            <input style={c.input} value={cab.tracking_awb ?? ''} onChange={(e) => setCab({ ...cab, tracking_awb: e.target.value || null })} />
          </label>
          <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Observações</span>
            <textarea style={{ ...c.input, minHeight: 50 }} value={cab.observacoes ?? ''} onChange={(e) => setCab({ ...cab, observacoes: e.target.value || null })} />
          </label>
        </div>
      </section>

      {/* Volumes */}
      <section style={c.card}>
        <h2 style={c.h2}>Volumes</h2>
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead><tr>
              <th style={c.th}>Caixa</th><th style={c.th}>Descrição do conteúdo</th>
              <th style={c.th}>C</th><th style={c.th}>L</th><th style={c.th}>A</th>
              <th style={c.th}>Peso líq.</th><th style={c.th}>Peso bruto</th><th style={c.th}>Qtd</th><th style={c.th}></th>
            </tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td style={c.td}>
                    <select style={c.inputMini} value="" onChange={(e) => { if (e.target.value) escolherBox(i, e.target.value) }}>
                      <option value="">— catálogo —</option>
                      {boxes.map((b) => <option key={b.id} value={b.id}>{b.nome} ({b.ext_c}×{b.ext_l}×{b.ext_a})</option>)}
                    </select>
                  </td>
                  <td style={c.td}><input style={c.inputMini} value={l.descricao ?? ''} placeholder="ex.: Aesthetic laser equipment" onChange={(e) => alterarLinha(i, { descricao: e.target.value || null })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" value={l.ext_c ?? ''} onChange={(e) => alterarLinha(i, { ext_c: nn(e.target.value) })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" value={l.ext_l ?? ''} onChange={(e) => alterarLinha(i, { ext_l: nn(e.target.value) })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" value={l.ext_a ?? ''} onChange={(e) => alterarLinha(i, { ext_a: nn(e.target.value) })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" value={l.peso_liquido ?? ''} onChange={(e) => alterarLinha(i, { peso_liquido: nn(e.target.value) })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" value={l.peso_bruto ?? ''} onChange={(e) => alterarLinha(i, { peso_bruto: nn(e.target.value) })} /></td>
                  <td style={c.td}><input style={c.inputNum} type="number" min={1} value={l.quantidade || ''} onChange={(e) => alterarLinha(i, { quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></td>
                  <td style={c.td}><button type="button" style={c.btnMini} onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))}>🗑️</button></td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td style={c.tdVazio} colSpan={9}>Sem volumes.</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" style={c.btnAdd} onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>+ Adicionar volume</button>
        <div style={c.totais}>
          <span style={c.pill}>Volumes: <strong>{totais.volumes}</strong></span>
          <span style={c.pill}>Peso líquido: <strong>{totais.pesoLiquido} kg</strong></span>
          <span style={c.pill}>Peso bruto: <strong>{totais.pesoBruto} kg</strong></span>
          <span style={c.pill}>Volume: <strong>{totais.volumeM3} m³</strong></span>
        </div>
      </section>

      {/* Versões geradas */}
      <section style={c.card}>
        <h2 style={c.h2}>Versões geradas</h2>
        {pdfs.length === 0 ? <p style={c.muted}>Ainda sem PDF gerado.</p> : (
          <ul style={c.lista}>
            {pdfs.map((p) => (
              <li key={p.id} style={c.item}>
                <span>Versão {p.versao} · {p.created_at.slice(0, 16).replace('T', ' ')}</span>
                <button style={c.btnSecundario} onClick={() => abrirVersao(p)}>Descarregar</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modal enviar por email */}
      {envAberto && (
        <div style={c.overlay} onClick={() => setEnvAberto(false)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}><strong>Enviar packing list por email</strong><button style={c.btnFechar} onClick={() => setEnvAberto(false)}>✕</button></div>
            <div style={c.grelha}>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Para (emails separados por vírgula)</span>
                <input style={c.input} value={envPara} placeholder="transitario@exemplo.com" onChange={(e) => setEnvPara(e.target.value)} />
              </label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Assunto</span>
                <input style={c.input} value={envAssunto} onChange={(e) => setEnvAssunto(e.target.value)} />
              </label>
              <label style={{ ...c.campo, gridColumn: '1 / -1' }}><span style={c.rot}>Mensagem (opcional)</span>
                <textarea style={{ ...c.input, minHeight: 70 }} value={envCorpo} onChange={(e) => setEnvCorpo(e.target.value)} />
              </label>
            </div>
            <p style={{ ...c.rot, marginTop: 8 }}>Anexa a última versão do PDF, enviado de comercial@all4laser.com.</p>
            <div style={c.modalAcoes}>
              <button style={c.btnSecundario} onClick={() => setEnvAberto(false)} disabled={aEnviar}>Cancelar</button>
              <button style={c.btnPrimario} onClick={enviarEmail} disabled={aEnviar}>{aEnviar ? 'A enviar…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0' },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  topoAcoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  card: { border: '1px solid #eee', borderRadius: 12, padding: 16, background: '#fff' },
  h2: { fontSize: 16, fontWeight: 700, margin: '0 0 12px' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  tabelaWrap: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px', borderBottom: '1px solid #eee', color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' },
  td: { padding: '4px 6px', verticalAlign: 'top' },
  tdVazio: { padding: 12, textAlign: 'center', color: 'var(--muted)' },
  inputMini: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: '100%', minWidth: 140 },
  inputNum: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, font: 'inherit', background: '#fff', width: 64 },
  btnMini: { border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', padding: '4px 8px' },
  btnAdd: { alignSelf: 'flex-start', marginTop: 8, padding: '6px 12px', border: '1px dashed #9ca3af', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600 },
  totais: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  pill: { fontSize: 13, background: '#F3F4F6', color: '#374151', borderRadius: 999, padding: '4px 12px' },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px', fontSize: 14 },
  muted: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  btnPrimario: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSecundario: { padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 50 },
  modal: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(560px, 100%)', marginTop: 24 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnFechar: { border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
  modalAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
}
