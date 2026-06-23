'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BUCKET_MEDIA, LIMITE_FICHEIRO_MB,
  carregarMediaEquipamento, resumoUpload, houveProblemas,
} from '@/lib/mediaUpload'
import styles from './mediaGaleria.module.css'

type Media = {
  id: string
  url: string
  caminho: string | null
  tipo: string | null
  nome: string | null
}

export default function MediaGaleria({ equipamentoId }: { equipamentoId: string }) {
  const [media, setMedia] = useState<Media[]>([])
  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [mensagemErro, setMensagemErro] = useState(false)
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
    // setMedia só corre após o await, dentro de carregarMedia()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarMedia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoId])

  async function aoEscolherFicheiros(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiros = Array.from(e.target.files ?? [])
    if (ficheiros.length === 0) return

    setMensagem(null)
    setACarregar(true)

    const resultado = await carregarMediaEquipamento(equipamentoId, ficheiros, (feitos, total) =>
      setProgresso(`A carregar ${feitos} de ${total}...`),
    )

    setProgresso('')
    setACarregar(false)
    if (inputRef.current) inputRef.current.value = ''
    setMensagem(resumoUpload(resultado))
    setMensagemErro(houveProblemas(resultado))
    carregarMedia()
  }

  async function apagar(m: Media) {
    if (!window.confirm('Apagar este ficheiro?')) return
    if (m.caminho) {
      await supabase.storage.from(BUCKET_MEDIA).remove([m.caminho])
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

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        Várias fotos e vídeos de uma vez · máx. {LIMITE_FICHEIRO_MB} MB por ficheiro
      </div>

      {progresso && <div className={styles.progresso}>{progresso}</div>}

      {mensagem && (
        <div
          style={{
            whiteSpace: 'pre-line',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 10,
            border: '1px solid',
            ...(mensagemErro
              ? { background: '#fff7e6', color: '#9a6700', borderColor: '#f0c36d' }
              : { background: '#e6f7f1', color: '#00875f', borderColor: '#00A87A' }),
          }}
        >
          {mensagem}
        </div>
      )}

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
