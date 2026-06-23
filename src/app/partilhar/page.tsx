'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  LIMITE_FICHEIRO_MB, carregarMediaEquipamento, resumoUpload, houveProblemas,
  type ResultadoUpload,
} from '@/lib/mediaUpload'

const CACHE_PARTILHA = 'partilha-temp'

type EquipamentoResumo = {
  id: string
  modelo: string | null
  marca: string | null
  serial_number: string | null
}

// Lê os ficheiros que o service worker guardou ao receber a partilha do WhatsApp
async function lerFicheirosPartilhados(): Promise<File[]> {
  if (!('caches' in window)) return []
  const cache = await caches.open(CACHE_PARTILHA)
  const meta = await cache.match('/__partilha/meta')
  if (!meta) return []
  const { total } = (await meta.json()) as { total: number }
  const ficheiros: File[] = []
  for (let i = 0; i < total; i++) {
    const r = await cache.match(`/__partilha/${i}`)
    if (!r) continue
    const blob = await r.blob()
    const nome = decodeURIComponent(r.headers.get('x-nome') || `ficheiro-${i}`)
    ficheiros.push(new File([blob], nome, { type: r.headers.get('content-type') || blob.type }))
  }
  return ficheiros
}

async function limparPartilha() {
  if (!('caches' in window)) return
  const cache = await caches.open(CACHE_PARTILHA)
  for (const chave of await cache.keys()) await cache.delete(chave)
}

