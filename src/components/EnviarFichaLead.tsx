'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { pesquisarEquipamentosStock, type EquipStockOpc } from '@/lib/notasEncomenda'
import { criarLink, urlLinkPublico, labelFichaOnline } from '@/lib/fichaProduto'
import { gerarFichaBlob, blobParaBase64 } from '@/lib/fichaProdutoGerar'
import type { IdiomaFicha } from '@/lib/fichaProdutoPdf'

// Enviar fichas de produto a partir de uma LEAD: pré-preenche o email da lead,
// permite escolher VÁRIOS equipamentos (em stock) e envia num só email, com
// registo ligado à lead (leadId).
const IDIOMAS: { v: IdiomaFicha; label: string }[] = [
  { v: 'pt', label: 'Português' }, { v: 'en', label: 'English' },
  { v: 'es', label: 'Español' }, { v: 'fr', label: 'Français' },
]
const GEN: Record<IdiomaFicha, string> = { pt: 'os equipamentos', en: 'the equipment', es: 'los equipos', fr: 'les équipements' }

function templateLead(idioma: IdiomaFicha, nomes: string[]): { assunto: string; corpo: string } {
  const termo = nomes.length === 1 ? nomes[0] : GEN[idioma]
  const assuntoNome = nomes.length === 1 ? nomes[0] : 'All4laser'
  switch (idioma) {
    case 'en': return { assunto: `All4laser – ${assuntoNome}`, corpo: `Hello,\n\nAs requested, please find attached the product sheet(s) for ${termo}. We remain at your disposal for any questions or to arrange a viewing.\n\nBest regards,\nAll4laser Sales Team` }
    case 'es': return { assunto: `All4laser – ${assuntoNome}`, corpo: `Buenas tardes,\n\nSegún su interés, adjuntamos la(s) ficha(s) de ${termo}. Quedamos a su disposición para cualquier aclaración o para concertar una visita.\n\nUn cordial saludo,\nEquipo Comercial All4laser` }
    case 'fr': return { assunto: `All4laser – ${assuntoNome}`, corpo: `Bonjour,\n\nComme convenu, veuillez trouver ci-joint la/les fiche(s) de ${termo}. Nous restons à votre disposition pour toute question ou pour organiser une visite.\n\nCordialement,\nÉquipe Commerciale All4laser` }
    default: return { assunto: `All4laser – ${assuntoNome}`, corpo: `Boa tarde,\n\nConforme o interesse demonstrado, seguem em anexo a(s) ficha(s) de ${termo}. Ficamos ao dispor para qualquer esclarecimento ou para agendar uma visita.\n\nCom os melhores cumprimentos,\nEquipa Comercial All4laser` }
  }
}

