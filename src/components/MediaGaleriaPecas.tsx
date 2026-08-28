'use client'

// Galeria de fotografias de uma peça: upload (drag&drop + câmara no telemóvel),
// definir capa, ordenar, apagar e zoom. Bucket público 'pecas-media'.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarMediaPeca, carregarMediaPeca, definirCapaPeca, guardarOrdemMediaPeca, apagarMediaPeca,
  LIMITE_FICHEIRO_MB, type PecaMedia,
} from '@/lib/pecasMedia'

export default function MediaGaleriaPecas({ pecaId }: { pecaId: string }) {
  const { perfil } = useAuth()
  const [itens, setItens] = useState<PecaMedia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aCarregar, setACarregar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => { setItens(await listarMediaPeca(pecaId)); setCarregando(false) }, [pecaId])
  useEffect(() => { carregar() }, [carregar])

  async function subir(files: FileList | File[] | null) {
    const lista = files ? Array.from(files) : []
    if (!lista.length) return
    setMsg(null)
    const r = await carregarMediaPeca(pecaId, lista, { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
      (f, t) => setACarregar(`A carregar ${f}/${t}…`), itens.length)
    setACarregar(null)
    if (r.grandes.length || r.falhas.length) {
      setMsg(`${r.carregados} carregada(s). ${r.grandes.length ? `${r.grandes.length} demasiado grande(s) (máx ${LIMITE_FICHEIRO_MB} MB). ` : ''}${r.falhas.length ? `${r.falhas.length} com erro.` : ''}`)
    }
    await carregar()
  }

  async function capa(m: PecaMedia) { await definirCapaPeca(pecaId, m.id); await carregar() }
  async function apagar(m: PecaMedia) {
    if (!window.confirm('Apagar esta foto?')) return
    await apagarMediaPeca(m); await carregar()
  }
  async function mover(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= itens.length) return
    const nova = [...itens]; const tmp = nova[i]; nova[i] = nova[j]; nova[j] = tmp
    setItens(nova)
    await guardarOrdemMediaPeca(nova.map((m) => m.id)); await carregar()
  }

  return (
    <div style={s.wrap}>
      <div style={s.cab}><span style={s.titulo}>Fotografias</span></div>

      <div
        style={{ ...s.drop, ...(dragOver ? s.dropOver : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); subir(e.dataTransfer.files) }}
      >
        <span style={s.dropTxt}>Arrasta fotos para aqui, ou:</span>
        <div style={s.dropBtns}>
          <button type="button" style={s.btn} onClick={() => inputRef.current?.click()}>📁 Escolher</button>
          <button type="button" style={s.btn} onClick={() => camRef.current?.click()}>📷 Câmara</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
      </div>

      {aCarregar && <p style={s.info}>{aCarregar}</p>}
      {msg && <p style={s.aviso}>{msg}</p>}

      {carregando ? <p style={s.muted}>A carregar…</p> : itens.length === 0 ? (
        <p style={s.muted}>Sem fotos. Adiciona a foto do artigo para o identificar mais fácil.</p>
      ) : (
        <div style={s.grid}>
          {itens.map((m, i) => (
            <div key={m.id} style={s.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.nome ?? 'foto'} style={s.thumb} onClick={() => setZoom(m.url)} />
              {m.capa && <span style={s.badgeCapa}>Capa</span>}
              <div style={s.acoes}>
                <button type="button" style={s.miniBtn} title="Definir como capa" onClick={() => capa(m)} disabled={m.capa}>⭐</button>
                <button type="button" style={s.miniBtn} title="Recuar" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" style={s.miniBtn} title="Avançar" onClick={() => mover(i, 1)} disabled={i === itens.length - 1}>↓</button>
                <button type="button" style={{ ...s.miniBtn, ...s.del }} title="Apagar" onClick={() => apagar(m)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div style={s.lightbox} onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="foto" style={s.lightImg} />
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 14 },
  cab: { marginBottom: 8 },
  titulo: { fontSize: 15, fontWeight: 700 },
  drop: { border: '2px dashed var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' },
  dropOver: { borderColor: 'var(--primary)', background: '#F5F3FF' },
  dropTxt: { fontSize: 13, color: 'var(--muted)' },
  dropBtns: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  btn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  info: { fontSize: 12.5, color: 'var(--muted)', marginTop: 8 },
  aviso: { fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 8, padding: '6px 10px', marginTop: 8 },
  muted: { color: 'var(--muted)', fontSize: 13.5, marginTop: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 12 },
  card: { position: 'relative', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fafafa' },
  thumb: { width: '100%', height: 100, objectFit: 'cover', display: 'block', cursor: 'zoom-in' },
  badgeCapa: { position: 'absolute', top: 6, left: 6, background: 'var(--primary)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 6 },
  acoes: { display: 'flex', justifyContent: 'center', gap: 2, padding: 4, background: '#fff' },
  miniBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12, cursor: 'pointer' },
  del: { borderColor: '#FCA5A5' },
  lightbox: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20, cursor: 'zoom-out' },
  lightImg: { maxWidth: '100%', maxHeight: '100%', borderRadius: 8 },
}
