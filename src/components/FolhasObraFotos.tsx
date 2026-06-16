'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET = 'folhas-obra-fotos'

type Foto = {
  id: string
  url: string
  caminho: string | null
  nome: string | null
}

// Limpa o nome do ficheiro (só letras, números, ponto e traço)
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

export default function FolhasObraFotos({ folhaId }: { folhaId: string }) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [aCarregar, setACarregar] = useState(false)
  const [progresso, setProgresso] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    const { data } = await supabase
      .from('folhas_obra_fotos')
      .select('id, url, caminho, nome')
      .eq('folha_id', folhaId)
      .order('created_at', { ascending: true })
    setFotos((data as Foto[]) ?? [])
  }

  useEffect(() => {
    // setFotos só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhaId])

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiros = Array.from(e.target.files ?? [])
    if (ficheiros.length === 0) return

    setACarregar(true)
    let feitos = 0
    for (const ficheiro of ficheiros) {
      feitos++
      setProgresso(`A carregar ${feitos} de ${ficheiros.length}...`)

      const caminho = `${folhaId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
      const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, ficheiro)
      if (erroUpload) {
        alert(`Erro a carregar ${ficheiro.name}: ${erroUpload.message}`)
        continue
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho)
      await supabase.from('folhas_obra_fotos').insert({
        folha_id: folhaId,
        url: pub.publicUrl,
        caminho,
        nome: ficheiro.name,
      })
    }

    setProgresso('')
    setACarregar(false)
    if (inputRef.current) inputRef.current.value = ''
    carregar()
  }

  async function apagar(foto: Foto) {
    if (!window.confirm('Apagar esta foto?')) return
    if (foto.caminho) await supabase.storage.from(BUCKET).remove([foto.caminho])
    await supabase.from('folhas_obra_fotos').delete().eq('id', foto.id)
    carregar()
  }

  return (
    <section style={s.seccao}>
      <div style={s.topo}>
        <span style={s.titulo}>Fotos {fotos.length > 0 && `(${fotos.length})`}</span>
        <label style={s.botaoUpload}>
          + Carregar
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={aCarregar}
            onChange={aoEscolher}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {progresso && <div style={s.progresso}>{progresso}</div>}

      {fotos.length === 0 && !aCarregar ? (
        <div style={s.vazio}>Ainda não há fotos. Clica em “+ Carregar”.</div>
      ) : (
        <div style={s.grelha}>
          {fotos.map((foto) => (
            <div key={foto.id} style={s.item}>
              <a href={foto.url} target="_blank" rel="noopener noreferrer">
                {/* foto guardada no storage (bucket público) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url} alt={foto.nome ?? 'foto'} style={s.img} />
              </a>
              <button style={s.apagar} onClick={() => apagar(foto)} title="Apagar">×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const s: Record<string, React.CSSProperties> = {
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  titulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  botaoUpload: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  progresso: { fontSize: 13, color: 'var(--muted)' },
  vazio: { fontSize: 13, color: 'var(--muted)', padding: '8px 0' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 },
  item: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' },
  img: { width: '100%', height: 110, objectFit: 'cover', display: 'block' },
  apagar: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer' },
}
