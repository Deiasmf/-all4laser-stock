'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarPlanoDocumentos, carregarPlanoDocumento, atualizarNotasPlano,
  apagarPlanoDocumento, urlAssinadaMedia,
} from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import type { PlanoDocumento } from '@/types/marketing'

function formatarData(d: string) {
  return new Date(d).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatarTamanho(b: number | null) {
  if (!b) return ''
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`
}

export default function PlanoMarketingPage() {
  const { perfil, isAdmin } = useAuth()
  const [docs, setDocs] = useState<PlanoDocumento[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ficheiro, setFicheiro] = useState<File | null>(null)
  const [notas, setNotas] = useState('')
  const [aEnviar, setAEnviar] = useState(false)

  const recarregar = useCallback(async () => {
    const lista = await listarPlanoDocumentos()
    setDocs(lista)
    const pares = await Promise.all(lista.map(async (d) => [d.id, await urlAssinadaMedia(d.caminho)] as const))
    setUrls(Object.fromEntries(pares.filter(([, u]) => u)) as Record<string, string>)
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  async function enviar() {
    if (!ficheiro || !perfil) { setErro('Escolhe um ficheiro.'); return }
    setErro(null); setAEnviar(true)
    const { error } = await carregarPlanoDocumento(ficheiro, notas, { id: perfil.id, nome: perfil.nome })
    setAEnviar(false)
    if (error) { setErro(mensagemErro(error)); return }
    setFicheiro(null); setNotas('')
    const inp = document.getElementById('plano-file') as HTMLInputElement | null
    if (inp) inp.value = ''
    recarregar()
  }

  const atual = docs[0] ?? null

  return (
    <main style={s.page}>
      <Link href="/marketing" style={s.voltar}>← Marketing</Link>
      <h1 style={s.titulo}>Plano de Marketing</h1>
      <p style={s.sub}>O documento de referência da equipa. Cada envio cria uma <strong>versão nova</strong> — o histórico fica guardado.</p>

      {/* Upload de nova versão */}
      <div className="a4l-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={s.rotulo}>Carregar nova versão</div>
        <input id="plano-file" type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={(e) => setFicheiro(e.target.files?.[0] ?? null)} />
        <textarea style={s.textarea} placeholder="Notas desta versão (opcional) — o que mudou, foco do período…" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <button style={{ ...s.btnPri, ...(aEnviar || !ficheiro ? { opacity: 0.6 } : {}) }} disabled={aEnviar || !ficheiro} onClick={enviar}>
          {aEnviar ? 'A enviar…' : 'Carregar versão'}
        </button>
        {erro && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{erro}</p>}
      </div>

      {carregando && <p style={{ color: 'var(--muted)' }}>A carregar…</p>}
      {!carregando && docs.length === 0 && <p style={{ color: 'var(--muted)' }}>Ainda não há nenhum plano. Carrega o documento acima.</p>}

      {/* Visualização da versão atual (PDF na app) */}
      {atual && (
        <div style={{ marginBottom: 22 }}>
          <div style={s.rotulo}>Versão atual — v{atual.versao} · {formatarData(atual.created_at)}</div>
          {atual.tipo === 'pdf' && urls[atual.id] ? (
            <iframe src={urls[atual.id]} style={s.viewer} title={`Plano v${atual.versao}`} />
          ) : (
            <div style={s.semPreview}>
              Pré-visualização indisponível para este tipo de ficheiro.{' '}
              {urls[atual.id] && <a href={urls[atual.id]} target="_blank" rel="noopener noreferrer" style={s.link}>Descarregar {atual.nome}</a>}
            </div>
          )}
        </div>
      )}

      {/* Histórico de versões */}
      {docs.length > 0 && (
        <div>
          <div style={s.rotulo}>Histórico de versões</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {docs.map((d, i) => (
              <VersaoLinha key={d.id} doc={d} url={urls[d.id]} atual={i === 0} podeApagar={isAdmin} onMudou={recarregar} />
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

function VersaoLinha({ doc, url, atual, podeApagar, onMudou }: {
  doc: PlanoDocumento; url?: string; atual: boolean; podeApagar: boolean; onMudou: () => void
}) {
  const [editar, setEditar] = useState(false)
  const [notas, setNotas] = useState(doc.notas ?? '')

  async function guardar() {
    await atualizarNotasPlano(doc.id, notas)
    setEditar(false); onMudou()
  }
  async function apagar() {
    if (!confirm(`Apagar a versão v${doc.versao}? Esta ação não pode ser desfeita.`)) return
    await apagarPlanoDocumento(doc); onMudou()
  }

  return (
    <div className="a4l-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={s.versaoBadge}>v{doc.versao}</span>
          {atual && <span style={s.atualBadge}>atual</span>}
          <strong style={{ fontSize: 14 }}>{doc.nome}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {formatarData(doc.created_at)}{doc.criado_por_nome ? ` · ${doc.criado_por_nome}` : ''}{formatarTamanho(doc.tamanho_bytes) ? ` · ${formatarTamanho(doc.tamanho_bytes)}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {url && <a href={url} target="_blank" rel="noopener noreferrer" style={s.link}>📄 Ver / descarregar</a>}
          <button style={s.linkBtn} onClick={() => setEditar((v) => !v)}>{editar ? 'Cancelar' : 'Notas'}</button>
          {podeApagar && <button style={{ ...s.linkBtn, color: 'var(--danger, #c0392b)' }} onClick={apagar}>Apagar</button>}
        </div>
      </div>
      {!editar && doc.notas && <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>{doc.notas}</p>}
      {editar && (
        <div style={{ marginTop: 8 }}>
          <textarea style={s.textarea} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas desta versão…" />
          <button style={s.btnPri} onClick={guardar}>Guardar notas</button>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  sub: { color: 'var(--muted)', fontSize: 13.5, margin: '4px 0 16px', lineHeight: 1.5 },
  rotulo: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', fontWeight: 700, marginBottom: 8 },
  textarea: { width: '100%', minHeight: 64, margin: '10px 0', padding: 10, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', fontSize: 13.5 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  viewer: { width: '100%', height: 560, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' },
  semPreview: { border: '1px solid var(--border)', borderRadius: 10, padding: 16, fontSize: 13.5, color: 'var(--muted)' },
  link: { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', fontSize: 13.5 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  versaoBadge: { background: '#EEEDFB', color: '#3A3870', borderRadius: 6, padding: '2px 8px', fontSize: 12.5, fontWeight: 700 },
  atualBadge: { background: '#D1FAE5', color: '#065F46', borderRadius: 999, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 },
}
