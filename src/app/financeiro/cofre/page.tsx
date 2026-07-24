'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarCategorias, listarDocumentos, criarDocumento, atualizarDocumento, arquivarDocumento,
  anexarFicheiro, removerFicheiro, abrirFicheiro, diasAteValidade, listarAcessos,
  type Categoria, type DocumentoCofre, type FicheiroCofre, type AcessoLog, type DocumentoInput,
} from '@/lib/cofre'

function formatarData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}
function tamanho(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Estado da validade (para destaque).
function validadeInfo(data: string | null): { txt: string; cor: string; bg: string } | null {
  const n = diasAteValidade(data)
  if (n === null) return null
  if (n < 0) return { txt: `Expirado (${formatarData(data)})`, cor: '#B91C1C', bg: '#FEF2F2' }
  if (n <= 30) return { txt: `Expira em ${n} dia${n === 1 ? '' : 's'}`, cor: '#92400E', bg: '#FEF3C7' }
  return { txt: `Válido até ${formatarData(data)}`, cor: '#065F46', bg: '#ECFDF5' }
}

export default function CofrePage() {
  const { perfil, isAdmin } = useAuth()
  const [cats, setCats] = useState<Categoria[]>([])
  const [docs, setDocs] = useState<DocumentoCofre[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [modo, setModo] = useState<null | 'novo' | string>(null) // null | 'novo' | docId
  const [msg, setMsg] = useState<string | null>(null)
  const [acessos, setAcessos] = useState<{ docId: string; linhas: AcessoLog[] } | null>(null)

  const carregar = useCallback(async () => {
    setDocs(await listarDocumentos())
    setCarregando(false)
  }, [])
  useEffect(() => { listarCategorias().then(setCats) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return docs.filter((d) => {
      if (cat && d.categoria_id !== cat) return false
      if (q && !`${d.titulo} ${d.descricao ?? ''} ${d.entidade_nome ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, busca, cat])

  const aExpirar = useMemo(() => docs.filter((d) => { const n = diasAteValidade(d.data_validade); return n !== null && n <= 30 }).length, [docs])

  async function verAcessos(docId: string) {
    if (acessos?.docId === docId) { setAcessos(null); return }
    setAcessos({ docId, linhas: await listarAcessos(docId) })
  }

  async function abrir(f: FicheiroCofre, acao: 'view' | 'download', doc: DocumentoCofre) {
    const url = await abrirFicheiro(f, acao, doc)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setMsg('Não foi possível abrir o ficheiro.')
  }

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro" style={c.voltar}>← Financeiro</Link>
          <h1 style={c.titulo}>🔐 Cofre de Documentos</h1>
          <p style={c.sub}>Documentos importantes da empresa — acesso restrito e auditado.</p>
        </div>
        <button style={c.btnPrimario} onClick={() => setModo(modo === 'novo' ? null : 'novo')}>{modo === 'novo' ? 'Cancelar' : '+ Novo documento'}</button>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}
      {aExpirar > 0 && <div style={c.alertaValidade}>⚠️ {aExpirar} documento(s) a expirar nos próximos 30 dias.</div>}

      {modo === 'novo' && (
        <FormDoc cats={cats} perfil={perfil} onClose={() => setModo(null)} onGravado={carregar} />
      )}

      {/* Filtros */}
      <div style={c.filtros}>
        <input placeholder="Procurar por título, descrição ou entidade..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...c.input, flex: 1, minWidth: 200 }} />
      </div>
      <div style={c.chips}>
        <button style={{ ...c.chip, ...(cat === '' ? c.chipAtivo : {}) }} onClick={() => setCat('')}>Todas</button>
        {cats.map((k) => <button key={k.id} style={{ ...c.chip, ...(cat === k.id ? c.chipAtivo : {}) }} onClick={() => setCat(k.id)}>{k.nome}</button>)}
      </div>

      <div style={c.resumo}>{filtrados.length} documento(s)</div>

      {carregando ? <p style={c.estado}>A carregar...</p> : filtrados.length === 0 ? <p style={c.estado}>Sem documentos.</p> : (
        <div style={c.grelha}>
          {filtrados.map((d) => {
            const v = validadeInfo(d.data_validade)
            const emEdicao = modo === d.id
            return (
              <div key={d.id} style={c.cartao}>
                {emEdicao ? (
                  <FormDoc cats={cats} perfil={perfil} doc={d} onClose={() => setModo(null)} onGravado={carregar} onAbrir={abrir} />
                ) : (
                  <>
                    <div style={c.cartaoTopo}>
                      <span style={c.cartaoTitulo}>{d.titulo}</span>
                      {d.categoria?.nome && <span style={c.catBadge}>{d.categoria.nome}</span>}
                    </div>
                    {v && <span style={{ ...c.validadeBadge, color: v.cor, background: v.bg }}>{v.txt}</span>}
                    {d.entidade_nome && <div style={c.entidade}>🏛️ {d.entidade_nome}</div>}
                    {d.descricao && <div style={c.descricao}>{d.descricao}</div>}

                    {(d.ficheiros ?? []).length > 0 && (
                      <div style={c.ficheiros}>
                        {(d.ficheiros ?? []).map((f) => (
                          <div key={f.id} style={c.ficheiro}>
                            <span style={c.fNome} title={f.nome ?? ''}>📎 {f.nome ?? 'ficheiro'} <span style={c.fTam}>{tamanho(f.tamanho)}</span></span>
                            <span style={c.fAcoes}>
                              <button style={c.linkBtn} onClick={() => abrir(f, 'view', d)}>Ver</button>
                              <button style={c.linkBtn} onClick={() => abrir(f, 'download', d)}>↓</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={c.cartaoAcoes}>
                      <button style={c.acaoBtn} onClick={() => setModo(d.id)}>✏️ Editar</button>
                      <button style={c.acaoBtn} onClick={async () => { if (confirm('Arquivar este documento?')) { await arquivarDocumento(d.id); carregar() } }}>🗄️ Arquivar</button>
                      {isAdmin && <button style={c.acaoBtn} onClick={() => verAcessos(d.id)}>👁️ Acessos</button>}
                    </div>

                    {isAdmin && acessos?.docId === d.id && (
                      <div style={c.acessos}>
                        <div style={c.acessosTit}>Histórico de acessos</div>
                        {acessos.linhas.length === 0 ? <span style={c.muted}>Sem acessos registados.</span> : acessos.linhas.map((a) => (
                          <div key={a.id} style={c.acessoLinha}>
                            <span>{a.acao === 'download' ? '↓ Descarregou' : '👁️ Viu'}</span>
                            <span style={c.muted}>{a.user_nome ?? '—'}</span>
                            <span style={c.muted}>{new Date(a.created_at).toLocaleString('pt-PT')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

// ─── Formulário (novo/editar) com upload drag & drop ─────────────────────────

function FormDoc({ cats, perfil, doc, onClose, onGravado, onAbrir }: {
  cats: Categoria[]
  perfil: { id: string; nome: string | null } | null
  doc?: DocumentoCofre
  onClose: () => void
  onGravado: () => Promise<void> | void
  onAbrir?: (f: FicheiroCofre, acao: 'view' | 'download', doc: DocumentoCofre) => void
}) {
  const editar = !!doc
  const [titulo, setTitulo] = useState(doc?.titulo ?? '')
  const [categoria, setCategoria] = useState(doc?.categoria_id ?? (cats[0]?.id ?? ''))
  const [descricao, setDescricao] = useState(doc?.descricao ?? '')
  const [validade, setValidade] = useState(doc?.data_validade ?? '')
  const [entidade, setEntidade] = useState(doc?.entidade_nome ?? '')
  const [staged, setStaged] = useState<File[]>([])
  const [ficheiros, setFicheiros] = useState<FicheiroCofre[]>(doc?.ficheiros ?? [])
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function receberFicheiros(files: FileList | null) {
    if (!files || files.length === 0) return
    const novos = Array.from(files)
    if (editar) { void enviarParaDoc(novos) } else setStaged((s) => [...s, ...novos])
  }
  async function enviarParaDoc(novos: File[]) {
    if (!doc) return
    setATrabalhar(true); setErro(null)
    for (const f of novos) {
      const r = await anexarFicheiro(doc.id, f)
      if (!r.ok) { setErro('Erro no upload: ' + (r.motivo ?? '')); break }
    }
    const d = await listarDocumentos()
    setFicheiros(d.find((x) => x.id === doc.id)?.ficheiros ?? [])
    await onGravado()
    setATrabalhar(false)
  }
  async function removerF(f: FicheiroCofre) {
    if (!confirm('Remover este ficheiro?')) return
    setATrabalhar(true)
    await removerFicheiro(f.id, f.caminho)
    setFicheiros((s) => s.filter((x) => x.id !== f.id))
    await onGravado()
    setATrabalhar(false)
  }

  const input: DocumentoInput = { titulo: titulo.trim(), categoria_id: categoria || null, descricao: descricao.trim() || null, data_validade: validade || null, entidade_nome: entidade.trim() || null }

  async function guardar() {
    if (!titulo.trim()) { setErro('O título é obrigatório.'); return }
    setATrabalhar(true); setErro(null)
    if (editar && doc) {
      const { error } = await atualizarDocumento(doc.id, input)
      if (error) { setErro('Não foi possível guardar: ' + error.message); setATrabalhar(false); return }
    } else {
      const { data, error } = await criarDocumento(input, { id: perfil?.id ?? null, nome: perfil?.nome ?? null })
      if (error || !data) { setErro('Não foi possível criar: ' + (error?.message ?? '')); setATrabalhar(false); return }
      for (const f of staged) {
        const r = await anexarFicheiro((data as { id: string }).id, f)
        if (!r.ok) { setErro('Documento criado, mas falhou um ficheiro: ' + (r.motivo ?? '')); break }
      }
    }
    await onGravado()
    setATrabalhar(false)
    onClose()
  }

  return (
    <div style={c.form}>
      <div style={c.formTit}>{editar ? 'Editar documento' : 'Novo documento'}</div>
      {erro && <div style={c.erro}>{erro}</div>}
      <div style={c.grelhaForm}>
        <label style={c.campo}><span style={c.rot}>Título</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Cartão de empresa BPI" style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Categoria</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={c.input}>
            {cats.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
          </select>
        </label>
        <label style={c.campo}><span style={c.rot}>Data de validade <span style={c.opc}>(opcional)</span></span>
          <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}><span style={c.rot}>Entidade relacionada <span style={c.opc}>(opcional)</span></span>
          <input value={entidade} onChange={(e) => setEntidade(e.target.value)} placeholder="ex.: BPI, Fidelidade..." style={c.input} />
        </label>
      </div>
      <label style={c.campo}><span style={c.rot}>Descrição <span style={c.opc}>(opcional)</span></span>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} style={{ ...c.input, minHeight: 54, resize: 'vertical' }} />
      </label>

      {/* Ficheiros existentes (em edição) */}
      {editar && ficheiros.length > 0 && (
        <div style={c.ficheiros}>
          {ficheiros.map((f) => (
            <div key={f.id} style={c.ficheiro}>
              <span style={c.fNome}>📎 {f.nome ?? 'ficheiro'} <span style={c.fTam}>{tamanho(f.tamanho)}</span></span>
              <span style={c.fAcoes}>
                {onAbrir && doc && <button style={c.linkBtn} onClick={() => onAbrir(f, 'view', doc)}>Ver</button>}
                <button style={c.removerBtn} onClick={() => removerF(f)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Ficheiros por enviar (novo) */}
      {!editar && staged.length > 0 && (
        <div style={c.ficheiros}>
          {staged.map((f, i) => (
            <div key={i} style={c.ficheiro}>
              <span style={c.fNome}>📎 {f.name} <span style={c.fTam}>{tamanho(f.size)}</span></span>
              <button style={c.removerBtn} onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); receberFicheiros(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{ ...c.dropzone, ...(dragOver ? c.dropzoneAtivo : {}) }}
      >
        {aTrabalhar ? 'A carregar...' : '📥 Arrasta ficheiros para aqui ou clica para escolher (PDF, imagens...)'}
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { receberFicheiros(e.target.files); if (inputRef.current) inputRef.current.value = '' }} />
      </div>

      <div style={c.formAcoes}>
        <button style={c.btnPrimario} disabled={aTrabalhar || !titulo.trim()} onClick={guardar}>{editar ? 'Guardar alterações' : 'Criar documento'}</button>
        <button style={c.btnGhost} onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1050, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  alertaValidade: { background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12, fontWeight: 600 },
  filtros: { display: 'flex', gap: 10, marginBottom: 10 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  chips: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  chip: { padding: '6px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 999, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)', fontSize: 13 },
  chipAtivo: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  resumo: { color: 'var(--muted)', fontSize: 13, marginBottom: 10 },
  estado: { color: 'var(--muted)', padding: 8 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cartaoTitulo: { fontWeight: 700, fontSize: 15, color: 'var(--foreground)' },
  catBadge: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: '#5B21B6', background: '#EDE9FE', whiteSpace: 'nowrap' },
  validadeBadge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px', alignSelf: 'flex-start' },
  entidade: { fontSize: 13, color: 'var(--foreground)' },
  descricao: { fontSize: 13, color: 'var(--muted)' },
  ficheiros: { display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #f2f2f2', paddingTop: 8 },
  ficheiro: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 },
  fNome: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fTam: { color: 'var(--muted)', fontSize: 11.5 },
  fAcoes: { display: 'inline-flex', gap: 8, whiteSpace: 'nowrap' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  removerBtn: { background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 },
  cartaoAcoes: { display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #f2f2f2', paddingTop: 8 },
  acaoBtn: { background: 'var(--accent-bg, #eef1f6)', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, color: 'var(--foreground)' },
  acessos: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 },
  acessosTit: { fontSize: 12, fontWeight: 700, color: 'var(--muted)' },
  acessoLinha: { display: 'grid', gridTemplateColumns: '1.2fr 1.3fr 1.5fr', gap: 6, fontSize: 12.5 },
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  formTit: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  grelhaForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  dropzone: { border: '2px dashed var(--border)', borderRadius: 10, padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', background: '#fafafa' },
  dropzoneAtivo: { borderColor: 'var(--primary)', background: '#f3f0ff', color: 'var(--primary)' },
  formAcoes: { display: 'flex', gap: 10, alignItems: 'center' },
}
