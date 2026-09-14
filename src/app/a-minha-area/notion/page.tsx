'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  obterEstadoSync, ultimasRuns, listarConflitos, resolverConflito,
  listarStaging, marcarIncluir, sincronizarAgora, importarSelecionadasApi,
  type EstadoSync, type RunSync, type Conflito, type StagingItem,
} from '@/lib/notionSyncClient'

function dh(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotionSyncPage() {
  const { perfil } = useAuth()
  const uid = perfil?.id ?? null
  const [estado, setEstado] = useState<EstadoSync>(null)
  const [runs, setRuns] = useState<RunSync[]>([])
  const [conflitos, setConflitos] = useState<Conflito[]>([])
  const [staging, setStaging] = useState<StagingItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!uid) return
    const [e, r, c, s] = await Promise.all([obterEstadoSync(uid), ultimasRuns(uid), listarConflitos(uid), listarStaging(uid)])
    setEstado(e); setRuns(r); setConflitos(c); setStaging(s); setCarregando(false)
  }, [uid])
  useEffect(() => { carregar() }, [carregar]) // eslint-disable-line react-hooks/set-state-in-effect

  async function sincronizar(dry: boolean) {
    setOcupado(dry ? 'dry' : 'sync'); setMsg(null)
    const r = await sincronizarAgora(dry)
    setOcupado(null)
    if (!r.ok) { setMsg('❌ ' + (r.erro ?? 'Falhou.')); return }
    if (dry && Array.isArray(r.plano)) setMsg(`Simulação: ${r.plano.length} alterações previstas.\n` + (r.plano as string[]).slice(0, 30).join('\n'))
    else setMsg(`✓ Sincronizado. App: +${r.criadas_app}/~${r.atualizadas_app} · Notion: +${r.criadas_notion}/~${r.atualizadas_notion} · Conflitos: ${r.conflitos}`)
    await carregar()
  }
  async function importar() {
    setOcupado('import'); setMsg(null)
    const r = await importarSelecionadasApi()
    setOcupado(null)
    setMsg(r.ok ? `✓ Importadas ${r.importadas} tarefas.` : '❌ ' + (r.erro ?? 'Falhou.'))
    await carregar()
  }
  async function toggleIncluir(it: StagingItem) {
    setStaging((prev) => prev.map((x) => x.id === it.id ? { ...x, incluir: !x.incluir } : x))
    await marcarIncluir(it.id, !it.incluir)
  }
  async function resolver(id: string) { await resolverConflito(id); await carregar() }

  if (!uid) return <main style={c.page}><p style={c.muted}>A carregar…</p></main>

  const alerta = (estado?.falhas_seguidas ?? 0) >= 2

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <Link href="/a-minha-area" style={c.voltar}>← A Minha Área</Link>
        <h1 style={c.titulo}>🔗 Sincronização com o Notion</h1>
        <p style={c.sub}>As tuas tarefas (Assignee = tu) mantêm-se iguais na app e no Notion.</p>
      </div>

      {carregando ? <p style={c.muted}>A carregar…</p> : (
        <>
          {alerta && (
            <div style={c.alerta}>
              ⚠️ A sincronização falhou {estado?.falhas_seguidas} vezes seguidas. Verifica o token do Notion.
              {estado?.ultimo_erro && <div style={c.alertaErro}>{estado.ultimo_erro}</div>}
            </div>
          )}

          {/* Estado */}
          <section style={c.card}>
            <div style={c.estadoLinha}>
              <div>
                <div style={c.estadoLabel}>Última sincronização</div>
                <div style={c.estadoValor}>
                  {estado?.ultima_sync_ok === false ? '❌ ' : estado?.ultima_sync_ok ? '✓ ' : ''}
                  {dh(estado?.ultima_sync_at ?? null)}
                </div>
              </div>
              <div>
                <div style={c.estadoLabel}>Tarefas sincronizadas</div>
                <div style={c.estadoValor}>{estado?.tarefas_sincronizadas ?? 0}</div>
              </div>
              <div>
                <div style={c.estadoLabel}>Conflitos por rever</div>
                <div style={{ ...c.estadoValor, color: conflitos.length ? '#B45309' : undefined }}>{conflitos.length}</div>
              </div>
            </div>
            {estado?.ultimo_erro && !alerta && <div style={c.erroSuave}>Último erro: {estado.ultimo_erro}</div>}
            <div style={c.acoes}>
              <button style={c.btnPrimario} disabled={!!ocupado} onClick={() => sincronizar(false)}>{ocupado === 'sync' ? 'A sincronizar…' : '↻ Sincronizar agora'}</button>
              <button style={c.btnSec} disabled={!!ocupado} onClick={() => sincronizar(true)}>{ocupado === 'dry' ? 'A simular…' : 'Simular (dry-run)'}</button>
            </div>
            {msg && <pre style={c.msg}>{msg}</pre>}
          </section>

          {/* Revisão de importação inicial */}
          {staging.length > 0 && (
            <section style={c.card}>
              <h2 style={c.h2}>Importação inicial — revê antes de entrar ({staging.length})</h2>
              <p style={c.muted}>Estas tarefas estão no teu Notion mas ainda não na app. Desmarca as que não queres (restos de template, tarefas de equipa, etc.) e importa as escolhidas.</p>
              <div style={c.stagingLista}>
                {staging.map((it) => (
                  <label key={it.id} style={c.stagingLinha}>
                    <input type="checkbox" checked={it.incluir} onChange={() => toggleIncluir(it)} />
                    <span style={{ flex: 1 }}>
                      <span style={c.stagingTitulo}>{it.titulo || '(sem título)'}</span>
                      {it.estado_notion && <span style={c.stagingMeta}> · {it.estado_notion}</span>}
                      {it.tags && it.tags.length > 0 && <span style={c.stagingMeta}> · {it.tags.join(', ')}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <button style={c.btnPrimario} disabled={!!ocupado} onClick={importar}>
                {ocupado === 'import' ? 'A importar…' : `Importar ${staging.filter((s) => s.incluir).length} selecionadas`}
              </button>
            </section>
          )}

          {/* Conflitos */}
          {conflitos.length > 0 && (
            <section style={c.card}>
              <h2 style={c.h2}>Conflitos ({conflitos.length})</h2>
              <p style={c.muted}>Editado nos dois lados no mesmo intervalo. Venceu a edição mais recente — confirma que ficou bem.</p>
              <div style={c.lista}>
                {conflitos.map((cf) => (
                  <div key={cf.id} style={c.conflito}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={c.confCampo}>{cf.campo} <span style={c.confVenc}>· venceu {cf.vencedor === 'app' ? 'a app' : 'o Notion'}</span></div>
                      <div style={c.confVals}>
                        <span style={c.confApp}>app: {cf.valor_app || '—'}</span>
                        <span style={c.confNotion}>notion: {cf.valor_notion || '—'}</span>
                      </div>
                      <div style={c.metaMuted}>{dh(cf.created_at)}</div>
                    </div>
                    <button style={c.btnSecMini} onClick={() => resolver(cf.id)}>Marcar revisto</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Histórico */}
          <section style={c.card}>
            <h2 style={c.h2}>Últimas execuções</h2>
            {runs.length === 0 ? <p style={c.muted}>Ainda não correu.</p> : (
              <div style={c.lista}>
                {runs.map((r) => (
                  <div key={r.id} style={c.run}>
                    <span>{r.ok ? '✓' : '❌'} {dh(r.iniciado_at)} <span style={c.metaMuted}>({r.origem})</span></span>
                    <span style={c.metaMuted}>{r.erro ? r.erro : `App +${r.criadas_app}/~${r.atualizadas_app} · Notion +${r.criadas_notion}/~${r.atualizadas_notion} · conflitos ${r.conflitos}`}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ajuda */}
          <details style={c.ajuda}>
            <summary style={c.ajudaTitulo}>Como ligar o Notion (uma vez)</summary>
            <ol style={c.ajudaLista}>
              <li>Em <code>notion.so/my-integrations</code> cria uma integração interna e copia o <b>Internal Integration Token</b>.</li>
              <li>Na página <b>&quot;Projects &amp; tasks&quot;</b> no Notion → menu <code>···</code> → <b>Connections</b> → adiciona a integração (dá-lhe acesso à base <b>Tasks</b>).</li>
              <li>No Vercel, define a variável de ambiente <code>NOTION_TOKEN</code> com esse token e volta a fazer deploy.</li>
              <li>Volta aqui e carrega em <b>Simular (dry-run)</b> para veres o que vai acontecer, depois <b>Sincronizar agora</b>.</li>
            </ol>
            <p style={c.muted}>Nota (fase 1): os anexos não são sincronizados; as anotações e subtarefas vão só da app para o Notion.</p>
          </details>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 780, margin: '0 auto', padding: 20 },
  topo: { marginBottom: 16 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: 0 },
  muted: { color: 'var(--muted)', fontSize: 13.5 },
  metaMuted: { color: 'var(--muted)', fontSize: 12 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: 'var(--foreground)' },
  estadoLinha: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  estadoLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 2 },
  estadoValor: { fontSize: 15, fontWeight: 700 },
  acoes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnSec: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  btnSecMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  msg: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12.5, whiteSpace: 'pre-wrap', marginTop: 10, maxHeight: 240, overflowY: 'auto' },
  alerta: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 12, padding: 14, marginBottom: 14, fontWeight: 600 },
  alertaErro: { fontWeight: 400, fontSize: 12.5, marginTop: 6 },
  erroSuave: { color: '#B45309', fontSize: 12.5, marginBottom: 10 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  stagingLista: { display: 'flex', flexDirection: 'column', gap: 4, margin: '10px 0', maxHeight: 320, overflowY: 'auto' },
  stagingLinha: { display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px', fontSize: 14 },
  stagingTitulo: { fontWeight: 600 },
  stagingMeta: { color: 'var(--muted)', fontSize: 12.5 },
  conflito: { display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' },
  confCampo: { fontWeight: 700, fontSize: 13.5 },
  confVenc: { fontWeight: 400, color: 'var(--muted)', fontSize: 12.5 },
  confVals: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3, fontSize: 12.5 },
  confApp: { color: '#3730A3' },
  confNotion: { color: '#065F46' },
  run: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 },
  ajuda: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  ajudaTitulo: { fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  ajudaLista: { fontSize: 13.5, lineHeight: 1.6, marginTop: 10, paddingLeft: 20 },
}
