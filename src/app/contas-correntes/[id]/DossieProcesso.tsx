'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { formatarData } from '@/lib/cc'
import {
  listarIncidencias, criarIncidencia, atualizarEstadoIncidencia, eliminarIncidencia,
  carregarFotosIncidencia, removerFotoIncidencia,
  listarDocumentos, carregarDocumentos, removerDocumento,
  dossieAutomatico,
  estadoIncidenciaInfo, gravidadeInfo, TIPOS_INCIDENCIA, GRAVIDADES, ESTADOS_INCIDENCIA,
  type Incidencia, type ProcessoDocumento, type DossieAuto,
  type TipoIncidencia, type GravidadeIncidencia, type EstadoIncidencia,
} from '@/lib/ccDossie'

export default function DossieProcesso({ consignacaoId, numeroSerie, equipamentoId, onMudouIncidencias }: {
  consignacaoId: string; numeroSerie: string | null; equipamentoId: string | null
  onMudouIncidencias?: () => void
}) {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [documentos, setDocumentos] = useState<ProcessoDocumento[]>([])
  const [auto, setAuto] = useState<DossieAuto>({ folhas: [], trackings: [] })
  const [carregando, setCarregando] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  async function recarregar() {
    const [inc, docs] = await Promise.all([listarIncidencias(consignacaoId), listarDocumentos(consignacaoId)])
    setIncidencias(inc)
    setDocumentos(docs)
    setCarregando(false)
  }
  useEffect(() => {
    let vivo = true
    Promise.all([
      listarIncidencias(consignacaoId),
      listarDocumentos(consignacaoId),
      dossieAutomatico(numeroSerie, equipamentoId),
    ]).then(([inc, docs, a]) => {
      if (!vivo) return
      setIncidencias(inc); setDocumentos(docs); setAuto(a); setCarregando(false)
    })
    return () => { vivo = false }
  }, [consignacaoId, numeroSerie, equipamentoId])

  if (carregando) return <p style={c.aCarregar}>A carregar dossiê...</p>

  return (
    <div style={c.dossie}>
      {/* Incidências */}
      <section style={c.seccao}>
        <div style={c.seccaoTopo}>
          <span style={c.seccaoTitulo}>⚠️ Incidências ({incidencias.length})</span>
          <button style={c.btnSm} onClick={() => setAddOpen((v) => !v)}>{addOpen ? '× Fechar' : '+ Nova'}</button>
        </div>
        {addOpen && (
          <FormIncidencia
            consignacaoId={consignacaoId}
            onCancelar={() => setAddOpen(false)}
            onGuardado={() => { setAddOpen(false); recarregar(); onMudouIncidencias?.() }}
          />
        )}
        {incidencias.length === 0 && !addOpen && <p style={c.vazio}>Sem incidências registadas.</p>}
        {incidencias.map((inc) => (
          <CartaoIncidencia
            key={inc.id}
            inc={inc}
            onMudou={() => { recarregar(); onMudouIncidencias?.() }}
          />
        ))}
      </section>

      {/* Documentos */}
      <section style={c.seccao}>
        <div style={c.seccaoTopo}>
          <span style={c.seccaoTitulo}>📎 Documentos ({documentos.length})</span>
          <UploadDocumentos consignacaoId={consignacaoId} onCarregado={recarregar} />
        </div>
        {documentos.length === 0 ? (
          <p style={c.vazio}>Sem documentos carregados.</p>
        ) : (
          <div style={c.docsGrid}>
            {documentos.map((d) => <Anexo key={d.id} nome={d.nome} url={d.signedUrl} tipo={d.tipo} onRemover={async () => {
              if (!window.confirm('Remover este documento?')) return
              await removerDocumento(d); recarregar()
            }} />)}
          </div>
        )}
      </section>

      {/* Folhas de obra ligadas (auto) */}
      <section style={c.seccao}>
        <span style={c.seccaoTitulo}>🔧 Folhas de obra ligadas ({auto.folhas.length})</span>
        {auto.folhas.length === 0 ? (
          <p style={c.vazio}>Sem folhas de obra concluídas para este nº de série.</p>
        ) : (
          <div style={c.lista}>
            {auto.folhas.map((f) => (
              <a key={f.id} href={`/tecnico/folhas-obra/${f.id}`} target="_blank" rel="noreferrer" style={c.linhaLink}>
                <span><strong>{f.numero}</strong>{f.equipamento_modelo ? ` · ${f.equipamento_modelo}` : ''}</span>
                <span style={c.linhaMeta}>{formatarData(f.data_intervencao)}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Tracking / envios ligados (auto) */}
      <section style={c.seccao}>
        <span style={c.seccaoTitulo}>🚚 Envios ligados ({auto.trackings.length})</span>
        {auto.trackings.length === 0 ? (
          <p style={c.vazio}>Sem envios de tracking associados a este equipamento.</p>
        ) : (
          <div style={c.lista}>
            {auto.trackings.map((t) => (
              <div key={t.id} style={c.linha}>
                <span><strong>{t.tracking_number || t.awb || '—'}</strong>{t.entidade_nome ? ` · ${t.entidade_nome}` : ''}</span>
                <span style={c.linhaMeta}>{[t.direcao, t.estado, formatarData(t.data_expedicao)].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Cartão de uma incidência ────────────────────────────────────────────────
function CartaoIncidencia({ inc, onMudou }: { inc: Incidencia; onMudou: () => void }) {
  const [aProcessar, setAProcessar] = useState(false)
  const info = estadoIncidenciaInfo(inc.estado)
  const grav = gravidadeInfo(inc.gravidade)
  const tipoLabel = TIPOS_INCIDENCIA.find((t) => t.valor === inc.tipo)?.label ?? inc.tipo
  const fileRef = useRef<HTMLInputElement>(null)

  async function mudarEstado(estado: EstadoIncidencia) {
    let resolucao: string | null | undefined
    if (estado === 'resolvida' || estado === 'fechada') {
      resolucao = window.prompt('Nota de resolução (opcional):', inc.resolucao ?? '') ?? undefined
    }
    setAProcessar(true)
    await atualizarEstadoIncidencia(inc.id, estado, resolucao)
    setAProcessar(false)
    onMudou()
  }
  async function eliminar() {
    if (!window.confirm('Eliminar esta incidência e as suas fotos?')) return
    setAProcessar(true)
    await eliminarIncidencia(inc)
    setAProcessar(false)
    onMudou()
  }
  async function carregarFotos(files: FileList | null) {
    if (!files || !files.length) return
    setAProcessar(true)
    await carregarFotosIncidencia(inc.id, Array.from(files))
    setAProcessar(false)
    onMudou()
  }

  return (
    <div style={{ ...c.inc, borderLeft: `4px solid ${grav.cor}` }}>
      <div style={c.incTopo}>
        <div style={{ minWidth: 0 }}>
          <span style={c.incTitulo}>{inc.titulo}</span>
          <div style={c.incMeta}>
            <span style={{ ...c.pill, color: grav.cor, background: grav.bg }}>{grav.label}</span>
            <span style={c.incTipo}>{tipoLabel}</span>
            <span> · aberta {formatarData(inc.data_abertura)}</span>
            {inc.criado_por_nome && <span> · {inc.criado_por_nome}</span>}
          </div>
        </div>
        <span style={{ ...c.pill, color: info.cor, background: info.bg }}>{info.label}</span>
      </div>

      {inc.descricao && <p style={c.incDesc}>{inc.descricao}</p>}
      {inc.resolucao && <p style={c.incResol}>✓ Resolução: {inc.resolucao}{inc.data_resolucao ? ` (${formatarData(inc.data_resolucao)})` : ''}</p>}

      {inc.fotos.length > 0 && (
        <div style={c.fotos}>
          {inc.fotos.map((f) => (
            <div key={f.id} style={c.fotoWrap}>
              {f.signedUrl
                ? <a href={f.signedUrl} target="_blank" rel="noreferrer"><img src={f.signedUrl} alt={f.nome ?? ''} style={c.foto} /></a>
                : <div style={c.fotoVazia}>?</div>}
              <button style={c.fotoX} title="Remover" disabled={aProcessar} onClick={async () => {
                if (!window.confirm('Remover esta foto?')) return
                setAProcessar(true); await removerFotoIncidencia(f); setAProcessar(false); onMudou()
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={c.incAcoes}>
        <select
          value={inc.estado}
          disabled={aProcessar}
          onChange={(e) => mudarEstado(e.target.value as EstadoIncidencia)}
          style={c.selectSm}
        >
          {ESTADOS_INCIDENCIA.map((es) => <option key={es.valor} value={es.valor}>{es.label}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { carregarFotos(e.target.files); if (fileRef.current) fileRef.current.value = '' }} />
        <button style={c.btnSm} disabled={aProcessar} onClick={() => fileRef.current?.click()}>+ Foto</button>
        <button style={c.btnPerigoSm} disabled={aProcessar} onClick={eliminar}>Eliminar</button>
      </div>
    </div>
  )
}

// ─── Formulário: nova incidência ─────────────────────────────────────────────
function FormIncidencia({ consignacaoId, onCancelar, onGuardado }: {
  consignacaoId: string; onCancelar: () => void; onGuardado: () => void
}) {
  const { perfil } = useAuth()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<TipoIncidencia>('avaria')
  const [gravidade, setGravidade] = useState<GravidadeIncidencia>('media')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function guardar() {
    if (!titulo.trim()) { setErro('Indica um título para a incidência.'); return }
    setErro(null); setAGuardar(true)
    const { error } = await criarIncidencia(
      { consignacao_id: consignacaoId, titulo, descricao, tipo, gravidade },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    setAGuardar(false)
    if (error) { setErro('Não foi possível guardar: ' + error.message); return }
    onGuardado()
  }

  return (
    <div style={c.form}>
      {erro && <div style={c.erro}>{erro}</div>}
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Peça de mão avariada)" style={c.input} />
      <div style={c.grelha2}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia)} style={c.input}>
          {TIPOS_INCIDENCIA.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
        </select>
        <select value={gravidade} onChange={(e) => setGravidade(e.target.value as GravidadeIncidencia)} style={c.input}>
          {GRAVIDADES.map((g) => <option key={g.valor} value={g.valor}>Gravidade: {g.label}</option>)}
        </select>
      </div>
      <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" style={{ ...c.input, minHeight: 52, resize: 'vertical' }} />
      <div style={c.formAcoes}>
        <button style={c.btnPrimarioSm} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar...' : 'Registar incidência'}</button>
        <button style={c.btnSm} disabled={aGuardar} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Upload de documentos ─────────────────────────────────────────────────────
function UploadDocumentos({ consignacaoId, onCarregado }: { consignacaoId: string; onCarregado: () => void }) {
  const { perfil } = useAuth()
  const ref = useRef<HTMLInputElement>(null)
  const [aCarregar, setACarregar] = useState(false)

  async function carregar(files: FileList | null) {
    if (!files || !files.length) return
    setACarregar(true)
    await carregarDocumentos(consignacaoId, Array.from(files), { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
    setACarregar(false)
    onCarregado()
  }
  return (
    <>
      <input ref={ref} type="file" multiple style={{ display: 'none' }}
        onChange={(e) => { carregar(e.target.files); if (ref.current) ref.current.value = '' }} />
      <button style={c.btnSm} disabled={aCarregar} onClick={() => ref.current?.click()}>
        {aCarregar ? 'A carregar...' : '+ Anexar'}
      </button>
    </>
  )
}

function Anexo({ nome, url, tipo, onRemover }: { nome: string | null; url?: string; tipo: string; onRemover: () => void }) {
  const eFoto = tipo === 'foto' && url
  return (
    <div style={c.anexo}>
      {eFoto
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={nome ?? ''} style={c.anexoImg} /></a>
        : <a href={url} target="_blank" rel="noreferrer" style={c.anexoDoc}>📄</a>}
      <span style={c.anexoNome} title={nome ?? ''}>{nome ?? 'ficheiro'}</span>
      <button style={c.anexoX} title="Remover" onClick={onRemover}>×</button>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  dossie: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10, paddingTop: 12, borderTop: '1px dashed var(--border)' },
  aCarregar: { color: 'var(--muted)', fontSize: 13, padding: 8 },
  seccao: { display: 'flex', flexDirection: 'column', gap: 8 },
  seccaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  seccaoTitulo: { fontSize: 13, fontWeight: 800, color: 'var(--foreground)' },
  vazio: { fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' },
  lista: { display: 'flex', flexDirection: 'column', gap: 6 },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 10px', background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8 },
  linhaLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 10px', background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', textDecoration: 'none' },
  linhaMeta: { color: 'var(--muted)', whiteSpace: 'nowrap' },
  inc: { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  incTopo: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  incTitulo: { fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' },
  incMeta: { fontSize: 11.5, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  incTipo: { fontWeight: 600 },
  incDesc: { fontSize: 12.5, color: 'var(--foreground)', margin: 0 },
  incResol: { fontSize: 12, color: '#065F46', margin: 0, background: '#F0FDF4', padding: '4px 8px', borderRadius: 6 },
  pill: { display: 'inline-block', fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '1px 8px' },
  fotos: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  fotoWrap: { position: 'relative' },
  foto: { width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', display: 'block' },
  fotoVazia: { width: 60, height: 60, borderRadius: 6, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--muted)', background: '#F9FAFB' },
  fotoX: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 999, border: 'none', background: '#B91C1C', color: '#fff', fontSize: 12, lineHeight: '18px', cursor: 'pointer', padding: 0 },
  incAcoes: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  docsGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  anexo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 84, position: 'relative' },
  anexoImg: { width: 84, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', display: 'block' },
  anexoDoc: { width: 84, height: 64, borderRadius: 6, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 26, textDecoration: 'none' },
  anexoNome: { fontSize: 10.5, color: 'var(--muted)', maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  anexoX: { position: 'absolute', top: -6, right: 2, width: 18, height: 18, borderRadius: 999, border: 'none', background: '#B91C1C', color: '#fff', fontSize: 12, lineHeight: '18px', cursor: 'pointer', padding: 0 },
  form: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  formAcoes: { display: 'flex', gap: 8, alignItems: 'center' },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', background: '#fff' },
  selectSm: { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 },
  btnSm: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
  btnPrimarioSm: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  btnPerigoSm: { background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' },
}