export default function PartilharPage() {
  const [ficheiros, setFicheiros] = useState<File[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [resultados, setResultados] = useState<EquipamentoResumo[]>([])
  const [escolhido, setEscolhido] = useState<EquipamentoResumo | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [concluido, setConcluido] = useState(false)
  const [resultado, setResultado] = useState<ResultadoUpload | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Carregar os ficheiros partilhados (se vierem do WhatsApp)
  useEffect(() => {
    lerFicheirosPartilhados().then((fs) => {
      if (fs.length > 0) setFicheiros(fs)
    })
  }, [])

  // Pesquisa de equipamentos (por serial, modelo ou marca)
  useEffect(() => {
    const q = pesquisa.trim()
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResultados([])
        return
      }
      const { data } = await supabase
        .from('equipamentos')
        .select('id, modelo, marca, serial_number')
        .or(`serial_number.ilike.%${q}%,modelo.ilike.%${q}%,marca.ilike.%${q}%`)
        .limit(15)
      setResultados((data as EquipamentoResumo[]) ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [pesquisa])

  function aoEscolherFicheirosManual(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? [])
    if (fs.length > 0) setFicheiros(fs)
  }

  async function carregar() {
    if (!escolhido || ficheiros.length === 0) return
    setACarregar(true)
    setMensagem(null)

    const r = await carregarMediaEquipamento(escolhido.id, ficheiros, (feitos, total) =>
      setProgresso(`A carregar ${feitos} de ${total}...`),
    )

    setProgresso('')
    setACarregar(false)
    setResultado(r)

    if (r.carregados > 0) {
      // Pelo menos um ficheiro entrou: ir para o ecrã de conclusão.
      setConcluido(true)
      await limparPartilha()
    } else {
      // Nada carregou (ex.: todos demasiado grandes): ficar e explicar porquê.
      setMensagem(resumoUpload(r))
    }
  }

  const rotulo = (e: EquipamentoResumo) =>
    [e.modelo, e.marca, e.serial_number ? `(${e.serial_number})` : null].filter(Boolean).join(' ')

  if (concluido && escolhido) {
    const r = resultado
    const problemas = r && houveProblemas(r)
    return (
      <main style={estilos.page}>
        <h1 style={estilos.titulo}>Fotos carregadas ✅</h1>
        <p>
          {r?.carregados ?? ficheiros.length} ficheiro(s) adicionados a <strong>{rotulo(escolhido)}</strong>.
        </p>
        {problemas && (
          <div style={estilos.avisoResumo}>
            {r!.grandes.length > 0 && (
              <div>⚠ {r!.grandes.length} ficheiro(s) demasiado grande(s) (máx. {LIMITE_FICHEIRO_MB} MB): {r!.grandes.join(', ')}</div>
            )}
            {r!.falhas.length > 0 && (
              <div>⚠ {r!.falhas.length} com erro: {r!.falhas.map((f) => f.nome).join(', ')}</div>
            )}
          </div>
        )}
        <Link href={`/equipamentos/${escolhido.id}`} style={estilos.botaoLink}>
          Ver equipamento
        </Link>
        <Link href="/logistico" style={estilos.voltar}>← Voltar à lista</Link>
      </main>
    )
  }

  return (
    <main style={estilos.page}>
      <h1 style={estilos.titulo}>Adicionar fotos a um equipamento</h1>

      {ficheiros.length > 0 ? (
        <div style={estilos.preview}>
          {ficheiros.map((f, i) => (
            <FicheiroPreview key={i} ficheiro={f} />
          ))}
        </div>
      ) : (
        <div style={estilos.aviso}>
          Não chegaram fotos pela partilha. Podes escolher do telemóvel:
          <div style={{ marginTop: 8 }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={aoEscolherFicheirosManual}
            />
          </div>
        </div>
      )}

      {ficheiros.length > 0 && (
        <p style={estilos.contador}>
          {ficheiros.length} ficheiro(s) prontos a carregar · máx. {LIMITE_FICHEIRO_MB} MB cada
        </p>
      )}

      <label style={estilos.label}>Escolher o equipamento</label>
      {escolhido ? (
        <div style={estilos.escolhido}>
          <span>{rotulo(escolhido)}</span>
          <button style={estilos.trocar} onClick={() => setEscolhido(null)}>
            Trocar
          </button>
        </div>
      ) : (
        <>
          <input
            style={estilos.input}
            placeholder="Procurar por serial, modelo ou marca..."
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
          />
          <div style={estilos.resultados}>
            {resultados.map((e) => (
              <button key={e.id} style={estilos.resultado} onClick={() => setEscolhido(e)}>
                {rotulo(e)}
              </button>
            ))}
            {pesquisa.trim().length >= 2 && resultados.length === 0 && (
              <div style={estilos.semResultados}>Nenhum equipamento encontrado.</div>
            )}
          </div>
        </>
      )}

      {progresso && <div style={estilos.progresso}>{progresso}</div>}

      {mensagem && <div style={estilos.avisoResumo}>{mensagem}</div>}

      <button
        style={{
          ...estilos.botaoGuardar,
          opacity: !escolhido || ficheiros.length === 0 || aCarregar ? 0.5 : 1,
        }}
        disabled={!escolhido || ficheiros.length === 0 || aCarregar}
        onClick={carregar}
      >
        {aCarregar ? 'A carregar...' : `Carregar ${ficheiros.length || ''} foto(s)`}
      </button>

      <Link href="/logistico" style={estilos.voltar}>← Cancelar</Link>
    </main>
  )
}

// Miniatura de um ficheiro (imagem ou vídeo)
function FicheiroPreview({ ficheiro }: { ficheiro: File }) {
  const url = useMemo(() => URL.createObjectURL(ficheiro), [ficheiro])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const ehVideo = ficheiro.type.startsWith('video')
  return (
    <div style={estilos.miniatura}>
      {ehVideo ? (
        <video src={url} style={estilos.miniaturaMedia} muted />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={ficheiro.name} style={estilos.miniaturaMedia} />
      )}
    </div>
  )
}

const estilos: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto', padding: 20 },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--primary)', marginBottom: 16 },
  preview: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  miniatura: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', background: '#eee' },
  miniaturaMedia: { width: '100%', height: '100%', objectFit: 'cover' },
  contador: { color: 'var(--muted)', fontSize: 14, marginBottom: 16 },
  aviso: { background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: 12, marginBottom: 16 },
  label: { display: 'block', fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16 },
  resultados: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  resultado: { textAlign: 'left', padding: 10, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  semResultados: { color: 'var(--muted)', padding: 8 },
  escolhido: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid var(--primary)', borderRadius: 8, background: 'var(--accent-bg, #eef1f6)' },
  trocar: { background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' },
  progresso: { marginTop: 12, color: 'var(--primary)', fontWeight: 600 },
  avisoResumo: { whiteSpace: 'pre-line', marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fff7e6', color: '#9a6700', border: '1px solid #f0c36d', fontSize: 13, fontWeight: 600 },
  botaoGuardar: { width: '100%', marginTop: 20, padding: 14, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  botaoLink: { display: 'inline-block', marginTop: 16, padding: '12px 20px', background: 'var(--primary)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 700 },
  voltar: { display: 'block', marginTop: 20, color: 'var(--muted)', textDecoration: 'none' },
}