export default function EnviarFichaLead({ lead, onEnviado }: {
  lead: { id: string; nome: string | null; email: string | null }
  onEnviado?: () => void
}) {
  const { perfil, isAdministrativo } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [para, setPara] = useState('')
  const [cc, setCc] = useState('')
  const [idioma, setIdioma] = useState<IdiomaFicha>('pt')
  const [incluirPreco, setIncluirPreco] = useState(false)
  const [moeda, setMoeda] = useState('EUR')
  const [incluirGarantia, setIncluirGarantia] = useState(false)
  const [garantia, setGarantia] = useState('')
  const [incluirShipping, setIncluirShipping] = useState(false)
  const [incluirSn, setIncluirSn] = useState(false)
  const [incluirLink, setIncluirLink] = useState(true)
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [sel, setSel] = useState<EquipStockOpc[]>([])
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<EquipStockOpc[]>([])
  const [aEnviar, setAEnviar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function repor(id: IdiomaFicha, itens: EquipStockOpc[]) {
    const nomes = itens.map((s) => [s.marca, s.modelo].filter(Boolean).join(' ')).filter(Boolean)
    const t = templateLead(id, nomes)
    setAssunto(t.assunto); setCorpo(t.corpo)
  }
  function abrir() {
    setMsg(null); setOk(false); setSel([]); setBusca(''); setResultados([])
    setPara(lead.email ?? ''); repor(idioma, []); setAberto(true)
  }

  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    const q = busca
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.trim().length < 2) { setResultados([]); return }
    buscaTimer.current = setTimeout(async () => setResultados(await pesquisarEquipamentosStock(q)), 250)
    return () => { if (buscaTimer.current) clearTimeout(buscaTimer.current) }
  }, [busca])

  function adicionar(e: EquipStockOpc) {
    if (sel.some((s) => s.id === e.id)) return
    const novo = [...sel, e]
    setSel(novo); setBusca(''); setResultados([])
    repor(idioma, novo)
  }
  function remover(id: string) {
    const novo = sel.filter((s) => s.id !== id)
    setSel(novo); repor(idioma, novo)
  }
  function mudarIdioma(id: IdiomaFicha) { setIdioma(id); repor(id, sel) }

  async function enviar() {
    if (!para.includes('@')) { setMsg('Indica um email de destinatário válido.'); return }
    if (sel.length === 0) { setMsg('Escolhe pelo menos um equipamento.'); return }
    setAEnviar(true); setMsg(null); setOk(false)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) { setMsg('Sessão expirada — inicia sessão de novo.'); return }

      // Preço por equipamento (só se for para incluir)
      const precoMap = new Map<string, number | null>()
      if (incluirPreco) {
        const { data } = await supabase.from('equipamentos').select('id, preco_venda').in('id', sel.map((s) => s.id))
        for (const r of (data as { id: string; preco_venda: number | null }[] | null) ?? []) precoMap.set(r.id, r.preco_venda)
      }

      const itens: { equipamentoId: string; pdfBase64: string; filename: string; incluiuPreco: boolean; incluiuSnCompleto: boolean; linkId: string | null; moeda: string | null; incluiuGarantia: boolean; garantiaTexto: string | null; incluiuShipping: boolean }[] = []
      const linksTxt: string[] = []
      for (const e of sel) {
        const { blob, nomeFicheiro } = await gerarFichaBlob({
          equipamentoId: e.id, idioma, marca: e.marca, modelo: e.modelo, ano: e.ano,
          serialNumber: e.serial_number, precoVenda: precoMap.get(e.id) ?? null,
          incluirPreco, incluirSnCompleto: incluirSn,
          moeda, garantia: incluirGarantia ? garantia : null, shippingTraining: incluirShipping,
        })
        const pdfBase64 = await blobParaBase64(blob)
        let linkId: string | null = null
        if (incluirLink) {
          const { data: link } = await criarLink(e.id, { idioma, incluir_preco: incluirPreco, incluir_sn_completo: incluirSn }, perfil?.id ?? null)
          const l = link as { id: string; token: string } | null
          if (l) { linkId = l.id; linksTxt.push(`${[e.marca, e.modelo].filter(Boolean).join(' ')}: ${urlLinkPublico(l.token)}`) }
        }
        itens.push({
          equipamentoId: e.id, pdfBase64, filename: `${nomeFicheiro}.pdf`,
          incluiuPreco: incluirPreco, incluiuSnCompleto: incluirSn, linkId,
          moeda: incluirPreco ? moeda : null,
          incluiuGarantia: incluirGarantia, garantiaTexto: incluirGarantia ? garantia.trim() || null : null,
          incluiuShipping: incluirShipping,
        })
      }
      const corpoFinal = linksTxt.length ? `${corpo}\n\n${labelFichaOnline(idioma)}:\n${linksTxt.join('\n')}` : corpo

      const res = await fetch('/api/fichas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ para: para.trim(), nome: lead.nome, cc, assunto, corpo: corpoFinal, idioma, leadId: lead.id, itens }),
      })
      const j = await res.json()
      if (!j.ok) { setMsg('Erro: ' + (j.erro ?? 'não foi possível enviar.')); return }
      setOk(true); setMsg(`${itens.length} ficha(s) enviada(s) para ${para.trim()} ✓`)
      onEnviado?.()
    } catch (e) {
      setMsg('Erro: ' + (e instanceof Error ? e.message : 'falha ao enviar.'))
    } finally {
      setAEnviar(false)
    }
  }

  if (!isAdministrativo) return null

  return (
    <>
      <button type="button" style={s.btn} onClick={abrir}>✉️ Enviar ficha de produto</button>

      {aberto && (
        <div style={s.overlay} onClick={() => setAberto(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.cab}>
              <h2 style={s.titulo}>Enviar ficha(s) à lead</h2>
              <button onClick={() => setAberto(false)} style={s.fechar} aria-label="Fechar">✕</button>
            </div>
            {msg && <div style={ok ? s.ok : s.erro}>{msg}</div>}

            <label style={s.rot}>Equipamentos (em stock)</label>
            <input style={s.input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar por modelo ou serial…" />
            {resultados.length > 0 && (
              <div style={s.resultados}>
                {resultados.map((r) => (
                  <button key={r.id} style={s.resItem} onClick={() => adicionar(r)}>
                    {[r.marca, r.modelo].filter(Boolean).join(' ')} · {r.serial_number ?? 's/ serial'}{r.ano ? ` · ${r.ano}` : ''}
                  </button>
                ))}
              </div>
            )}
            {sel.length > 0 && (
              <div style={s.chips}>
                {sel.map((e) => (
                  <span key={e.id} style={s.chip}>
                    {[e.marca, e.modelo].filter(Boolean).join(' ')}
                    <button style={s.chipX} onClick={() => remover(e.id)} aria-label="Remover">✕</button>
                  </span>
                ))}
              </div>
            )}

            <div style={s.grelha}>
              <label style={s.campo}><span style={s.rot}>Para (email)</span>
                <input style={s.input} value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@exemplo.com" />
              </label>
              <label style={s.campo}><span style={s.rot}>CC <span style={s.opc}>(opcional)</span></span>
                <input style={s.input} value={cc} onChange={(e) => setCc(e.target.value)} />
              </label>
              <label style={s.campo}><span style={s.rot}>Idioma</span>
                <select style={s.input} value={idioma} onChange={(e) => mudarIdioma(e.target.value as IdiomaFicha)}>
                  {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
                </select>
              </label>
            </div>

            <div style={s.checks}>
              <label style={s.check}><input type="checkbox" checked={incluirLink} onChange={(e) => setIncluirLink(e.target.checked)} /> Incluir link online</label>
              <label style={s.check}><input type="checkbox" checked={incluirSn} onChange={(e) => setIncluirSn(e.target.checked)} /> S/N completo</label>
            </div>

            <div style={s.condicoes}>
              <div style={s.condTitulo}>Condições (aplicam-se a todas as fichas deste envio)</div>
              <div style={s.checks}>
                <label style={s.check}><input type="checkbox" checked={incluirPreco} onChange={(e) => setIncluirPreco(e.target.checked)} /> Incluir valor</label>
                {incluirPreco && (
                  <select style={s.moeda} value={moeda} onChange={(e) => setMoeda(e.target.value)}>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                )}
              </div>
              <div style={s.checks}>
                <label style={s.check}><input type="checkbox" checked={incluirGarantia} onChange={(e) => setIncluirGarantia(e.target.checked)} /> Incluir garantia</label>
                {incluirGarantia && (
                  <input style={{ ...s.input, maxWidth: 200 }} value={garantia} placeholder="Ex.: 6 meses" onChange={(e) => setGarantia(e.target.value)} />
                )}
              </div>
              <label style={s.check}><input type="checkbox" checked={incluirShipping} onChange={(e) => setIncluirShipping(e.target.checked)} /> Incluir &ldquo;Envio e formação incluídos&rdquo;</label>
            </div>

            <label style={s.campo}><span style={s.rot}>Assunto</span>
              <input style={s.input} value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </label>
            <label style={s.campo}><span style={s.rot}>Mensagem</span>
              <textarea style={{ ...s.input, minHeight: 120, resize: 'vertical' }} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
            </label>
            <p style={s.dica}>Uma ficha PDF por equipamento vai em anexo{incluirLink ? '; os links online são acrescentados no fim' : ''}. Enviado de comercial@all4laser.com.</p>

            <div style={s.acoes}>
              <button style={s.btnSec} onClick={() => setAberto(false)}>{ok ? 'Fechar' : 'Cancelar'}</button>
              {!ok && <button style={s.btnPrim} disabled={aEnviar || sel.length === 0} onClick={enviar}>{aEnviar ? 'A enviar…' : `Enviar${sel.length ? ` (${sel.length})` : ''}`}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', width: '100%' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  resultados: { border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  resItem: { textAlign: 'left', background: '#fff', border: 'none', borderBottom: '1px solid var(--border)', padding: '9px 11px', cursor: 'pointer', fontSize: 13.5, font: 'inherit' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { display: 'inline-flex', gap: 6, alignItems: 'center', background: '#DBEAFE', color: '#1E40AF', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 600 },
  chipX: { background: 'none', border: 'none', color: '#1E40AF', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 4 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  checks: { display: 'flex', gap: 16, flexWrap: 'wrap', margin: '4px 0', alignItems: 'center' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 },
  condicoes: { border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  condTitulo: { fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  moeda: { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit' },
  dica: { fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' },
  acoes: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  ok: { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 12px', fontSize: 13.5 },
}
