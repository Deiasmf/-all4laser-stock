'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { carregarAnexos, listarAnexos, apagarAnexo, urlAssinadaMedia } from '@/lib/marketing'
import type { Anexo } from '@/types/marketing'

type Autor = { id: string; nome: string | null }

// Galeria de imagens/vídeos de uma publicação. Bucket privado → URLs assinadas.
// A compressão de imagens acontece no upload (ver carregarAnexos).
export default function PostAnexos({ postId, autor, podeEditar = true, onMudou }: {
  postId: string
  autor: Autor
  podeEditar?: boolean
  onMudou?: () => void
}) {
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState<{ f: number; t: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const recarregar = useCallback(async () => {
    const lista = await listarAnexos(postId)
    setAnexos(lista)
    const pares = await Promise.all(lista.map(async (a) => [a.id, await urlAssinadaMedia(a.caminho)] as const))
    setUrls(Object.fromEntries(pares.filter(([, u]) => u)) as Record<string, string>)
  }, [postId])

  useEffect(() => { recarregar() }, [recarregar])

  async function escolher(files: FileList | null) {
    if (!files || files.length === 0) return
    setErro(null); setACarregar(true); setProgresso({ f: 0, t: files.length })
    const r = await carregarAnexos(postId, Array.from(files), autor, anexos.length,
      (f, t) => setProgresso({ f, t }))
    setACarregar(false); setProgresso(null)
    if (inputRef.current) inputRef.current.value = ''
    if (r.falhas.length) setErro(`${r.falhas.length} ficheiro(s) falharam: ${r.falhas.join(', ')}`)
    recarregar(); onMudou?.()
  }

  async function remover(a: Anexo) {
    if (!confirm('Remover este anexo?')) return
    await apagarAnexo(a); recarregar(); onMudou?.()
  }

  return (
    <div>
      {anexos.length === 0 && <p style={s.vazio}>Sem imagens nem vídeos. {podeEditar && 'Adiciona abaixo.'}</p>}

      {anexos.length > 0 && (
        <div style={s.grid}>
          {anexos.map((a) => (
            <div key={a.id} style={s.item}>
              {a.tipo === 'video'
                ? <video src={urls[a.id]} style={s.media} controls preload="metadata" />
                : <img src={urls[a.id]} alt={a.nome_original ?? ''} style={s.media} />}
              {podeEditar && (
                <button style={s.remover} onClick={() => remover(a)} title="Remover">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {podeEditar && (
        <div style={{ marginTop: 10 }}>
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple
            onChange={(e) => escolher(e.target.files)} disabled={aCarregar} />
          {progresso && <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--muted)' }}>A carregar {progresso.f}/{progresso.t}…</span>}
          {erro && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 6 }}>{erro}</p>}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  vazio: { color: 'var(--muted)', fontSize: 13.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 },
  item: { position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: '#000', aspectRatio: '1 / 1' },
  media: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  remover: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 },
}
