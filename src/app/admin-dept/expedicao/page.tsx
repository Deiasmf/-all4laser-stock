'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarNotasNaFase, concluirFase, guardarExpedicao,
  uploadFicheiro, BUCKET_EXPED,
} from '@/lib/neFluxo'
import { TRANSPORTADORES } from '@/lib/transportadores'
import type { NotaEncomenda } from '@/types/notaEncomenda'

function formatarData(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}

type Anexo = { url: string; caminho: string } | null

const DOCS = ['AWB', 'DAU', 'CMR']

export default function ExpedicaoPage() {
  const { session, perfil } = useAuth()
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<NotaEncomenda | null>(null)

  const [transp, setTransp] = useState('')
  const [transpOutro, setTranspOutro] = useState('')
  const [valor, setValor] = useState('')
  const [fatura, setFatura] = useState<Anexo>(null)
  const [packing, setPacking] = useState<Anexo>(null)
  const [docTipo, setDocTipo] = useState('')
  const [doc, setDoc] = useState<Anexo>(null)
  const [obs, setObs] = useState('')
  const [aCarregar, setACarregar] = useState('')
  const [aGuardar, setAGuardar] = useState(false)

  async function carregar() {
    setNotas(await listarNotasNaFase('admin_expedicao'))
    setCarregando(false)
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  function abrir(n: NotaEncomenda) {
    setAberta(n)
    setTransp(''); setTranspOutro(''); setValor('')
    setFatura(null); setPacking(null); setDocTipo(''); setDoc(null); setObs('')
  }

  async function aoCarregar(e: React.ChangeEvent<HTMLInputElement>, campo: string, set: (a: Anexo) => void) {
    if (!aberta) return
    const f = e.target.files?.[0]
    if (!f) return
    setACarregar(campo)
    const r = await uploadFicheiro(BUCKET_EXPED, aberta.id, f)
    setACarregar('')
    e.target.value = ''
    if (!r) { alert('Erro a carregar o ficheiro.'); return }
    set(r)
  }

  const transportadorFinal = (transp === '__outro__' ? transpOutro : transp).trim()
  const podeConfirmar = !!transportadorFinal && !!fatura

  async function confirmar() {
    if (!aberta || !podeConfirmar) return
    if (!window.confirm('Confirmar a expedição? O equipamento passa a "Enviado".')) return
    setAGuardar(true)
    await guardarExpedicao(aberta.id, {
      transportador: transportadorFinal || null,
      valor_transporte: valor.trim() === '' ? null : Number(valor),
      fatura_url: fatura?.url ?? null, fatura_caminho: fatura?.caminho ?? null,
      packing_list_url: packing?.url ?? null, packing_list_caminho: packing?.caminho ?? null,
      doc_exportacao_url: doc?.url ?? null, doc_exportacao_caminho: doc?.caminho ?? null,
      doc_exportacao_tipo: docTipo || null,
      notas: obs.trim() || null,
    })
    const nome = perfil?.nome ?? perfil?.email ?? null
    const { error } = await concluirFase(aberta, 'admin_expedicao', { id: session?.user.id ?? null, nome })
    setAGuardar(false)
    if (error) { alert('Erro: ' + error.message); return }
    setAberta(null)
    carregar()
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Equipamentos Prontos a Enviar</h1>
          <Link href="/admin-dept" style={c.voltar}>← Administrativo</Link>
        </div>
        <span style={c.contador}>{notas.length} em curso</span>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : notas.length === 0 ? (
        <p style={c.estado}>Não há equipamentos prontos a enviar.</p>
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
              <span style={c.rot}>Transportador *</span>
              <select value={transp} onChange={(e) => setTransp(e.target.value)} style={c.input}>
                <option value="">Escolher transportador...</option>
                {TRANSPORTADORES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__outro__">Outro...</option>
              </select>
            </label>
            {transp === '__outro__' && (
              <input placeholder="Nome do transportador" value={transpOutro} onChange={(e) => setTranspOutro(e.target.value)} style={c.input} />
            )}

            <label style={c.campo}><span style={c.rot}>Valor do transporte (€)</span>
              <input value={valor} onChange={(e) => setValor(e.target.value)} style={c.input} inputMode="decimal" /></label>

            <Upload label="Fatura do transportador *" anexo={fatura} aCarregar={aCarregar === 'fatura'}
              onPick={(e) => aoCarregar(e, 'fatura', setFatura)} onClear={() => setFatura(null)} />
            <Upload label="Packing list (opcional)" anexo={packing} aCarregar={aCarregar === 'packing'}
              onPick={(e) => aoCarregar(e, 'packing', setPacking)} onClear={() => setPacking(null)} />

            <div style={c.campo}>
              <span style={c.rot}>Documento de exportação (opcional)</span>
              <div style={c.docLinha}>
                <select value={docTipo} onChange={(e) => setDocTipo(e.target.value)} style={{ ...c.input, maxWidth: 130 }}>
                  <option value="">Tipo...</option>
                  {DOCS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <div style={{ flex: 1 }}>
                  <Upload label="" anexo={doc} aCarregar={aCarregar === 'doc'}
                    onPick={(e) => aoCarregar(e, 'doc', setDoc)} onClear={() => setDoc(null)} />
                </div>
              </div>
            </div>

            <label style={c.campo}><span style={c.rot}>Notas</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} style={c.textarea} /></label>

            <button onClick={confirmar} disabled={aGuardar || !podeConfirmar} style={{ ...c.btnPrimario, opacity: podeConfirmar ? 1 : 0.5 }}>
              {aGuardar ? 'A guardar...' : 'Confirmar Expedição'}
            </button>
            {!podeConfirmar && <span style={c.ajuda}>Indica o transportador e anexa a fatura para confirmar.</span>}
          </div>
        </div>
      )}
    </main>
  )
}

function Upload({ label, anexo, aCarregar, onPick, onClear }: {
  label: string
  anexo: Anexo
  aCarregar: boolean
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
}) {
  return (
    <div style={c.campo}>
      {label && <span style={c.rot}>{label}</span>}
      <div style={c.uploadLinha}>
        <label style={c.btnUpload}>{anexo ? 'Substituir' : 'Carregar'}
          <input type="file" disabled={aCarregar} onChange={onPick} style={{ display: 'none' }} />
        </label>
        {aCarregar && <span style={c.ajuda}>A carregar...</span>}
        {anexo && !aCarregar && (
          <>
            <a href={anexo.url} target="_blank" rel="noopener noreferrer" style={c.link}>ver ficheiro</a>
            <button onClick={onClear} style={c.removerLink} type="button">remover</button>
          </>
        )}
      </div>
    </div>
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
  rot: { color: 'var(--muted)', fontWeight: 600, fontSize: 13 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  uploadLinha: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  docLinha: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  btnUpload: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  link: { color: 'var(--primary)', fontSize: 13, textDecoration: 'underline' },
  removerLink: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 4 },
}
