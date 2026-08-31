'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import {
  criarLink, urlLinkPublico, emailFichaDefault, labelFichaOnline,
} from '@/lib/fichaProduto'
import { gerarFichaBlob, blobParaBase64 } from '@/lib/fichaProdutoGerar'
import type { IdiomaFicha } from '@/lib/fichaProdutoPdf'
import AvisoDescricaoModelo from '@/components/AvisoDescricaoModelo'

// Enviar a ficha de produto por email (Gmail comercial@) a partir do
// equipamento. Gera o PDF no cliente, cria (opcional) o link partilhável e
// envia via /api/fichas/enviar, que regista o envio.
const IDIOMAS: { v: IdiomaFicha; label: string }[] = [
  { v: 'pt', label: 'Português' }, { v: 'en', label: 'English' },
  { v: 'es', label: 'Español' }, { v: 'fr', label: 'Français' },
]

export default function EnviarFichaProduto({
  equipamentoId, marca, modelo, ano, serialNumber, precoVenda,
  emailInicial, nomeInicial, leadId, clienteId, onEnviado,
}: {
  equipamentoId: string
  marca: string | null
  modelo: string | null
  ano: string | null
  serialNumber: string | null
  precoVenda: number | null
  emailInicial?: string
  nomeInicial?: string
  leadId?: string | null
  clienteId?: string | null
  onEnviado?: () => void
}) {
  const { perfil } = useAuth()
  const nomeEquip = [marca, modelo].filter(Boolean).join(' ') + (ano ? ` (${ano})` : '')
  const [aberto, setAberto] = useState(false)
  const [para, setPara] = useState(emailInicial ?? '')
  const [nome, setNome] = useState(nomeInicial ?? '')
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
  const [aEnviar, setAEnviar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function preencherTemplate(id: IdiomaFicha) {
    const d = emailFichaDefault(id, nomeEquip)
    setAssunto(d.assunto); setCorpo(d.corpo)
  }
  function abrir() {
    setMsg(null); setOk(false); setPara(emailInicial ?? ''); setNome(nomeInicial ?? '')
    preencherTemplate(idioma); setAberto(true)
  }
  function mudarIdioma(id: IdiomaFicha) { setIdioma(id); preencherTemplate(id) }

  async function enviar() {
    if (!para.includes('@')) { setMsg('Indica um email de destinatário válido.'); return }
    setAEnviar(true); setMsg(null); setOk(false)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) { setMsg('Sessão expirada — inicia sessão de novo.'); return }

      const { blob, nomeFicheiro } = await gerarFichaBlob({
        equipamentoId, idioma, marca, modelo, ano, serialNumber, precoVenda,
        incluirPreco, incluirSnCompleto: incluirSn,
        moeda, garantia: incluirGarantia ? garantia : null, shippingTraining: incluirShipping,
      })
      const pdfBase64 = await blobParaBase64(blob)

      let linkId: string | null = null
      let corpoFinal = corpo
      if (incluirLink) {
        const { data: link } = await criarLink(equipamentoId, { idioma, incluir_preco: incluirPreco, incluir_sn_completo: incluirSn }, perfil?.id ?? null)
        const l = link as { id: string; token: string } | null
        if (l) { linkId = l.id; corpoFinal = `${corpo}\n\n${labelFichaOnline(idioma)}: ${urlLinkPublico(l.token)}` }
      }

      const res = await fetch('/api/fichas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          para: para.trim(), nome: nome.trim() || null, cc, assunto, corpo: corpoFinal, idioma,
          leadId: leadId ?? null, clienteId: clienteId ?? null,
          itens: [{
            equipamentoId, pdfBase64, filename: `${nomeFicheiro}.pdf`,
            incluiuPreco: incluirPreco, incluiuSnCompleto: incluirSn, linkId,
            moeda: incluirPreco ? moeda : null,
            incluiuGarantia: incluirGarantia, garantiaTexto: incluirGarantia ? garantia.trim() || null : null,
            incluiuShipping: incluirShipping,
          }],
        }),
      })
      const j = await res.json()
      if (!j.ok) { setMsg('Erro: ' + (j.erro ?? 'não foi possível enviar.')); return }
      setOk(true); setMsg(`Ficha enviada para ${para.trim()} ✓`)
      onEnviado?.()
    } catch (e) {
      setMsg('Erro: ' + (e instanceof Error ? e.message : 'falha ao enviar.'))
    } finally {
      setAEnviar(false)
    }
  }

  return (
    <>
      <button type="button" style={s.btn} onClick={abrir}>✉️ Enviar ficha</button>

      {aberto && (
        <div style={s.overlay} onClick={() => setAberto(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.cab}>
              <h2 style={s.titulo}>Enviar ficha de produto</h2>
              <button onClick={() => setAberto(false)} style={s.fechar} aria-label="Fechar">✕</button>
            </div>
            {msg && <div style={ok ? s.ok : s.erro}>{msg}</div>}

            <div style={s.grelha}>
              <label style={s.campo}><span style={s.rot}>Para (email)</span>
                <input style={s.input} value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@exemplo.com" />
              </label>
              <label style={s.campo}><span style={s.rot}>Nome <span style={s.opc}>(opcional)</span></span>
                <input style={s.input} value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
            </div>
            <label style={s.campo}><span style={s.rot}>CC <span style={s.opc}>(opcional, separar por vírgula)</span></span>
              <input style={s.input} value={cc} onChange={(e) => setCc(e.target.value)} />
            </label>

            <div style={s.grelha}>
              <label style={s.campo}><span style={s.rot}>Idioma</span>
                <select style={s.input} value={idioma} onChange={(e) => mudarIdioma(e.target.value as IdiomaFicha)}>
                  {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
                </select>
              </label>
            </div>

            <AvisoDescricaoModelo marca={marca} modelo={modelo} />

            <div style={s.checks}>
              <label style={s.check}><input type="checkbox" checked={incluirLink} onChange={(e) => setIncluirLink(e.target.checked)} /> Incluir link online</label>
              <label style={s.check}><input type="checkbox" checked={incluirSn} onChange={(e) => setIncluirSn(e.target.checked)} /> S/N completo</label>
            </div>

            <div style={s.condicoes}>
              <div style={s.condTitulo}>Condições (opcional)</div>
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
              <textarea style={{ ...s.input, minHeight: 130, resize: 'vertical' }} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
            </label>
            <p style={s.dica}>A ficha em PDF vai em anexo{incluirLink ? '; o link online é acrescentado no fim da mensagem' : ''}. Enviado de comercial@all4laser.com.</p>

            <div style={s.acoes}>
              <button style={s.btnSec} onClick={() => setAberto(false)}>{ok ? 'Fechar' : 'Cancelar'}</button>
              {!ok && <button style={s.btnPrim} disabled={aEnviar} onClick={enviar}>{aEnviar ? 'A enviar…' : 'Enviar'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  cab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: 4 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
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
