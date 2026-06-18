'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarNotasNaFase, concluirFase, guardarEncaixotamento,
  listarFotosEncaix, adicionarFotoEncaix, apagarFotoEncaix,
  uploadFicheiro, BUCKET_ENCAIX, type EncaixFoto,
} from '@/lib/neFluxo'
import { CAIXAS_STANDARD } from '@/lib/caixas-standard'
import type { NotaEncomenda } from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

export default function EncaixotamentoPage() {
  const { session, perfil } = useAuth()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<NotaEncomenda | null>(null)

  // Formulário
  const [caixa, setCaixa] = useState('')
  const [iC, setIC] = useState(''); const [iL, setIL] = useState(''); const [iA, setIA] = useState('')
  const [eC, setEC] = useState(''); const [eL, setEL] = useState(''); const [eA, setEA] = useState('')
  const [pBruto, setPBruto] = useState(''); const [pLiquido, setPLiquido] = useState('')
  const [obs, setObs] = useState('')
  const [fotos, setFotos] = useState<EncaixFoto[]>([])
  const [aCarregar, setACarregar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    setNotas(await listarNotasNaFase('logistica_encaixotamento'))
    setCarregando(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  async function abrir(n: NotaEncomenda) {
    setAberta(n)
    setCaixa(''); setIC(''); setIL(''); setIA(''); setEC(''); setEL(''); setEA('')
    setPBruto(''); setPLiquido(''); setObs('')
    setFotos(await listarFotosEncaix(n.id))
  }

  function escolherCaixa(nome: string) {
    setCaixa(nome)
    const cx = CAIXAS_STANDARD.find((c) => c.nome === nome)
    if (!cx || cx.custom) { setIC(''); setIL(''); setIA(''); setEC(''); setEL(''); setEA(''); return }
    setIC(cx.interior ? String(cx.interior.c) : ''); setIL(cx.interior ? String(cx.interior.l) : ''); setIA(cx.interior ? String(cx.interior.a) : '')
    setEC(cx.exterior ? String(cx.exterior.c) : ''); setEL(cx.exterior ? String(cx.exterior.l) : ''); setEA(cx.exterior ? String(cx.exterior.a) : '')
  }

  async function aoCarregar(e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video') {
    if (!aberta) return
    const ficheiros = Array.from(e.target.files ?? [])
    if (ficheiros.length === 0) return
    setACarregar(true)
    for (const f of ficheiros) {
      const r = await uploadFicheiro(BUCKET_ENCAIX, aberta.id, f)
      if (r) await adicionarFotoEncaix(aberta.id, r.url, r.caminho, tipo)
    }
    setACarregar(false)
    if (fotoRef.current) fotoRef.current.value = ''
    if (videoRef.current) videoRef.current.value = ''
    setFotos(await listarFotosEncaix(aberta.id))
  }

  async function removerFoto(f: EncaixFoto) {
    if (!aberta) return
    if (!window.confirm('Apagar este ficheiro?')) return
    await apagarFotoEncaix(f.id, f.caminho)
    setFotos(await listarFotosEncaix(aberta.id))
  }

  const numFotos = fotos.filter((f) => f.tipo === 'foto').length
  const ehCustom = CAIXAS_STANDARD.find((c) => c.nome === caixa)?.custom ?? false

  async function concluir() {
    if (!aberta || numFotos < 1) return
    if (!window.confirm('Concluir o encaixotamento e enviar para expedição?')) return
    setAGuardar(true)
    await guardarEncaixotamento(aberta.id, {
      caixa_tipo: caixa || null,
      interior_comprimento: num(iC), interior_largura: num(iL), interior_altura: num(iA),
      exterior_comprimento: num(eC), exterior_largura: num(eL), exterior_altura: num(eA),
      peso_bruto: num(pBruto), peso_liquido: num(pLiquido),
      notas: obs.trim() || null,
    })
    const nome = perfil?.nome ?? perfil?.email ?? null
    const { error } = await concluirFase(aberta, 'logistica_encaixotamento', { id: session?.user.id ?? null, nome })
    setAGuardar(false)
    if (error) { alert('Erro: ' + error.message); return }
    setAberta(null)
    carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Encaixotamento</h1>
          <Link href="/logistico" style={c.voltar}>← Logística</Link>
        </div>
        <span style={c.contador}>{notas.length} em curso</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : notas.length === 0 ? (
        <p style={c.estado}>Não há equipamentos para encaixotar.</p>
      ) : (
        <div style={c.tabelaWrap}>
          <table style={c.tabela}>
            <thead>
              <tr>
                <th style={c.th}>NE</th><th style={c.th}>Data</th><th style={c.th}>Cliente</th>
                <th style={c.th}>País</th><th style={c.th}>Equipamento</th><th style={c.th}>SN</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} onClick={() => abrir(n)} style={c.tr}>
                  <td style={{ ...c.td, fontWeight: 700 }}>{n.numero ?? '—'}</td>
                  <td style={c.td}>{formatarData(n.data_pedido)}</td>
                  <td style={c.td}>{n.cliente_nome ?? '—'}</td>
                  <td style={c.td}>{n.pais_destino ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_modelo ?? '—'}</td>
                  <td style={c.td}>{n.equipamento_sn ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberta && (
        <div style={c.backdrop} onClick={() => setAberta(null)}>
          <div style={c.painel} onClick={(e) => e.stopPropagation()}>
            <div style={c.painelTopo}>
              <strong>{aberta.numero} · {aberta.equipamento_modelo ?? '—'} (SN {aberta.equipamento_sn ?? '—'})</strong>
              <button onClick={() => setAberta(null)} style={c.fechar} aria-label="Fechar">×</button>
            </div>

            <label style={c.campo}>
              <span style={c.rot}>Caixa</span>
              <select value={caixa} onChange={(e) => escolherCaixa(e.target.value)} style={c.input}>
                <option value="">Escolher caixa...</option>
                {CAIXAS_STANDARD.map((cx) => <option key={cx.nome} value={cx.nome}>{cx.nome}</option>)}
              </select>
            </label>

            <div style={c.medidasBloco}>
              <span style={c.rot}>Interior (cm){!ehCustom && caixa ? ' — automático' : ''}</span>
              <div style={c.grid3}>
                <input placeholder="Comp." value={iC} onChange={(e) => setIC(e.target.value)} style={c.input} inputMode="decimal" />
                <input placeholder="Larg." value={iL} onChange={(e) => setIL(e.target.value)} style={c.input} inputMode="decimal" />
                <input placeholder="Alt." value={iA} onChange={(e) => setIA(e.target.value)} style={c.input} inputMode="decimal" />
              </div>
            </div>
            <div style={c.medidasBloco}>
              <span style={c.rot}>Exterior (cm){!ehCustom && caixa ? ' — automático' : ''}</span>
              <div style={c.grid3}>
                <input placeholder="Comp." value={eC} onChange={(e) => setEC(e.target.value)} style={c.input} inputMode="decimal" />
                <input placeholder="Larg." value={eL} onChange={(e) => setEL(e.target.value)} style={c.input} inputMode="decimal" />
                <input placeholder="Alt." value={eA} onChange={(e) => setEA(e.target.value)} style={c.input} inputMode="decimal" />
              </div>
            </div>

            <div style={c.grid2}>
              <label style={c.campo}><span style={c.rot}>Peso bruto (kg)</span>
                <input value={pBruto} onChange={(e) => setPBruto(e.target.value)} style={c.input} inputMode="decimal" /></label>
              <label style={c.campo}><span style={c.rot}>Peso líquido (kg)</span>
                <input value={pLiquido} onChange={(e) => setPLiquido(e.target.value)} style={c.input} inputMode="decimal" /></label>
            </div>

            <div style={c.campo}>
              <span style={c.rot}>Fotos {numFotos > 0 && `(${numFotos})`} — mínimo 1</span>
              <div style={c.uploadLinha}>
                <label style={c.btnUpload}>+ Fotos
                  <input ref={fotoRef} type="file" accept="image/*" multiple disabled={aCarregar} onChange={(e) => aoCarregar(e, 'foto')} style={{ display: 'none' }} />
                </label>
                <label style={c.btnUploadGhost}>+ Vídeos
                  <input ref={videoRef} type="file" accept="video/*" multiple disabled={aCarregar} onChange={(e) => aoCarregar(e, 'video')} style={{ display: 'none' }} />
                </label>
                {aCarregar && <span style={c.ajuda}>A carregar...</span>}
              </div>
              {fotos.length > 0 && (
                <div style={c.grelha}>
                  {fotos.map((f) => (
                    <div key={f.id} style={c.miniWrap}>
                      {f.tipo === 'video'
                        ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={c.miniVideo}>▶ vídeo</a>
                        // eslint-disable-next-line @next/next/no-img-element
                        : <a href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt="foto" style={c.mini} /></a>}
                      <button onClick={() => removerFoto(f)} style={c.miniX} title="Apagar">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label style={c.campo}><span style={c.rot}>Notas</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} style={c.textarea} /></label>

            <button onClick={concluir} disabled={aGuardar || numFotos < 1} style={{ ...c.btnPrimario, opacity: numFotos < 1 ? 0.5 : 1 }}>
              {aGuardar ? 'A guardar...' : 'Concluir Encaixotamento'}
            </button>
            {numFotos < 1 && <span style={c.ajuda}>Adiciona pelo menos 1 foto para concluir.</span>}
          </div>
        </div>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  contador: { color: 'var(--muted)', fontSize: 14, alignSelf: 'center', whiteSpace: 'nowrap' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabelaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '12px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', color: 'var(--foreground)', whiteSpace: 'nowrap' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 },
  painel: { background: 'var(--surface)', borderRadius: 12, padding: 18, width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92vh', overflowY: 'auto' },
  painelTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  medidasBloco: { display: 'flex', flexDirection: 'column', gap: 6 },
  rot: { color: 'var(--muted)', fontWeight: 600, fontSize: 13 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  uploadLinha: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btnUpload: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnUploadGhost: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginTop: 8 },
  miniWrap: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' },
  mini: { width: '100%', height: 84, objectFit: 'cover', display: 'block' },
  miniVideo: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 84, fontSize: 13, color: 'var(--primary)', textDecoration: 'none', background: 'var(--background)' },
  miniX: { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 4 },
}
