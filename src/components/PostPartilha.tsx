'use client'

import { useEffect, useState } from 'react'
import { marcarPublicado, desmarcarPublicado, urlAssinadaMedia } from '@/lib/marketing'
import { CANAL_LABEL, CANAL_EMOJI } from '@/types/marketing'
import type { Anexo, PublicacaoCanal } from '@/types/marketing'

type Autor = { id: string; nome: string | null }
type PostConteudo = {
  id: string
  titulo_interno: string
  texto_pt: string | null
  texto_en: string | null
  hashtags: string[]
  canais: string[]
}

// Partilha rápida (otimizada para telemóvel): copiar textos/hashtags, descarregar
// e partilhar imagens (Web Share API com fallback), e marcar publicada por canal.
export default function PostPartilha({ post, anexos, publicacoes, autor, onMudou }: {
  post: PostConteudo
  anexos: Anexo[]
  publicacoes: PublicacaoCanal[]
  autor: Autor
  onMudou: () => void
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [imgUrls, setImgUrls] = useState<{ anexo: Anexo; url: string }[]>([])
  const [aPartilhar, setAPartilhar] = useState(false)

  const imagens = anexos.filter((a) => a.tipo === 'imagem')
  const hashtagsTxt = post.hashtags.map((h) => `#${h}`).join(' ')
  const podeWebShare = typeof navigator !== 'undefined' && !!navigator.share

  useEffect(() => {
    let vivo = true
    Promise.all(imagens.map(async (a) => ({ anexo: a, url: (await urlAssinadaMedia(a.caminho)) ?? '' })))
      .then((r) => { if (vivo) setImgUrls(r.filter((x) => x.url)) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexos])

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function copiar(texto: string | null, oQue: string) {
    if (!texto || !texto.trim()) { mostrarToast(`Sem ${oQue} para copiar`); return }
    try {
      await navigator.clipboard.writeText(texto)
      mostrarToast(`${oQue} copiado ✓`)
    } catch {
      mostrarToast('Não foi possível copiar')
    }
  }

  async function baixar(url: string, nome: string) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function descarregarImagens() {
    if (imgUrls.length === 0) { mostrarToast('Sem imagens'); return }
    for (const { anexo, url } of imgUrls) {
      await baixar(url, anexo.nome_original || `${post.titulo_interno}.jpg`)
    }
    mostrarToast(`${imgUrls.length} imagem(ns) descarregada(s) ✓`)
  }

  // Partilha nativa (folha do sistema) com texto + imagens; degrada para copiar+baixar.
  async function partilhar() {
    const texto = [post.texto_pt || post.texto_en || '', hashtagsTxt].filter(Boolean).join('\n\n')
    setAPartilhar(true)
    try {
      let files: File[] = []
      if (imgUrls.length > 0) {
        files = (await Promise.all(imgUrls.map(async ({ anexo, url }) => {
          try {
            const blob = await (await fetch(url)).blob()
            return new File([blob], anexo.nome_original || 'imagem.jpg', { type: blob.type || 'image/jpeg' })
          } catch { return null }
        }))).filter(Boolean) as File[]
      }
      const comFicheiros = files.length > 0 && !!navigator.canShare && navigator.canShare({ files })
      if (navigator.share) {
        await navigator.share(comFicheiros
          ? { text: texto, files, title: post.titulo_interno }
          : { text: texto, title: post.titulo_interno })
        mostrarToast('Partilha aberta ✓')
      } else {
        await copiar(texto, 'texto')
        await descarregarImagens()
      }
    } catch (e) {
      // Cancelar a folha de partilha lança AbortError — não é erro para o utilizador.
      if ((e as Error)?.name !== 'AbortError') mostrarToast('Não foi possível partilhar')
    } finally {
      setAPartilhar(false)
    }
  }

  const publicadoPorCanal = new Map(publicacoes.map((p) => [p.canal, p]))

  async function alternarPublicado(canal: string) {
    if (publicadoPorCanal.has(canal)) {
      if (!confirm(`Desmarcar "publicada" no ${CANAL_LABEL[canal as keyof typeof CANAL_LABEL] ?? canal}?`)) return
      await desmarcarPublicado(post.id, canal)
    } else {
      await marcarPublicado(post.id, canal, autor)
    }
    onMudou()
  }

  return (
    <div style={s.wrap}>
      {/* Ações rápidas */}
      <div style={s.linha}>
        <button style={s.btn} onClick={() => copiar(post.texto_pt, 'Texto PT')}>📋 Copiar texto PT</button>
        <button style={s.btn} onClick={() => copiar(post.texto_en, 'Texto EN')}>📋 Copiar texto EN</button>
        <button style={s.btn} onClick={() => copiar(hashtagsTxt, 'Hashtags')}>#️⃣ Copiar hashtags</button>
        {imagens.length > 0 && (
          <button style={s.btn} onClick={descarregarImagens}>⬇ Descarregar imagem{imagens.length > 1 ? `ns (${imagens.length})` : ''}</button>
        )}
        {podeWebShare && (
          <button style={{ ...s.btn, ...s.btnPri }} onClick={partilhar} disabled={aPartilhar}>
            {aPartilhar ? 'A preparar…' : '📲 Partilhar'}
          </button>
        )}
      </div>

      {/* Publicar por canal */}
      {post.canais.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={s.rotulo}>Publicada em</div>
          <div style={s.linha}>
            {post.canais.map((c) => {
              const pub = publicadoPorCanal.get(c)
              const nome = CANAL_LABEL[c as keyof typeof CANAL_LABEL] ?? c
              return (
                <button key={c} onClick={() => alternarPublicado(c)}
                  style={{ ...s.canalBtn, ...(pub ? s.canalOn : {}) }}
                  title={pub ? `Publicada a ${new Date(pub.publicado_em).toLocaleString('pt-PT')} — clicar para desmarcar` : `Marcar como publicada no ${nome}`}>
                  {pub ? '✅' : '⬜'} {CANAL_EMOJI[c] ?? ''} {nome}
                  {pub && <span style={s.data}> · {new Date(pub.publicado_em).toLocaleDateString('pt-PT')}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative' },
  linha: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  rotulo: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 },
  btn: { flex: '1 1 auto', minWidth: 150, background: '#fff', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 16px', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' },
  btnPri: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  canalBtn: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 16px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  canalOn: { background: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' },
  data: { fontWeight: 500, opacity: 0.85 },
  toast: { position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '11px 20px', borderRadius: 999, fontSize: 14, fontWeight: 600, zIndex: 1000, boxShadow: '0 6px 20px rgba(0,0,0,0.25)' },
}
