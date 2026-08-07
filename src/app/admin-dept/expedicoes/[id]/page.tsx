'use client'

// Detalhe da Expedição: gerir NEs incluídas, morada, transporte/tracking, carta
// de porte, packing list consolidada e transições de estado. Auditoria no fim.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { TRANSPORTADORES } from '@/lib/transportadores'
import {
  obterExpedicion, notasDaExpedicion, eventosExpedicion, notasProntas, moradasCliente,
  atualizarExpedicion, adicionarNota, removerNota, marcarEstado, expedir, marcarEntregue, cancelar,
  carregarCartaPorte, urlCartaPorte, gerarPackingListExpedicion, packingListDaExpedicion,
  type ExpedicaoPatch,
} from '@/lib/expeditions'
import { listarLinhasPacking, listarPdfsPacking, guardarVersaoPdf, urlPdfPacking } from '@/lib/packingList'
import { documentoPackingList } from '@/types/packing'
import { gerarPdfDocumento } from '@/lib/fichaPdf'
import { estadoExpInfo, tituloExpedicao, moradaLinha, TIPOS_TRANSPORTE_EXP, type Expedition, type MoradaEntrega, type ExpedicaoEvento, type TipoTransporteExp } from '@/types/expedition'
import type { NotaEncomenda } from '@/types/notaEncomenda'
import type { PackingList } from '@/types/packing'

function fdata(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}
function fdatahora(d: string) {
  const dt = new Date(d); return dt.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
}

const EVENTO_LABEL: Record<string, string> = {
  criada: 'Criada', estado: 'Mudança de estado', nota_add: 'NE adicionada', nota_remove: 'NE removida', doc: 'Documento', editada: 'Editada',
}

