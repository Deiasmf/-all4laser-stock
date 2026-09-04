'use client'

import { useState } from 'react'
import type { PostInput, LinhaNegocio, ObjetivoPost, EstrategiaPromocao, Campanha } from '@/types/marketing'
import { LINHA_NEGOCIO_LABEL, OBJETIVO_LABEL, ESTRATEGIA_LABEL } from '@/types/marketing'

type Props = {
  inicial?: Partial<PostInput>
  campanhas: Campanha[]
  aGuardar?: boolean
  onSubmit: (input: PostInput) => void
  onCancelar?: () => void
}

const listaParaTexto = (a?: string[] | null) => (a ?? []).join(', ')
const textoParaLista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export default function PostForm({ inicial, campanhas, aGuardar, onSubmit, onCancelar }: Props) {
  const [titulo, setTitulo] = useState(inicial?.titulo_interno ?? '')
  const [campaignId, setCampaignId] = useState(inicial?.campaign_id ?? '')
  const [linha, setLinha] = useState<LinhaNegocio | ''>(inicial?.linha_negocio ?? '')
  const [objetivo, setObjetivo] = useState<ObjetivoPost | ''>(inicial?.objetivo ?? '')
  const [mercados, setMercados] = useState(listaParaTexto(inicial?.mercados))
  const [idioma, setIdioma] = useState(inicial?.idioma_base ?? '')
  const [publico, setPublico] = useState(inicial?.publico_alvo ?? '')
  const [prioridade, setPrioridade] = useState<'baixa' | 'normal' | 'alta'>(inicial?.prioridade ?? 'normal')
  const [estrategia, setEstrategia] = useState<EstrategiaPromocao>(inicial?.estrategia_promocao ?? 'organica')
  const [canva, setCanva] = useState(inicial?.canva_url ?? '')
  const [notas, setNotas] = useState(inicial?.notas_internas ?? '')

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    onSubmit({
      titulo_interno: titulo, campaign_id: campaignId || null, linha_negocio: linha || null,
      objetivo: objetivo || null, mercados: textoParaLista(mercados), idioma_base: idioma,
      publico_alvo: publico, prioridade, estrategia_promocao: estrategia,
      canva_url: canva, notas_internas: notas,
    })
  }

  return (
    <form onSubmit={submeter} style={s.form}>
      <div style={s.grupo}>
        <label style={s.label}>Título interno *</label>
        <input style={s.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Campanha</label>
          <select style={s.input} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">— Sem campanha</option>
            {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Prioridade</label>
          <select style={s.input} value={prioridade} onChange={(e) => setPrioridade(e.target.value as 'baixa' | 'normal' | 'alta')}>
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
          </select>
        </div>
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Linha de negócio</label>
          <select style={s.input} value={linha} onChange={(e) => setLinha(e.target.value as LinhaNegocio | '')}>
            <option value="">—</option>
            {(Object.keys(LINHA_NEGOCIO_LABEL) as LinhaNegocio[]).map((k) => <option key={k} value={k}>{LINHA_NEGOCIO_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Objetivo</label>
          <select style={s.input} value={objetivo} onChange={(e) => setObjetivo(e.target.value as ObjetivoPost | '')}>
            <option value="">—</option>
            {(Object.keys(OBJETIVO_LABEL) as ObjetivoPost[]).map((k) => <option key={k} value={k}>{OBJETIVO_LABEL[k]}</option>)}
          </select>
        </div>
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Mercados <span style={s.hint}>(vírgula)</span></label>
          <input style={s.input} value={mercados} onChange={(e) => setMercados(e.target.value)} placeholder="nacional, internacional" />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Idioma base</label>
          <input style={s.input} value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="pt" />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Público-alvo</label>
        <input style={s.input} value={publico} onChange={(e) => setPublico(e.target.value)} />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Estratégia de promoção</label>
          <select style={s.input} value={estrategia} onChange={(e) => setEstrategia(e.target.value as EstrategiaPromocao)}>
            {(Object.keys(ESTRATEGIA_LABEL) as EstrategiaPromocao[]).map((k) => <option key={k} value={k}>{ESTRATEGIA_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Ligação Canva (opcional)</label>
          <input style={s.input} value={canva} onChange={(e) => setCanva(e.target.value)} placeholder="https://canva.com/…" />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Notas internas</label>
        <textarea style={{ ...s.input, minHeight: 70 }} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      <div style={s.acoes}>
        {onCancelar && <button type="button" style={s.btnOff} onClick={onCancelar}>Cancelar</button>}
        <button type="submit" style={{ ...s.btn, ...(aGuardar ? { opacity: 0.6 } : {}) }} disabled={aGuardar}>
          {aGuardar ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

const s: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  linha: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  grupo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  hint: { fontWeight: 400, fontSize: 12 },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface, #fff)', font: 'inherit' },
  acoes: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: 'pointer' },
  btnOff: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 18px', fontWeight: 600, cursor: 'pointer' },
}
