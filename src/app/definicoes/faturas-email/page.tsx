'use client'

// Administração do template de email das faturas de aluguer (único, PT).
// Acesso: admin + financeiro. Placeholders {chave} preenchidos no envio.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PLACEHOLDERS_FATURA, type FaturaEmailTemplate } from '@/lib/faturaEmailRender'

export default function TemplatesFaturaPage() {
  const { isFinanceiro, perfilCarregado } = useAuth()
  const podeAceder = isFinanceiro   // admin/financeiro (alinha com a RLS)
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [incluirAssinatura, setIncluirAssinatura] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data } = await supabase.from('alugueres_email_templates').select('*').eq('chave', 'normal').maybeSingle()
    const t = data as FaturaEmailTemplate | null
    if (t) { setAssunto(t.assunto_template); setCorpo(t.corpo_template); setIncluirAssinatura(t.incluir_assinatura ?? true) }
    setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (podeAceder) carregar() }, [podeAceder, carregar])

  async function guardar() {
    setMsg(null)
    setAGuardar(true)
    const { error } = await supabase.from('alugueres_email_templates')
      .update({ assunto_template: assunto, corpo_template: corpo, incluir_assinatura: incluirAssinatura, updated_at: new Date().toISOString() })
      .eq('chave', 'normal')
    setAGuardar(false)
    if (error) { setMsg('Erro ao guardar: ' + error.message); return }
    setMsg('Template guardado ✓ — o próximo envio usa esta versão.')
    carregar()
  }

  if (perfilCarregado && !podeAceder) {
    return <main style={c.page}><p style={c.muted}>Sem acesso. Esta área é para admin/financeiro.</p></main>
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <Link href="/definicoes" style={c.voltar}>← Definições</Link>
          <h1 style={c.titulo}>Templates de email — Faturas de aluguer</h1>
        </div>
        <Link href="/alugueres/lista" style={c.link}>Ir para Alugueres →</Link>
      </div>

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          <label style={c.label}>Assunto</label>
          <input style={c.input} value={assunto} onChange={(e) => setAssunto(e.target.value)} />

          <label style={c.label}>Corpo</label>
          <textarea style={{ ...c.input, minHeight: 300, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }} value={corpo} onChange={(e) => setCorpo(e.target.value)} />

          <label style={{ ...c.toggle }}>
            <input type="checkbox" checked={incluirAssinatura} onChange={(e) => setIncluirAssinatura(e.target.checked)} />
            <span>Acrescentar a assinatura do Gmail no fim do email</span>
          </label>
          <span style={c.toggleAjuda}>
            Desliga isto se o texto do template já fecha com a sua própria assinatura (ex.: “Dep. Financeiro da All4laser”), para não ficarem duas assinaturas empilhadas.
          </span>

          <div style={c.placeholders}>
            <span style={c.phTitulo}>Placeholders disponíveis (escreve {'{'}chave{'}'}):</span>
            <div style={c.phLista}>
              {PLACEHOLDERS_FATURA.map((p) => (
                <span key={p.chave} style={c.ph} title={p.desc}>{`{${p.chave}}`}</span>
              ))}
            </div>
          </div>

          {msg && <div style={c.msg}>{msg}</div>}

          <div style={c.acoes}>
            <button style={c.btnPrimario} onClick={guardar} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Guardar template'}</button>
          </div>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  link: { color: 'var(--primary)', textDecoration: 'none', fontSize: 14 },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--primary)', margin: '4px 0' },
  muted: { color: 'var(--muted)', padding: 20 },
  tabs: { display: 'flex', gap: 8, marginBottom: 12 },
  tab: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontWeight: 600 },
  tabAtiva: { padding: '8px 16px', border: 'none', borderRadius: 8, background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 700 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4, display: 'block' },
  toggle: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  toggleAjuda: { display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 4 },
  input: { width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: 'var(--background)', color: 'var(--foreground)' },
  placeholders: { marginTop: 14, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 },
  phTitulo: { fontSize: 13, color: 'var(--muted)', fontWeight: 600 },
  phLista: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ph: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 6, padding: '2px 8px' },
  msg: { marginTop: 12, padding: 10, background: '#E6F7F1', color: '#065F46', borderRadius: 8, fontSize: 14 },
  acoes: { display: 'flex', justifyContent: 'flex-end', marginTop: 16 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
}
