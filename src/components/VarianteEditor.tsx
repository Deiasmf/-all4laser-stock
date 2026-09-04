'use client'

import { useState } from 'react'
import { criarVariante, type Autor } from '@/lib/marketing'
import { mensagemErro } from '@/lib/erros'
import { PLATAFORMA_LABEL, FORMATO_LABEL } from '@/types/marketing'
import type { Plataforma, FormatoVariante, VarianteInput } from '@/types/marketing'

// Editor para adicionar uma variante (por plataforma) a uma publicação.
type Props = {
  postId: string
  autor: Autor
  onGuardado: () => void
  onCancelar: () => void
}

export default function VarianteEditor({ postId, autor, onGuardado, onCancelar }: Props) {
  const [plataforma, setPlataforma] = useState<Plataforma>('instagram_feed')
  const [formato, setFormato] = useState<FormatoVariante | ''>('')
  const [idioma, setIdioma] = useState('')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [cta, setCta] = useState('')
  const [url, setUrl] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [primeiroComentario, setPrimeiroComentario] = useState('')
  const [altText, setAltText] = useState('')
  const [dataAgendada, setDataAgendada] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setAGuardar(true); setErro(null)
    const input: VarianteInput = {
      plataforma, formato: formato || null, idioma, titulo, texto, cta,
      url_destino: url,
      hashtags: hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, '').trim()).filter(Boolean),
      primeiro_comentario: primeiroComentario, alt_text: altText,
      // datetime-local dá hora local (Europe/Lisbon); guardamos em UTC (ISO).
      data_agendada: dataAgendada ? new Date(dataAgendada).toISOString() : null,
    }
    const { error } = await criarVariante(postId, input, autor)
    setAGuardar(false)
    if (error) { setErro(mensagemErro(error, { entidade: 'variante' })); return }
    onGuardado()
  }

  return (
    <form onSubmit={guardar} style={s.box}>
      {erro && <p style={{ color: 'var(--danger)' }}>{erro}</p>}
      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Plataforma *</label>
          <select style={s.input} value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma)}>
            {(Object.keys(PLATAFORMA_LABEL) as Plataforma[]).map((k) => <option key={k} value={k}>{PLATAFORMA_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Formato</label>
          <select style={s.input} value={formato} onChange={(e) => setFormato(e.target.value as FormatoVariante | '')}>
            <option value="">—</option>
            {(Object.keys(FORMATO_LABEL) as FormatoVariante[]).map((k) => <option key={k} value={k}>{FORMATO_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Idioma</label>
          <input style={s.input} value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="pt" />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Título (quando aplicável)</label>
        <input style={s.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div style={s.grupo}>
        <label style={s.label}>Texto / caption</label>
        <textarea style={{ ...s.input, minHeight: 90 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>CTA</label>
          <input style={s.input} value={cta} onChange={(e) => setCta(e.target.value)} />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>URL de destino</label>
          <input style={s.input} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Hashtags <span style={{ fontWeight: 400, fontSize: 12 }}>(separadas por espaço ou vírgula)</span></label>
        <input style={s.input} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="lasers estetica all4laser" />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Primeiro comentário</label>
          <input style={s.input} value={primeiroComentario} onChange={(e) => setPrimeiroComentario(e.target.value)} />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Texto alternativo (acessibilidade)</label>
          <input style={s.input} value={altText} onChange={(e) => setAltText(e.target.value)} />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Data e hora (Europe/Lisbon)</label>
        <input type="datetime-local" style={s.input} value={dataAgendada} onChange={(e) => setDataAgendada(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={s.btnOff} onClick={onCancelar}>Cancelar</button>
        <button type="submit" style={{ ...s.btn, ...(aGuardar ? { opacity: 0.6 } : {}) }} disabled={aGuardar}>{aGuardar ? 'A guardar…' : 'Adicionar variante'}</button>
      </div>
    </form>
  )
}

const s: Record<string, React.CSSProperties> = {
  box: { display: 'flex', flexDirection: 'column', gap: 12, border: '1px dashed var(--border)', borderRadius: 10, padding: 14, background: '#FAFAFE' },
  linha: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  grupo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 },
  label: { fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', font: 'inherit' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer' },
  btnOff: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' },
}
