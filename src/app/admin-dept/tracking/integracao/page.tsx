'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  lerIntegracaoTracking, guardarIntegracaoTracking, contarEnviosAuto,
  type IntegracaoTracking,
} from '@/lib/tracking'

// Painel de estado da integração de tracking automático (Ship24).
// Mostra: cron/webhook, envios a seguir, quota consumida vs limite, erros.
// Leitura por qualquer staff; ligar/desligar e mudar plano só admin/administrativo.

export default function IntegracaoTrackingPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [integ, setInteg] = useState<IntegracaoTracking | null>(null)
  const [enviosAuto, setEnviosAuto] = useState(0)
  const [aCarregar, setACarregar] = useState(true)
  const [aSincronizar, setASincronizar] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    const [i, n] = await Promise.all([lerIntegracaoTracking(), contarEnviosAuto()])
    setInteg(i); setEnviosAuto(n); setACarregar(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) }, [toast])

  async function alternarAtivo() {
    if (!integ) return
    const { error } = await guardarIntegracaoTracking({ ativo: !integ.ativo })
    if (error) { setToast('Erro: ' + error.message); return }
    setToast(integ.ativo ? 'Integração desligada.' : 'Integração ligada.'); carregar()
  }
  async function mudarPlano(plano: string, quota_limite: number) {
    const { error } = await guardarIntegracaoTracking({ plano, quota_limite })
    if (error) { setToast('Erro: ' + error.message); return }
    setToast('Plano atualizado.'); carregar()
  }
  async function sincronizarAgora() {
    setASincronizar(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setToast('Sessão expirada — volta a entrar.'); return }
      const resp = await fetch('/api/tracking/sincronizar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const r = await resp.json()
      if (!resp.ok || r.ok === false) { setToast('Erro: ' + (r.erro ?? `HTTP ${resp.status}`)); return }
      const cr = r.registo?.criados ?? 0, at = r.reconc?.atualizados ?? 0
      setToast(`Sincronizado ✓ — ${cr} novo(s) tracker(s), ${at} atualização(ões).`)
      carregar()
    } catch (e) {
      setToast('Erro: ' + (e instanceof Error ? e.message : 'falha na sincronização'))
    } finally {
      setASincronizar(false)
    }
  }

  if (perfilCarregado && !isAdministrativo) {
    return <main style={c.page}><p style={c.muted}>Sem acesso à Área Administrativa.</p></main>
  }
  if (aCarregar || !integ) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  const quotaPct = integ.quota_limite > 0 ? Math.min(100, Math.round((integ.quota_consumida / integ.quota_limite) * 100)) : 0
  const quotaEsgotada = integ.quota_consumida >= integ.quota_limite
  const alertaFalhas = integ.falhas_consecutivas >= 2

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/tracking" style={c.voltar}>← Tracking</Link>
          <h1 style={c.titulo}>⚡ Integração de tracking automático</h1>
          <p style={c.sub}>Fornecedor: Ship24 · atualizações por webhook + reconciliação diária.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={c.btnSync} onClick={sincronizarAgora} disabled={aSincronizar || !integ.ativo} title={!integ.ativo ? 'Liga a integração primeiro' : 'Regista os envios com ⚡ e atualiza os estados agora'}>
            {aSincronizar ? 'A sincronizar…' : '↻ Sincronizar agora'}
          </button>
          <button style={integ.ativo ? c.btnOn : c.btnOff} onClick={alternarAtivo} disabled={!isAdministrativo}>
            {integ.ativo ? 'Integração LIGADA' : 'Integração desligada'}
          </button>
        </div>
      </div>

      {(alertaFalhas || quotaEsgotada) && (
        <div style={c.alerta}>
          {alertaFalhas && <div>⚠ O cron falhou {integ.falhas_consecutivas}× seguidas — verifica a SHIP24_API_KEY e os logs.</div>}
          {quotaEsgotada && <div>⚠ Quota do plano esgotada ({integ.quota_consumida}/{integ.quota_limite}). Novos envios ficam em modo manual até renovar/subscrever.</div>}
        </div>
      )}

      <div style={c.grelha}>
        <div style={c.cartao}>
          <div style={c.cartaoRot}>Quota ({integ.plano})</div>
          <div style={c.cartaoVal}>{integ.quota_consumida} / {integ.quota_limite}</div>
          <div style={c.barra}><div style={{ ...c.barraInner, width: `${quotaPct}%`, background: quotaEsgotada ? '#B91C1C' : '#2563EB' }} /></div>
          <div style={c.cartaoMeta}>Período desde {integ.quota_periodo_inicio ?? '—'} (reset mensal)</div>
        </div>

        <div style={c.cartao}>
          <div style={c.cartaoRot}>Envios a seguir</div>
          <div style={c.cartaoVal}>{enviosAuto}</div>
          <div style={c.cartaoMeta}>com seguimento automático ligado</div>
        </div>

        <div style={c.cartao}>
          <div style={c.cartaoRot}>Último cron</div>
          <div style={c.cartaoVal}>{integ.ultimo_cron_em ? new Date(integ.ultimo_cron_em).toLocaleString('pt-PT') : '—'}</div>
          <div style={c.cartaoMeta}>{integ.ultimo_cron_ok === null ? 'ainda não correu' : integ.ultimo_cron_ok ? '✓ sem erros' : `✗ ${integ.ultimo_cron_erro ?? 'erro'}`}</div>
        </div>

        <div style={c.cartao}>
          <div style={c.cartaoRot}>Último webhook</div>
          <div style={c.cartaoVal}>{integ.ultimo_webhook_em ? new Date(integ.ultimo_webhook_em).toLocaleString('pt-PT') : '—'}</div>
          <div style={c.cartaoMeta}>evento recebido do Ship24</div>
        </div>
      </div>

      <div style={c.plano}>
        <span style={c.cartaoRot}>Plano</span>
        <button style={integ.plano === 'free' ? c.chipOn : c.chip} onClick={() => mudarPlano('free', 10)} disabled={!isAdministrativo}>Free (10/mês)</button>
        <button style={integ.plano === 'paid' ? c.chipOn : c.chip} onClick={() => mudarPlano('paid', 1000)} disabled={!isAdministrativo}>Pago (1000/mês)</button>
      </div>

      <p style={c.nota}>
        Para a integração funcionar, a <code>SHIP24_API_KEY</code> e a <code>SHIP24_WEBHOOK_SECRET</code> têm de estar
        configuradas no Vercel, e o URL do webhook <code>/api/webhooks/ship24</code> registado no dashboard do Ship24.
        Envios de transportadoras sem cobertura Ship24 ficam em modo manual, sem erros.
      </p>

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 980, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 0' },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  btnOn: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#065F46', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnOff: { padding: '9px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', color: '#374151', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSync: { padding: '9px 16px', border: '1px solid #2563EB', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  alerta: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 },
  cartao: { border: '1px solid #eee', borderRadius: 12, padding: 14, background: '#fff' },
  cartaoRot: { fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  cartaoVal: { fontSize: 22, fontWeight: 800, color: '#111827', margin: '6px 0' },
  cartaoMeta: { fontSize: 12, color: 'var(--muted)' },
  barra: { height: 8, background: '#F3F4F6', borderRadius: 999, overflow: 'hidden', margin: '6px 0' },
  barraInner: { height: '100%', borderRadius: 999 },
  plano: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  chip: { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 999, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13 },
  chipOn: { padding: '6px 12px', border: '1px solid #111827', borderRadius: 999, background: '#111827', color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700 },
  nota: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, background: '#F9FAFB', border: '1px solid #eee', borderRadius: 10, padding: 12 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