export default function ExpedicaoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const { session, perfil } = useAuth()
  const autor = useMemo(() => ({ id: session?.user.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null }), [session, perfil])

  const [exp, setExp] = useState<Expedition | null>(null)
  const [notas, setNotas] = useState<NotaEncomenda[]>([])
  const [eventos, setEventos] = useState<ExpedicaoEvento[]>([])
  const [pl, setPl] = useState<PackingList | null>(null)
  const [plPdfUrl, setPlPdfUrl] = useState<string | null>(null)
  const [cartaUrl, setCartaUrl] = useState<string | null>(null)
  const [moradas, setMoradas] = useState<MoradaEntrega[]>([])
  const [candidatas, setCandidatas] = useState<NotaEncomenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [aGerar, setAGerar] = useState(false)

  // Form (transporte/tracking/datas/notas/morada)
  const [form, setForm] = useState<ExpedicaoPatch>({})

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data } = await obterExpedicion(id)
    const e = data as Expedition | null
    setExp(e)
    if (e) {
      const [ns, ev, plst] = await Promise.all([notasDaExpedicion(id), eventosExpedicion(id), packingListDaExpedicion(id)])
      setNotas(ns); setEventos(ev); setPl(plst)
      setForm({
        tipo_transporte: e.tipo_transporte, transportadora: e.transportadora,
        tracking_numero: e.tracking_numero, awb_numero: e.awb_numero,
        data_prevista: e.data_prevista, data_expedicao: e.data_expedicao, notas: e.notas,
        morada_entrega_id: e.morada_entrega_id,
      })
      setCartaUrl(await urlCartaPorte(e))
      if (e.cliente_id) {
        setMoradas(await moradasCliente(e.cliente_id))
        const prontas = await notasProntas()
        setCandidatas(prontas.filter((n) => n.cliente_id === e.cliente_id))
      }
      if (plst) { const pdfs = await listarPdfsPacking(plst.id); setPlPdfUrl(pdfs[0] ? await urlPdfPacking(pdfs[0].pdf_path) : null) }
    }
    setCarregando(false)
  }, [id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  if (carregando) return <main style={c.page}><p style={c.estado}>A carregar…</p></main>
  if (!exp) return <main style={c.page}><p style={c.estado}>Expedição não encontrada. <Link href="/admin-dept/expedicoes" style={c.link}>Voltar</Link></p></main>

  const est = estadoExpInfo(exp.estado)
  const editavel = exp.estado === 'em_preparacao' || exp.estado === 'pronta'

  async function guardar() {
    const m = moradas.find((x) => x.id === form.morada_entrega_id)
    const patch: ExpedicaoPatch = {
      ...form,
      morada_etiqueta: m?.etiqueta ?? null, morada: m?.morada ?? null, cidade: m?.cidade ?? null,
      codigo_postal: m?.codigo_postal ?? null, pais: m?.pais ?? null,
    }
    const { error } = await atualizarExpedicion(id, patch)
    if (error) { setToast('Erro ao guardar: ' + error.message); return }
    setToast('Guardado.'); carregar()
  }

  async function acao(fn: () => Promise<{ error?: string } | void>, ok: string) {
    const r = await fn()
    if (r && 'error' in r && r.error) { setToast('Erro: ' + r.error); return }
    setToast(ok); carregar()
  }

  async function anexarCarta(file: File) {
    const r = await carregarCartaPorte(id, file)
    if (!r.ok) { setToast('Erro ao anexar: ' + (r.motivo ?? '')); return }
    setToast('Carta de porte anexada.'); carregar()
  }

  async function gerarPacking() {
    if (notas.length === 0) { setToast('A expedição não tem NEs.'); return }
    setAGerar(true)
    const { id: plId, error } = await gerarPackingListExpedicion(exp!, notas, autor)
    if (error || !plId) { setAGerar(false); setToast('Erro: ' + (error ?? '')); return }
    // Gera e guarda o PDF (versão) — reutiliza o motor partilhado.
    const { data: plRow } = await obterExpedicionPl(plId)
    const linhas = await listarLinhasPacking(plId)
    const pdfs = await listarPdfsPacking(plId)
    const versao = (pdfs[0]?.versao ?? 0) + 1
    const blob = await gerarPdfDocumento(documentoPackingList(plRow, linhas, versao))
    await guardarVersaoPdf(plId, plRow.numero ?? plId, blob)
    setAGerar(false); setToast('Packing list gerada.'); carregar()
  }

  async function expedirAgora() {
    if (notas.length === 0) { setToast('Adiciona pelo menos uma NE.'); return }
    if (!window.confirm(`Marcar ${exp!.numero} como expedida? As ${notas.length} NE(s) passam a "expedida" e os equipamentos a "Enviado".`)) return
    acao(() => expedir(id, autor), 'Expedição marcada como expedida.')
  }
  async function cancelarAgora() {
    if (!window.confirm('Cancelar a expedição? As NEs voltam a "prontas a enviar".')) return
    acao(() => cancelar(id, autor), 'Expedição cancelada.')
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <Link href="/admin-dept/expedicoes" style={c.voltar}>← Expedições</Link>
          <h1 style={c.titulo}>{tituloExpedicao(exp, notas.length)}</h1>
          <span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>
          {(exp.morada || exp.cidade) && <span style={c.moradaTopo}> · {moradaLinha(exp)}</span>}
        </div>
      </div>

      {/* Ações de estado */}
      <div style={c.acoesEstado}>
        {editavel && exp.estado === 'em_preparacao' && <button style={c.btnSec} onClick={() => acao(async () => marcarEstado(id, 'pronta', autor), 'Marcada como pronta.')}>Marcar pronta</button>}
        {editavel && exp.estado === 'pronta' && <button style={c.btnSec} onClick={() => acao(async () => marcarEstado(id, 'em_preparacao', autor), 'Voltou a em preparação.')}>Voltar a preparação</button>}
        {editavel && <button style={c.btnPrimario} onClick={expedirAgora}>Marcar expedida</button>}
        {exp.estado === 'expedida' && <button style={c.btnPrimario} onClick={() => acao(async () => marcarEntregue(id, autor), 'Marcada como entregue.')}>Marcar entregue</button>}
        {editavel && <button style={c.btnPerigo} onClick={cancelarAgora}>Cancelar expedição</button>}
      </div>

      <div style={c.grelha}>
        {/* Coluna esquerda: NEs */}
        <section style={c.col}>
          <h2 style={c.h2}>Notas de Encomenda ({notas.length})</h2>
          <div style={c.tabelaWrap}>
            <table style={c.tabela}>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id} style={c.tr}>
                    <td style={{ ...c.td, fontWeight: 700 }}>{n.numero}</td>
                    <td style={c.td}>{n.equipamento_modelo ?? '—'} · SN {n.equipamento_sn ?? '—'}</td>
                    {editavel && <td style={c.tdAcao}><button style={c.removerLink} onClick={() => acao(() => removerNota(id, n, autor), 'NE removida.')}>remover</button></td>}
                  </tr>
                ))}
                {notas.length === 0 && <tr><td style={c.td} colSpan={3}>Sem NEs.</td></tr>}
              </tbody>
            </table>
          </div>

          {editavel && candidatas.length > 0 && (
            <div style={c.addBox}>
              <span style={c.rot}>Adicionar NE pronta deste cliente:</span>
              {candidatas.map((n) => (
                <div key={n.id} style={c.addLinha}>
                  <span>{n.numero} · {n.equipamento_modelo ?? '—'} (SN {n.equipamento_sn ?? '—'})</span>
                  <button style={c.btnMini} onClick={() => acao(() => adicionarNota(exp!, n, autor), 'NE adicionada.')}>Adicionar</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Coluna direita: transporte / documentos */}
        <section style={c.col}>
          <h2 style={c.h2}>Transporte e documentos</h2>

          {editavel ? (
            <div style={c.form}>
              {moradas.length > 0 && (
                <label style={c.campo}><span style={c.rot}>Morada de entrega</span>
                  <select style={c.input} value={form.morada_entrega_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, morada_entrega_id: e.target.value || null }))}>
                    <option value="">— sem morada específica —</option>
                    {moradas.map((m) => <option key={m.id} value={m.id}>{m.etiqueta ? `${m.etiqueta}: ` : ''}{[m.morada, m.cidade, m.pais].filter(Boolean).join(', ')}</option>)}
                  </select>
                </label>
              )}
              <div style={c.linha2}>
                <label style={c.campo}><span style={c.rot}>Tipo</span>
                  <select style={c.input} value={form.tipo_transporte ?? 'expresso'} onChange={(e) => setForm((f) => ({ ...f, tipo_transporte: e.target.value as TipoTransporteExp }))}>
                    {TIPOS_TRANSPORTE_EXP.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </label>
                <label style={c.campo}><span style={c.rot}>Transportadora</span>
                  <input list="transp-list" style={c.input} value={form.transportadora ?? ''} onChange={(e) => setForm((f) => ({ ...f, transportadora: e.target.value || null }))} />
                  <datalist id="transp-list">{TRANSPORTADORES.map((t) => <option key={t} value={t} />)}</datalist>
                </label>
              </div>
              <div style={c.linha2}>
                <label style={c.campo}><span style={c.rot}>Nº de tracking</span>
                  <input style={c.input} value={form.tracking_numero ?? ''} onChange={(e) => setForm((f) => ({ ...f, tracking_numero: e.target.value || null }))} /></label>
                <label style={c.campo}><span style={c.rot}>AWB</span>
                  <input style={c.input} value={form.awb_numero ?? ''} placeholder="074-12345678" onChange={(e) => setForm((f) => ({ ...f, awb_numero: e.target.value || null }))} /></label>
              </div>
              <div style={c.linha2}>
                <label style={c.campo}><span style={c.rot}>Data prevista</span>
                  <input type="date" style={c.input} value={form.data_prevista ?? ''} onChange={(e) => setForm((f) => ({ ...f, data_prevista: e.target.value || null }))} /></label>
                <label style={c.campo}><span style={c.rot}>Data de expedição</span>
                  <input type="date" style={c.input} value={form.data_expedicao ?? ''} onChange={(e) => setForm((f) => ({ ...f, data_expedicao: e.target.value || null }))} /></label>
              </div>
              <label style={c.campo}><span style={c.rot}>Notas</span>
                <textarea style={{ ...c.input, minHeight: 52 }} value={form.notas ?? ''} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value || null }))} /></label>
              <button style={c.btnPrimario} onClick={guardar}>Guardar</button>
            </div>
          ) : (
            <div style={c.leitura}>
              <p><b>Transportadora:</b> {exp.transportadora ?? '—'}</p>
              <p><b>Tracking:</b> {exp.tracking_numero || exp.awb_numero || '—'}</p>
              <p><b>Expedição:</b> {fdata(exp.data_expedicao)} · <b>Entrega:</b> {fdata(exp.data_entrega)}</p>
              {exp.notas && <p>{exp.notas}</p>}
            </div>
          )}

          {/* Carta de porte */}
          <div style={c.docBox}>
            <span style={c.rot}>Carta de porte</span>
            <div style={c.docLinha}>
              {cartaUrl ? <a href={cartaUrl} target="_blank" rel="noopener noreferrer" style={c.link}>ver documento</a> : <span style={c.ajuda}>sem documento</span>}
              {editavel && <label style={c.btnUpload}>{cartaUrl ? 'Substituir' : 'Carregar'}
                <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) anexarCarta(f); e.target.value = '' }} /></label>}
            </div>
            <p style={c.ajuda}>A carta de porte sincroniza com o separador Tracking (uma entrada única a referenciar as NEs).</p>
          </div>

          {/* Packing list */}
          <div style={c.docBox}>
            <span style={c.rot}>Packing list (consolida as caixas das NEs)</span>
            <div style={c.docLinha}>
              {plPdfUrl ? <a href={plPdfUrl} target="_blank" rel="noopener noreferrer" style={c.link}>ver PDF{pl?.numero ? ` (${pl.numero})` : ''}</a> : <span style={c.ajuda}>ainda não gerada</span>}
              {editavel && <button style={c.btnUpload} onClick={gerarPacking} disabled={aGerar}>{aGerar ? 'A gerar…' : pl ? 'Regerar' : 'Gerar'}</button>}
            </div>
          </div>
        </section>
      </div>

      {/* Auditoria */}
      <section style={c.audit}>
        <h2 style={c.h2}>Histórico</h2>
        {eventos.length === 0 ? <p style={c.ajuda}>Sem eventos.</p> : (
          <ul style={c.eventos}>
            {eventos.map((ev) => (
              <li key={ev.id} style={c.evento}>
                <span style={c.eventoData}>{fdatahora(ev.created_at)}</span>
                <span>{EVENTO_LABEL[ev.tipo] ?? ev.tipo}{ev.detalhe ? ` — ${ev.detalhe}` : ''}</span>
                <span style={c.eventoUser}>{ev.user_nome ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

// Helper local: obter a packing list por id (para gerar o PDF).
async function obterExpedicionPl(plId: string): Promise<{ data: PackingList }> {
  const { obterPackingList } = await import('@/lib/packingList')
  const { data } = await obterPackingList(plId)
  return { data: data as PackingList }
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1160, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 12 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  titulo: { fontSize: 21, fontWeight: 700, color: 'var(--primary)', margin: '4px 0' },
  moradaTopo: { color: 'var(--muted)', fontSize: 13 },
  badge: { display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  acoesEstado: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  grelha: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 },
  col: { display: 'flex', flexDirection: 'column', gap: 10 },
  h2: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  tabelaWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '9px 12px', color: 'var(--foreground)' },
  tdAcao: { padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' },
  addBox: { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10 },
  addLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rot: { color: 'var(--muted)', fontWeight: 600, fontSize: 12 },
  input: { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
  leitura: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'var(--foreground)' },
  docBox: { display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 },
  docLinha: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  btnUpload: { background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '7px 13px', fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none' },
  link: { color: 'var(--primary)', textDecoration: 'none' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  audit: { marginTop: 18 },
  eventos: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  evento: { display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13, color: 'var(--foreground)', flexWrap: 'wrap' },
  eventoData: { color: 'var(--muted)', fontSize: 12, minWidth: 110 },
  eventoUser: { color: 'var(--muted)', fontSize: 12, marginLeft: 'auto' },
  btnMini: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnSec: { background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  btnPerigo: { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  removerLink: { background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60 },
}
