'use client'

import { useState } from 'react'
import type { CampanhaInput, LinhaNegocio, EstadoCampanha } from '@/types/marketing'
import { LINHA_NEGOCIO_LABEL } from '@/types/marketing'

// Formulário de campanha, reutilizado por "nova" e por "detalhe/editar".
type Props = {
  inicial?: Partial<CampanhaInput>
  aGuardar?: boolean
  onSubmit: (input: CampanhaInput) => void
  onCancelar?: () => void
}

const listaParaTexto = (a?: string[] | null) => (a ?? []).join(', ')
const textoParaLista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export default function CampanhaForm({ inicial, aGuardar, onSubmit, onCancelar }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [objetivo, setObjetivo] = useState(inicial?.objetivo_comercial ?? '')
  const [linha, setLinha] = useState<LinhaNegocio | ''>(inicial?.linha_negocio ?? '')
  const [oferta, setOferta] = useState(inicial?.oferta ?? '')
  const [mercados, setMercados] = useState(listaParaTexto(inicial?.mercados))
  const [publicos, setPublicos] = useState(inicial?.publicos ?? '')
  const [dataInicio, setDataInicio] = useState(inicial?.data_inicio ?? '')
  const [dataFim, setDataFim] = useState(inicial?.data_fim ?? '')
  const [idiomas, setIdiomas] = useState(listaParaTexto(inicial?.idiomas))
  const [canais, setCanais] = useState(listaParaTexto(inicial?.canais))
  const [landing, setLanding] = useState(inicial?.landing_url ?? '')
  const [kpi, setKpi] = useState(inicial?.kpi_principal ?? '')
  const [kpis2, setKpis2] = useState(inicial?.kpis_secundarios ?? '')
  const [estado, setEstado] = useState<EstadoCampanha>(inicial?.estado ?? 'rascunho')
  const [notas, setNotas] = useState(inicial?.notas ?? '')

  function submeter(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    onSubmit({
      nome, objetivo_comercial: objetivo, linha_negocio: linha || null, oferta,
      mercados: textoParaLista(mercados), publicos, data_inicio: dataInicio || null,
      data_fim: dataFim || null, idiomas: textoParaLista(idiomas), canais: textoParaLista(canais),
      landing_url: landing, kpi_principal: kpi, kpis_secundarios: kpis2, estado, notas,
    })
  }

  return (
    <form onSubmit={submeter} style={s.form}>
      <div style={s.grupo}>
        <label style={s.label}>Nome da campanha *</label>
        <input style={s.input} value={nome} onChange={(e) => setNome(e.target.value)} required />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Linha de negócio</label>
          <select style={s.input} value={linha} onChange={(e) => setLinha(e.target.value as LinhaNegocio | '')}>
            <option value="">—</option>
            {(Object.keys(LINHA_NEGOCIO_LABEL) as LinhaNegocio[]).map((k) => (
              <option key={k} value={k}>{LINHA_NEGOCIO_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Estado</label>
          <select style={s.input} value={estado} onChange={(e) => setEstado(e.target.value as EstadoCampanha)}>
            <option value="rascunho">Rascunho</option>
            <option value="ativa">Ativa</option>
            <option value="encerrada">Encerrada</option>
          </select>
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Objetivo comercial</label>
        <input style={s.input} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
      </div>
      <div style={s.grupo}>
        <label style={s.label}>Oferta</label>
        <input style={s.input} value={oferta} onChange={(e) => setOferta(e.target.value)} />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Mercados <span style={s.hint}>(separados por vírgula)</span></label>
          <input style={s.input} value={mercados} onChange={(e) => setMercados(e.target.value)} placeholder="nacional, internacional" />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Públicos</label>
          <input style={s.input} value={publicos} onChange={(e) => setPublicos(e.target.value)} />
        </div>
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Início</label>
          <input type="date" style={s.input} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Fim</label>
          <input type="date" style={s.input} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>Idiomas <span style={s.hint}>(vírgula)</span></label>
          <input style={s.input} value={idiomas} onChange={(e) => setIdiomas(e.target.value)} placeholder="pt, en" />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>Canais <span style={s.hint}>(vírgula)</span></label>
          <input style={s.input} value={canais} onChange={(e) => setCanais(e.target.value)} placeholder="instagram, facebook, linkedin" />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Landing page / contacto</label>
        <input style={s.input} value={landing} onChange={(e) => setLanding(e.target.value)} />
      </div>

      <div style={s.linha}>
        <div style={s.grupo}>
          <label style={s.label}>KPI principal</label>
          <input style={s.input} value={kpi} onChange={(e) => setKpi(e.target.value)} />
        </div>
        <div style={s.grupo}>
          <label style={s.label}>KPIs secundários</label>
          <input style={s.input} value={kpis2} onChange={(e) => setKpis2(e.target.value)} />
        </div>
      </div>

      <div style={s.grupo}>
        <label style={s.label}>Notas / documentação</label>
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
