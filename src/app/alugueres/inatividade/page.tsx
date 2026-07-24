'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import {
  obterSettings, guardarSettings, listarInatividade, nivelDe, silenciado,
  guardarNota, silenciarCliente, reativarCliente, arquivarCliente, formatarData,
  NIVEL_INFO, type InatividadeSettings, type LinhaInatividade, type Nivel,
} from '@/lib/inatividade'

type Filtro = 'todos' | 'atencao' | 'critico' | 'silenciados'

export default function InatividadePage() {
  const { perfil } = useAuth()
  const user = { id: perfil?.id ?? null, nome: perfil?.nome ?? null }
  const [settings, setSettings] = useState<InatividadeSettings | null>(null)
  const [linhas, setLinhas] = useState<LinhaInatividade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [aTrabalhar, setATrabalhar] = useState<string | null>(null)
  const [abrirSettings, setAbrirSettings] = useState(false)

  const carregar = useCallback(async () => {
    const [s, l] = await Promise.all([obterSettings(), listarInatividade()])
    setSettings(s); setLinhas(l); setCarregando(false)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const enriquecidas = useMemo(() => {
    if (!settings) return []
    return linhas.map((l) => ({
      ...l,
      nivel: nivelDe(l.dias_inatividade, settings) as Nivel,
      mudo: silenciado(l.silenciado_ate),
    })).filter((l) => l.nivel !== 'ok') // só quem já está em alerta (>= atenção)
  }, [linhas, settings])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return enriquecidas.filter((l) => {
      if (filtro === 'silenciados' && !l.mudo) return false
      if (filtro === 'atencao' && (l.nivel !== 'atencao' || l.mudo)) return false
      if (filtro === 'critico' && (l.nivel !== 'critico' || l.mudo)) return false
      if (filtro === 'todos' && l.mudo) return false // "todos" = ativos (não silenciados)
      if (q && !l.cliente_nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [enriquecidas, filtro, busca])

  const cont = useMemo(() => ({
    atencao: enriquecidas.filter((l) => l.nivel === 'atencao' && !l.mudo).length,
    critico: enriquecidas.filter((l) => l.nivel === 'critico' && !l.mudo).length,
    silenciados: enriquecidas.filter((l) => l.mudo).length,
  }), [enriquecidas])

  async function acao(clienteId: string, fn: () => Promise<unknown>) {
    setATrabalhar(clienteId)
    await fn()
    await carregar()
    setATrabalhar(null)
  }

  return (
    <main style={c.page}>
      <AlugueresNav />
      <div style={c.topo}>
        <div>
          <Link href="/alugueres" style={c.voltar}>← Alugueres</Link>
          <h1 style={c.titulo}>😴 Clientes Inativos</h1>
          <p style={c.sub}>Clientes que não alugam há mais tempo — para reativar.</p>
        </div>
        <button style={c.btnGhost} onClick={() => setAbrirSettings((v) => !v)}>⚙️ Limiares</button>
      </div>

      {settings && abrirSettings && <SettingsPanel settings={settings} onGravado={carregar} />}

      {/* Resumo */}
      <div style={c.resumoCards}>
        <button style={{ ...c.rCard, ...(filtro === 'critico' ? { outline: '2px solid #B91C1C' } : {}) }} onClick={() => setFiltro('critico')}>
          <span style={c.rTit}>Crítico (≥{settings?.dias_critico ?? 45}d)</span>
          <span style={{ ...c.rNum, color: '#B91C1C' }}>{cont.critico}</span>
        </button>
        <button style={{ ...c.rCard, ...(filtro === 'atencao' ? { outline: '2px solid #92400E' } : {}) }} onClick={() => setFiltro('atencao')}>
          <span style={c.rTit}>Atenção (≥{settings?.dias_atencao ?? 30}d)</span>
          <span style={{ ...c.rNum, color: '#92400E' }}>{cont.atencao}</span>
        </button>
        <button style={{ ...c.rCard, ...(filtro === 'silenciados' ? { outline: '2px solid #6B7280' } : {}) }} onClick={() => setFiltro('silenciados')}>
          <span style={c.rTit}>Silenciados</span>
          <span style={{ ...c.rNum, color: '#6B7280' }}>{cont.silenciados}</span>
        </button>
      </div>

      <div style={c.filtros}>
        <input placeholder="Procurar cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...c.input, flex: 1, minWidth: 200 }} />
        {filtro !== 'todos' && <button style={c.btnGhost} onClick={() => setFiltro('todos')}>Ver todos</button>}
        <span style={c.contagem}>{filtradas.length} cliente(s)</span>
      </div>

      {carregando ? <p style={c.estado}>A carregar...</p> : filtradas.length === 0 ? <p style={c.estado}>Sem clientes nesta vista. 👍</p> : (
        <div style={c.lista}>
          {filtradas.map((l) => {
            const i = NIVEL_INFO[l.nivel as 'atencao' | 'critico']
            const ocupado = aTrabalhar === l.cliente_id
            return (
              <div key={l.cliente_id} style={{ ...c.cartao, borderLeft: `4px solid ${i.cor}`, opacity: l.mudo ? 0.7 : 1 }}>
                <div style={c.cartaoTopo}>
                  <div>
                    <span style={c.nome}>{l.cliente_nome}</span>
                    <span style={{ ...c.nivelBadge, color: i.cor, background: i.bg }}>{l.dias_inatividade} dias</span>
                    {l.mudo && <span style={c.mudoBadge}>🔕 até {formatarData(l.silenciado_ate)}</span>}
                  </div>
                  <div style={c.contactos}>
                    {l.telefone && <a href={`tel:${l.telefone}`} style={c.contacto}>📞 {l.telefone}</a>}
                    {l.email && <a href={`mailto:${l.email}`} style={c.contacto}>✉️ {l.email}</a>}
                    {!l.telefone && !l.email && <span style={c.muted}>sem contacto</span>}
                  </div>
                </div>
                <div style={c.meta}>
                  Último aluguer: <strong>{formatarData(l.ultimo_fim)}</strong>
                  {(l.marca || l.modelo) && <span> · {[l.marca, l.modelo].filter(Boolean).join(' ')}</span>}
                  {l.contacto_nome && <span> · contacto: {l.contacto_nome}</span>}
                </div>

                <textarea
                  key={'nota' + (l.nota ?? '')}
                  defaultValue={l.nota ?? ''}
                  placeholder="Nota de follow-up: contactado a…, resposta…"
                  onBlur={(e) => { if ((e.target.value.trim() || null) !== (l.nota ?? null)) acao(l.cliente_id, () => guardarNota(l.cliente_id, e.target.value, user)) }}
                  disabled={ocupado}
                  style={c.nota}
                />

                <div style={c.acoes}>
                  {l.mudo ? (
                    <button style={c.acaoBtn} disabled={ocupado} onClick={() => acao(l.cliente_id, () => reativarCliente(l.cliente_id, user))}>🔔 Reativar</button>
                  ) : (
                    <>
                      <button style={c.acaoBtn} disabled={ocupado} onClick={() => acao(l.cliente_id, () => silenciarCliente(l.cliente_id, 30, user))}>🔕 Silenciar 30d</button>
                      <button style={c.acaoBtn} disabled={ocupado} onClick={() => acao(l.cliente_id, () => silenciarCliente(l.cliente_id, 90, user))}>🔕 90d</button>
                    </>
                  )}
                  <button style={c.acaoBtn} disabled={ocupado} onClick={() => { if (confirm('Arquivar este cliente? Deixa de aparecer nos alertas de inatividade.')) acao(l.cliente_id, () => arquivarCliente(l.cliente_id, user)) }}>🗄️ Arquivar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

function SettingsPanel({ settings, onGravado }: { settings: InatividadeSettings; onGravado: () => Promise<void> | void }) {
  const [atencao, setAtencao] = useState(String(settings.dias_atencao))
  const [critico, setCritico] = useState(String(settings.dias_critico))
  const [emails, setEmails] = useState(settings.email_destinatarios ?? '')
  const [ativo, setAtivo] = useState(settings.email_resumo_ativo)
  const [msg, setMsg] = useState<string | null>(null)

  async function guardar() {
    const a = Math.max(1, Number(atencao) || 30)
    const cr = Math.max(a, Number(critico) || 45)
    await guardarSettings({ dias_atencao: a, dias_critico: cr, email_destinatarios: emails.trim() || null, email_resumo_ativo: ativo })
    setMsg('Guardado ✓')
    await onGravado()
    setTimeout(() => setMsg(null), 2000)
  }

  return (
    <div style={c.settings}>
      <div style={c.settingsGrid}>
        <label style={c.campo}><span style={c.rot}>Atenção (dias)</span><input type="number" min={1} value={atencao} onChange={(e) => setAtencao(e.target.value)} style={c.input} /></label>
        <label style={c.campo}><span style={c.rot}>Crítico (dias)</span><input type="number" min={1} value={critico} onChange={(e) => setCritico(e.target.value)} style={c.input} /></label>
        <label style={c.campo}><span style={c.rot}>Emails do resumo <span style={c.opc}>(separados por vírgula; vazio = admin/financeiro)</span></span><input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="comercial@all4laser.com, ..." style={c.input} /></label>
      </div>
      <label style={c.checkRow}><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Enviar resumo semanal por email (segunda de manhã)</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={c.btnPrimario} onClick={guardar}>Guardar limiares</button>
        {msg && <span style={{ color: '#065F46', fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 950, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  settings: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--foreground)' },
  resumoCards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 },
  rCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', textAlign: 'left' },
  rTit: { fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 },
  rNum: { fontSize: 24, fontWeight: 800 },
  filtros: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 8 },
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  nome: { fontWeight: 700, fontSize: 15 },
  nivelBadge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px', marginLeft: 8 },
  mudoBadge: { fontSize: 11.5, fontWeight: 600, color: '#6B7280', marginLeft: 8 },
  contactos: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  contacto: { color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 },
  muted: { color: 'var(--muted)', fontSize: 13 },
  meta: { fontSize: 13, color: 'var(--muted)' },
  nota: { width: '100%', minHeight: 44, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' },
  acoes: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  acaoBtn: { background: 'var(--accent-bg, #eef1f6)', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, color: 'var(--foreground)' },
}
