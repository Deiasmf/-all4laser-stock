'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './mediaGaleria.module.css'

const BUCKET = 'equipamentos-media'

type Media = {
  id: string
  url: string
  caminho: string | null
  tipo: string | null
  nome: string | null
}

// Limpa o nome do ficheiro (só letras, números, ponto e traço)
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

export default function MediaGaleria({ equipamentoId }: { equipamentoId: string }) {
  const [media, setMedia] = useState<Media[]>([])
  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function carregarMedia() {
    const { data } = await supabase
      .from('media')
      .select('*')
      .eq('equipamento_id', equipamentoId)
      .order('created_at', { ascending: true })
    setMedia((data as Media[]) ?? [])
  }

  useEffect(() => {
    carregarMedia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoId])

  async function aoEscolherFicheiros(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiros = Array.from(e.target.files ?? [])
    if (ficheiros.length === 0) return

    setACarregar(true)
    let feitos = 0

    for (const ficheiro of ficheiros) {
      feitos++
      setProgresso(`A carregar ${feitos} de ${ficheiros.length}...`)

      const caminho = `${equipamentoId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, ficheiro)

      if (erroUpload) {
        alert(`Erro a carregar ${ficheiro.name}: ${erroUpload.message}`)
        continue
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
      const tipo = ficheiro.type.startsWith('video') ? 'video' : 'foto'

      await supabase.from('media').insert({
        equipamento_id: equipamentoId,
        url: pub.publicUrl,
        caminho,
        tipo,
        nome: ficheiro.name,
      })
    }

    setProgresso('')
    setACarregar(false)
    if (inputRef.current) inputRef.current.value = ''
    carregarMedia()
  }

  async function apagar(m: Media) {
    if (!window.confirm('Apagar este ficheiro?')) return
    if (m.caminho) {
      await supabase.storage.from(BUCKET).remove([m.caminho])
    }
    await supabase.from('media').delete().eq('id', m.id)
    carregarMedia()
  }

  const fotos = media.filter((m) => m.tipo !== 'video').length
  const videos = media.filter((m) => m.tipo === 'video').length

  return (
    <div className={styles.seccao}>
      <div className={styles.cabecalho}>
        <span className={styles.seccaoTitulo}>
          Fotos e vídeos {media.length > 0 && `(${fotos} fotos · ${videos} vídeos)`}
        </span>
        <label className={styles.botaoUpload}>
          + Carregar
          <input
            ref={inputRef}
            className={styles.inputEscondido}
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={aCarregar}
            onChange={aoEscolherFicheiros}
          />
        </label>
      </div>

      {progresso && <div className={styles.progresso}>{progresso}</div>}

      {media.length === 0 && !aCarregar ? (
        <div className={styles.vazio}>Ainda não há fotos nem vídeos. Clica em “+ Carregar”.</div>
      ) : (
        <div className={styles.grelha}>
          {media.map((m) => (
            <div key={m.id} className={styles.item}>
              {m.tipo === 'video' ? (
                <video src={m.url} controls />
              ) : (
                <a href={m.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.nome ?? 'foto'} />
                </a>
              )}
              <button className={styles.apagar} onClick={() => apagar(m)} title="Apagar">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
