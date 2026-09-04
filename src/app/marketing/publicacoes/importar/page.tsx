'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { parsePlanoCsv, importarPlano, type LinhaImport, type ResultadoImport } from '@/lib/marketing'
import { PLATAFORMA_LABEL } from '@/types/marketing'

export default function ImportarPlanoPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [aImportar, setAImportar] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)

  async function lerFicheiro(f: File | null) {
    setResultado(null)
    if (!f) return
    const texto = await f.text()
    processar(texto)
  }
  function processar(texto: string) {
    const { linhas, erroGeral } = parsePlanoCsv(texto)
    setErroGeral(erroGeral)
    setLinhas(erroGeral ? null : linhas)
  }

  const validas = (linhas ?? []).filter((l) => l.erros.length === 0)
  const invalidas = (linhas ?? []).filter((l) => l.erros.length > 0)

  async function importar() {
    if (!perfil || validas.length === 0) return
    setAImportar(true)
    const r = await importarPlano(validas, { id: perfil.id, nome: perfil.nome })
    setAImportar(false)
    setResultado(r)
  }

  return (
    <main style={s.page}>
      <Link href="/marketing/publicacoes" style={s.voltar}>← Publicações</Link>
      <h1 style={s.titulo}>Importar plano editorial</h1>
      <p style={s.sub}>
        Carrega o CSV do plano (as colunas suportadas: data, hora, plataforma, título interno, tema,
        linha de negócio, objetivo, marca, modelo, mercado, idioma, formato, copy, CTA, URL, hashtags,
        link Canva, orgânico/pago, orçamento, notas). Cada linha entra como <strong>rascunho</strong> —
        nada é publicado nem aprovado. Reimportar não duplica.
      </p>

      <input type="file" accept=".csv,text/csv" onChange={(e) => lerFicheiro(e.target.files?.[0] ?? null)} style={{ marginBottom: 8 }} />
      <details style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>…ou colar o texto CSV</summary>
        <textarea style={s.textarea} placeholder="data;hora;plataforma;titulo interno;…" onChange={(e) => processar(e.target.value)} />
      </details>

      {erroGeral && <p style={{ color: 'var(--danger)' }}>{erroGeral}</p>}

      {resultado && (
        <div style={s.resumo}>
          ✓ Importação concluída: <strong>{resultado.criados}</strong> criada(s),{' '}
          <strong>{resultado.ignorados}</strong> ignorada(s) (já existiam),{' '}
          <strong>{resultado.falhados}</strong> falhada(s).
          <div style={{ marginTop: 8 }}>
            <button style={s.btnPri} onClick={() => router.push('/marketing/publicacoes')}>Ver publicações</button>
          </div>
        </div>
      )}

      {linhas && !resultado && (
        <>
          <div style={s.barra}>
            <span><strong style={{ color: '#166534' }}>{validas.length}</strong> válidas · <strong style={{ color: '#B91C1C' }}>{invalidas.length}</strong> com erro</span>
            <button style={{ ...s.btnPri, ...(validas.length === 0 || aImportar ? { opacity: 0.6 } : {}) }} disabled={validas.length === 0 || aImportar} onClick={importar}>
              {aImportar ? 'A importar…' : `Importar ${validas.length} válidas`}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tabela}>
              <thead>
                <tr>
                  <th style={s.th}>#</th><th style={s.th}>Título</th><th style={s.th}>Plataforma</th>
                  <th style={s.th}>Data</th><th style={s.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.linha} style={{ background: l.erros.length ? '#FEF2F2' : '#fff' }}>
                    <td style={s.td}>{l.linha}</td>
                    <td style={s.td}>{l.titulo || <em style={{ color: 'var(--muted)' }}>—</em>}</td>
                    <td style={s.td}>{l.plataforma ? PLATAFORMA_LABEL[l.plataforma] : '—'}</td>
                    <td style={s.td}>{l.data_agendada ? new Date(l.data_agendada).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td style={s.td}>{l.erros.length ? <span style={{ color: '#B91C1C' }}>{l.erros.join('; ')}</span> : <span style={{ color: '#166534' }}>OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', margin: '4px 0 8px' },
  sub: { color: 'var(--muted)', fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 },
  textarea: { width: '100%', minHeight: 120, marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13 },
  resumo: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 14, marginTop: 12 },
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0', flexWrap: 'wrap', gap: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontSize: 13.5 },
  th: { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
}
