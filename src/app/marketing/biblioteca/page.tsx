'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarMediaAssets, carregarMediaAsset, criarLinkCanva, urlAssinadaMedia,
  atualizarEstadoMedia, apagarMediaAsset, type MediaMeta,
} from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import { TIPO_MEDIA_LABEL } from '@/types/marketing'
import type { MediaAsset, EstadoMedia } from '@/types/marketing'

const ICONE: Record<string, string> = { imagem: '🖼️', video: '🎬', documento: '📄', canva_link: '🎨' }

export default function BibliotecaPage() {
  const { perfil } = useAuth()
  const autor = perfil ? { id: perfil.id, nome: perfil.nome } : null
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [modo, setModo] = useState<'nenhum' | 'ficheiro' | 'canva'>('nenhum')

  const recarregar = useCallback(async () => {
    const lista = await listarMediaAssets()
    setAssets(lista)
    setCarregando(false)
    // pré-visualização das imagens (signed URLs)
    const pares = await Promise.all(
      lista.filter((a) => a.tipo === 'imagem' && a.caminho).slice(0, 60)
        .map(async (a) => [a.id, await urlAssinadaMedia(a.caminho!)] as const),
    )
    setUrls(Object.fromEntries(pares.filter(([, u]) => u) as [string, string][]))
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  const filtrados = assets.filter((a) =>
    !q.trim() || `${a.nome_interno} ${a.marca ?? ''} ${a.modelo ?? ''} ${a.etiquetas.join(' ')}`.toLowerCase().includes(q.toLowerCase()),
  )

  async function mudarEstado(id: string, estado: EstadoMedia) {
    await atualizarEstadoMedia(id, estado); recarregar()
  }
  async function eliminar(a: MediaAsset) {
    if (!autor || !confirm(`Eliminar “${a.nome_interno}” da biblioteca?`)) return
    const { error } = await apagarMediaAsset(a, autor)
    if (error) { setErro(mensagemErro(error as never)); return }
    recarregar()
  }

  return (
    <main style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/marketing" style={s.voltar}>← Marketing</Link>
          <h1 style={s.titulo}>Biblioteca de conteúdos</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btnSec, ...(modo === 'ficheiro' ? s.on : {}) }} onClick={() => setModo(modo === 'ficheiro' ? 'nenhum' : 'ficheiro')}>+ Carregar ficheiro</button>
          <button style={{ ...s.btnSec, ...(modo === 'canva' ? s.on : {}) }} onClick={() => setModo(modo === 'canva' ? 'nenhum' : 'canva')}>+ Ligação Canva</button>
        </div>
      </div>

      {erro && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{erro}</p>}
      {autor && modo === 'ficheiro' && <UploadFicheiro autor={autor} onFeito={() => { setModo('nenhum'); recarregar() }} onErro={setErro} />}
      {autor && modo === 'canva' && <UploadCanva autor={autor} onFeito={() => { setModo('nenhum'); recarregar() }} onErro={setErro} />}

      <input style={s.pesquisa} placeholder="Pesquisar por nome, marca, modelo ou etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />

      {carregando && <p style={s.estado}>A carregar…</p>}
      {!carregando && filtrados.length === 0 && <p style={s.estado}>Biblioteca vazia. Carrega imagens/vídeos ou adiciona uma ligação Canva.</p>}

      <div style={s.grelha}>
        {filtrados.map((a) => (
          <div key={a.id} style={s.card}>
            <div style={s.preview}>
              {a.tipo === 'imagem' && urls[a.id]
                ? <img src={urls[a.id]} alt={a.nome_interno} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 40 }}>{ICONE[a.tipo] ?? '📁'}</span>}
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong style={{ fontSize: 13.5 }}>{a.nome_interno}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {TIPO_MEDIA_LABEL[a.tipo]}{a.marca ? ` · ${a.marca}` : ''}{a.modelo ? ` ${a.modelo}` : ''}
              </span>
              {a.etiquetas.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.etiquetas.map((t) => `#${t}`).join(' ')}</span>}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={a.estado} onChange={(e) => mudarEstado(a.id, e.target.value as EstadoMedia)} style={s.selEstado}>
                  <option value="rascunho">Rascunho</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="expirado">Expirado</option>
                  <option value="arquivado">Arquivado</option>
                </select>
                {a.tipo === 'canva_link' && a.canva_url && <a href={a.canva_url} target="_blank" rel="noreferrer" style={s.link}>Abrir</a>}
                {a.tipo === 'imagem' && urls[a.id] && <a href={urls[a.id]} target="_blank" rel="noreferrer" style={s.link}>Ver</a>}
                <button style={s.del} onClick={() => eliminar(a)}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

function CamposMeta({ meta, setMeta }: { meta: MediaMeta; setMeta: (m: MediaMeta) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input style={s.inp} placeholder="Nome interno *" value={meta.nome_interno} onChange={(e) => setMeta({ ...meta, nome_interno: e.target.value })} />
      <input style={s.inp} placeholder="Marca" value={meta.marca ?? ''} onChange={(e) => setMeta({ ...meta, marca: e.target.value })} />
      <input style={s.inp} placeholder="Modelo" value={meta.modelo ?? ''} onChange={(e) => setMeta({ ...meta, modelo: e.target.value })} />
      <input style={s.inp} placeholder="Direitos de utilização" value={meta.direitos ?? ''} onChange={(e) => setMeta({ ...meta, direitos: e.target.value })} />
      <input style={s.inp} placeholder="Etiquetas (vírgula)" onChange={(e) => setMeta({ ...meta, etiquetas: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
    </div>
  )
}

function UploadFicheiro({ autor, onFeito, onErro }: { autor: { id: string; nome: string | null }; onFeito: () => void; onErro: (s: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<MediaMeta>({ nome_interno: '' })
  const [aGuardar, setAGuardar] = useState(false)

  async function enviar() {
    if (!file) return
    setAGuardar(true); onErro(null)
    const m = { ...meta, nome_interno: meta.nome_interno || file.name }
    const { error } = await carregarMediaAsset(file, m, autor)
    setAGuardar(false)
    if (error) { onErro(mensagemErro(error as never)); return }
    onFeito()
  }

  return (
    <div style={s.upload}>
      <input type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <CamposMeta meta={meta} setMeta={setMeta} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={{ ...s.btnPri, ...(!file || aGuardar ? { opacity: 0.6 } : {}) }} disabled={!file || aGuardar} onClick={enviar}>
          {aGuardar ? 'A carregar…' : 'Carregar'}
        </button>
      </div>
    </div>
  )
}

function UploadCanva({ autor, onFeito, onErro }: { autor: { id: string; nome: string | null }; onFeito: () => void; onErro: (s: string | null) => void }) {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<MediaMeta>({ nome_interno: '' })
  const [aGuardar, setAGuardar] = useState(false)

  async function enviar() {
    if (!url.trim()) return
    setAGuardar(true); onErro(null)
    const { error } = await criarLinkCanva(url, meta, autor)
    setAGuardar(false)
    if (error) { onErro(mensagemErro(error as never)); return }
    onFeito()
  }

  return (
    <div style={s.upload}>
      <input style={s.inp} placeholder="URL editável do design Canva" value={url} onChange={(e) => setUrl(e.target.value)} />
      <CamposMeta meta={meta} setMeta={setMeta} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={{ ...s.btnPri, ...(!url.trim() || aGuardar ? { opacity: 0.6 } : {}) }} disabled={!url.trim() || aGuardar} onClick={enviar}>
          {aGuardar ? 'A guardar…' : 'Guardar ligação'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: 20 },
  voltar: { fontSize: 13, color: 'var(--muted)', textDecoration: 'none' },
  titulo: { fontSize: 24, fontWeight: 700, color: 'var(--primary)', marginTop: 4 },
  btnSec: { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  on: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  upload: { border: '1px dashed var(--border)', borderRadius: 10, padding: 14, margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFAFE' },
  inp: { flex: 1, minWidth: 150, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  pesquisa: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', margin: '14px 0 16px' },
  estado: { color: 'var(--muted)', textAlign: 'center', padding: 30 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 },
  card: { border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  preview: { height: 130, background: '#F5F4FE', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  selEstado: { padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit', fontSize: 12 },
  link: { fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 },
  del: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger, #c0392b)', cursor: 'pointer', fontSize: 14 },
  btnPri: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: 'pointer' },
}
