'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { listarTemplates, atualizarTemplate, obterSettings, atualizarSettings } from '@/lib/freight'
import { remetenteValido, type FreightEmailTemplate, type IdiomaFreight } from '@/types/freight'
import {
  obterConfigAssinatura, atualizarAssinaturaDoGmail, guardarAssinaturaManual, type EmailConfig,
  obterAssinaturaRemetente, atualizarAssinaturaGmailRemetente, guardarAssinaturaManualRemetente, type EmailAssinatura,
} from '@/lib/emailAssinaturaClient'

const PLACEHOLDERS = ['saudacao', 'tipo', 'origem', 'destino', 'datas', 'tabela_volumes', 'extras', 'prazo_resposta']
const PLACEHOLDERS_AGRAD = ['saudacao', 'referencia']

export default function TemplatesPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [templates, setTemplates] = useState<FreightEmailTemplate[]>([])
  const [dias, setDias] = useState(3)
  const [remetentesTexto, setRemetentesTexto] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [assinatura, setAssinatura] = useState<EmailConfig | null>(null)
  const [assinaturaManual, setAssinaturaManual] = useState('')
  const [sigOcupado, setSigOcupado] = useState(false)
  // Assinaturas por remetente.
  const [remetentesLista, setRemetentesLista] = useState<string[]>([])
  const [assinRem, setAssinRem] = useState<Record<string, EmailAssinatura | null>>({})
  const [assinRemManual, setAssinRemManual] = useState<Record<string, string>>({})
  const [sigRemOcupado, setSigRemOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setTemplates(await listarTemplates())
    const st = await obterSettings()
    const lista = st?.remetentes ?? []
    if (st) { setDias(st.dias_uteis_alerta); setRemetentesTexto(lista.join(', ')) }
    setRemetentesLista(lista)
    const r = await obterConfigAssinatura()
    if (r.ok && r.config) { setAssinatura(r.config); setAssinaturaManual(r.config.assinatura_manual_html ?? '') }
    // Assinatura de cada remetente.
    const pares = await Promise.all(lista.map(async (rem) => [rem, (await obterAssinaturaRemetente(rem)).config ?? null] as const))
    const mapa: Record<string, EmailAssinatura | null> = {}
    const manual: Record<string, string> = {}
    for (const [rem, cfg] of pares) { mapa[rem] = (cfg as EmailAssinatura | null); manual[rem] = (cfg as EmailAssinatura | null)?.assinatura_manual_html ?? '' }
    setAssinRem(mapa); setAssinRemManual(manual)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  function alterar(idioma: IdiomaFreight, patch: Partial<FreightEmailTemplate>) {
    setTemplates((ts) => ts.map((t) => (t.idioma === idioma ? { ...t, ...patch } : t)))
  }
  async function guardarTemplate(t: FreightEmailTemplate) {
    const { error } = await atualizarTemplate(t.idioma, t.assunto_template, t.corpo_template, { agrad_assunto: t.agrad_assunto, agrad_corpo: t.agrad_corpo })
    setToast(error ? 'Erro: ' + error.message : `Template ${t.idioma.toUpperCase()} guardado.`)
  }

  async function atualizarRemDoGmail(rem: string) {
    setSigRemOcupado(rem)
    const r = await atualizarAssinaturaGmailRemetente(rem)
    setSigRemOcupado(null)
    setToast(r.ok ? `Assinatura de ${rem} atualizada do Gmail.` : 'Erro: ' + (r.erro ?? ''))
    if (r.ok) await carregar()
  }
  async function guardarRemManual(rem: string) {
    setSigRemOcupado(rem)
    const r = await guardarAssinaturaManualRemetente(rem, assinRemManual[rem] ?? '')
    setSigRemOcupado(null)
    setToast(r.ok ? `Assinatura manual de ${rem} guardada.` : 'Erro: ' + (r.erro ?? ''))
    if (r.ok) await carregar()
  }
  async function guardarConfig() {
    const remetentes = remetentesTexto.split(/[,;\n]/).map((e) => e.trim()).filter(Boolean)
    const invalidos = remetentes.filter((e) => !remetenteValido(e))
    if (invalidos.length) { setToast('Só emails @all4laser.com: ' + invalidos.join(', ')); return }
    if (remetentes.length === 0) { setToast('Indica pelo menos um remetente.'); return }
    const { error } = await atualizarSettings(dias, remetentes)
    setToast(error ? 'Erro: ' + error.message : 'Configuração guardada.')
  }

  async function atualizarDoGmail() {
    setSigOcupado(true)
    const r = await atualizarAssinaturaDoGmail()
    setSigOcupado(false)
    setToast(r.ok ? 'Assinatura atualizada a partir do Gmail.' : 'Erro: ' + (r.erro ?? ''))
    if (r.ok) await carregar()
  }
  async function guardarManual() {
    setSigOcupado(true)
    const r = await guardarAssinaturaManual(assinaturaManual)
    setSigOcupado(false)
    setToast(r.ok ? 'Assinatura manual guardada.' : 'Erro: ' + (r.erro ?? ''))
    if (r.ok) await carregar()
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/admin-dept/cotacoes-transporte" style={c.voltar}>← Cotações de transporte</Link>
        <h1 style={c.titulo}>Templates & configuração</h1>
      </div>

      <p style={c.dica}>Placeholders disponíveis: {PLACEHOLDERS.map((p) => <code key={p} style={c.code}>{`{{${p}}}`}</code>)}</p>

      {templates.map((t) => (
        <section key={t.idioma} style={c.card}>
          <h2 style={c.h2}>Template {t.idioma === 'pt' ? 'Português' : 'Inglês'}</h2>
          <label style={c.campo}><span style={c.rot}>Assunto</span>
            <input style={c.input} value={t.assunto_template} onChange={(e) => alterar(t.idioma, { assunto_template: e.target.value })} />
          </label>
          <label style={c.campo}><span style={c.rot}>Corpo</span>
            <textarea style={c.textarea} value={t.corpo_template} onChange={(e) => alterar(t.idioma, { corpo_template: e.target.value })} />
          </label>

          <div style={c.sep} />
          <p style={c.dica}>Email de <strong>agradecimento aos não escolhidos</strong> (nunca menciona o vencedor nem valores). Placeholders: {PLACEHOLDERS_AGRAD.map((p) => <code key={p} style={c.code}>{`{{${p}}}`}</code>)}</p>
          <label style={c.campo}><span style={c.rot}>Assunto do agradecimento</span>
            <input style={c.input} value={t.agrad_assunto ?? ''} onChange={(e) => alterar(t.idioma, { agrad_assunto: e.target.value })} />
          </label>
          <label style={c.campo}><span style={c.rot}>Corpo do agradecimento</span>
            <textarea style={c.textarea} value={t.agrad_corpo ?? ''} onChange={(e) => alterar(t.idioma, { agrad_corpo: e.target.value })} />
          </label>

          <div style={c.acoes}><button style={c.btnPrimario} onClick={() => guardarTemplate(t)}>Guardar template</button></div>
        </section>
      ))}

      <section style={c.card}>
        <h2 style={c.h2}>Configuração</h2>
        <label style={c.campo}><span style={c.rot}>Alertar quando passarem X dias úteis sem respostas</span>
          <input style={{ ...c.input, width: 120 }} type="number" min={1} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value)))} />
        </label>
        <label style={c.campo}><span style={c.rot}>Remetentes disponíveis (emails @all4laser.com, separados por vírgula)</span>
          <input style={c.input} value={remetentesTexto} placeholder="comercial@all4laser.com, andreia.fernandes@all4laser.com, vanessa.tavares@all4laser.com" onChange={(e) => setRemetentesTexto(e.target.value)} />
          <span style={c.dica}>Aparecem no seletor “Enviar de” de cada pedido. Só contas @all4laser.com (o envio personifica a conta).</span>
        </label>
        <div style={c.acoes}><button style={c.btnPrimario} onClick={guardarConfig}>Guardar configuração</button></div>
      </section>

      <section style={c.card}>
        <h2 style={c.h2}>Assinatura dos emails</h2>
        <p style={c.dica}>Assinatura única usada no fim de todos os emails enviados pela app (cotações, fichas, faturas de aluguer, avisos). Fonte atual: <strong>{assinatura?.fonte === 'gmail' ? 'Gmail (comercial@)' : 'manual'}</strong>{assinatura?.atualizada_em ? ` · atualizada ${new Date(assinatura.atualizada_em).toLocaleString('pt-PT')}` : ''}.</p>

        <div style={c.sigPreviewRot}><span style={c.rot}>Pré-visualização (em uso)</span></div>
        <div style={c.sigPreview} dangerouslySetInnerHTML={{ __html: assinatura?.assinatura_html || '<span style="color:#999">(vazia)</span>' }} />

        <div style={c.acoes}>
          <button style={c.btnSec} disabled={sigOcupado} onClick={atualizarDoGmail}>{sigOcupado ? 'A obter…' : '↻ Atualizar do Gmail'}</button>
        </div>
        <p style={c.dica}>Se o botão der erro de permissão, é preciso acrescentar o scope <code style={c.code}>gmail.settings.basic</code> à delegação da Service Account no Google Admin. Em alternativa, cola aqui o HTML da assinatura:</p>
        <textarea style={c.textarea} value={assinaturaManual} placeholder="<div>...HTML da assinatura...</div>" onChange={(e) => setAssinaturaManual(e.target.value)} />
        <div style={c.acoes}><button style={c.btnPrimario} disabled={sigOcupado} onClick={guardarManual}>Guardar assinatura manual</button></div>
      </section>

      <section style={c.card}>
        <h2 style={c.h2}>Assinatura por remetente</h2>
        <p style={c.dica}>Cada conta pode ter a SUA assinatura. Quando um pedido é enviado por uma conta, usa-se a assinatura dessa conta; se não estiver definida, usa-se a assinatura geral acima.</p>
        {remetentesLista.length === 0 && <p style={c.dica}>Define os remetentes na secção “Configuração” para aparecerem aqui.</p>}
        {remetentesLista.map((rem) => {
          const cfg = assinRem[rem]
          return (
            <div key={rem} style={c.remBloco}>
              <div style={c.remTopo}>
                <strong>{rem}</strong>
                <span style={c.dica}>{cfg ? `fonte: ${cfg.fonte === 'gmail' ? 'Gmail' : 'manual'}${cfg.atualizada_em ? ` · ${new Date(cfg.atualizada_em).toLocaleDateString('pt-PT')}` : ''}` : 'sem assinatura própria'}</span>
              </div>
              <div style={c.sigPreview} dangerouslySetInnerHTML={{ __html: cfg?.assinatura_html || '<span style="color:#999">(usa a assinatura geral)</span>' }} />
              <textarea style={c.textareaMini} placeholder="<div>...HTML da assinatura desta conta...</div>" value={assinRemManual[rem] ?? ''} onChange={(e) => setAssinRemManual((m) => ({ ...m, [rem]: e.target.value }))} />
              <div style={c.remAcoes}>
                <button style={c.btnSec} disabled={sigRemOcupado === rem} onClick={() => atualizarRemDoGmail(rem)}>{sigRemOcupado === rem ? 'A obter…' : '↻ Do Gmail'}</button>
                <button style={c.btnPrimario} disabled={sigRemOcupado === rem} onClick={() => guardarRemManual(rem)}>Guardar</button>
              </div>
            </div>
          )
        })}
      </section>

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', flexDirection: 'column', gap: 4 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  dica: { fontSize: 13, color: 'var(--muted)' },
  code: { background: '#F3F4F6', borderRadius: 4, padding: '1px 5px', marginRight: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 },
  card: { border: '1px solid #eee', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 },
  h2: { fontSize: 16, fontWeight: 700, margin: 0 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  textarea: { padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', minHeight: 220, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 },
  acoes: { display: 'flex', justifyContent: 'flex-end' },
  btnPrimario: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSec: { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontWeight: 600, cursor: 'pointer', font: 'inherit' },
  sigPreviewRot: { marginTop: 4 },
  sigPreview: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fafafa', minHeight: 40 },
  sep: { height: 1, background: '#eee', margin: '4px 0' },
  textareaMini: { padding: '10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', minHeight: 90, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 },
  remBloco: { border: '1px solid #eee', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fcfcfd' },
  remTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  remAcoes: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
