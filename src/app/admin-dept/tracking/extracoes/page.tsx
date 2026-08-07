'use client'

// Log das extrações de cartas de porte (auditoria da qualidade da IA).
// Herda a guarda de rota de ../layout.tsx (admin + administrativo).
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listarExtracaoLog, type ExtracaoLog } from '@/lib/tracking'

function dataHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
}
function tamanhoKb(bytes: number | null): string {
  if (!bytes) return '—'
  return `${Math.round(bytes / 1024)} KB`
}

export default function ExtracoesLogPage() {
  const [lista, setLista] = useState<ExtracaoLog[]>([])
  const [soErros, setSoErros] = useState(false)
  const [aCarregar, setACarregar] = useState(true)
  const [detalhe, setDetalhe] = useState<ExtracaoLog | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    setLista(await listarExtracaoLog({ soErros }))
    setACarregar(false)
  }, [soErros])

  useEffect(() => { carregar() }, [carregar])

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/admin-dept/tracking" style={c.voltar}>← Tracking</Link>
          <h1 style={c.h1}>Log de extrações de cartas de porte</h1>
          <p style={c.subtitulo}>Registo das extrações por IA (sucesso e erro), para auditar a qualidade.</p>
        </div>
        <label style={c.check}>
          <input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} /> Só erros
        </label>
      </div>

      {aCarregar ? (
        <p style={c.muted}>A carregar…</p>
      ) : lista.length === 0 ? (
        <p style={c.muted}>Sem registos.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>Data</th>
                <th style={c.th}>Ficheiro</th>
                <th style={c.th}>Tam.</th>
                <th style={c.th}>Resultado</th>
                <th style={c.th}>Utilizador</th>
                <th style={c.th}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} style={c.tr}>
                  <td style={c.td}>{dataHora(r.created_at)}</td>
                  <td style={c.td}>{r.ficheiro_nome ?? '—'}</td>
                  <td style={c.td}>{tamanhoKb(r.tamanho)}</td>
                  <td style={c.td}>
                    {r.sucesso
                      ? <span style={{ ...c.badge, background: '#D1FAE5', color: '#065F46' }}>Sucesso{r.duplicado_de ? ' · duplicado' : ''}</span>
                      : <span style={{ ...c.badge, background: '#FEF2F2', color: '#B91C1C' }} title={r.erro ?? ''}>Erro</span>}
                    {!r.sucesso && r.erro && <div style={c.erroMini}>{r.erro}</div>}
                  </td>
                  <td style={c.td}>{r.user_nome ?? '—'}</td>
                  <td style={c.td}>
                    {r.extracao_json != null && <button style={c.btnMini} onClick={() => setDetalhe(r)}>Ver JSON</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalhe && (
        <div style={c.overlay} onClick={() => setDetalhe(null)}>
          <div style={c.modal} onClick={(e) => e.stopPropagation()}>
            <div style={c.modalTopo}>
              <strong>{detalhe.ficheiro_nome ?? 'Extração'}</strong>
              <button style={c.btnFechar} onClick={() => setDetalhe(null)}>✕</button>
            </div>
            <pre style={c.json}>{JSON.stringify(detalhe.extracao_json, null, 2)}</pre>
          </div>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1100, margin: '0 auto' },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  h1: { fontSize: 20, margin: '4px 0' },
  subtitulo: { color: 'var(--muted)', fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '8px', verticalAlign: 'top' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  erroMini: { fontSize: 11, color: '#B91C1C', marginTop: 2, maxWidth: 320 },
  btnMini: { padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto', zIndex: 60 },
  modal: { background: '#fff', borderRadius: 12, padding: 16, width: 'min(720px, 100%)', marginTop: 24 },
  modalTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnFechar: { border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
  json: { background: '#0B1021', color: '#E5E7EB', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', maxHeight: '60vh' },
}
