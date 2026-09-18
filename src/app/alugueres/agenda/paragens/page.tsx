'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarParagens, sincronizarAgora, estadoParagemInfo, zonaLabel,
  diaSemanaPt, dataCurta, textoAgenda, equipamentoParagem, ZONAS_TRANSPORTE, ESTADOS_PARAGEM,
  type TransportStop, type FiltroParagens, type ZonaTransporte, type EstadoParagem,
} from '@/lib/transportes'

// Paragens sincronizadas dos calendários (Fase A). Vista de verificação e base
// do planeamento. "Por classificar" e "alterado" destacados.

export default function ParagensPage() {
  const { isAdministrativo, perfilCarregado } = useAuth()
  const [lista, setLista] = useState<TransportStop[]>([])
  const [filtro, setFiltro] = useState<FiltroParagens>({})
  const [aCarregar, setACarregar] = useState(true)
  const [aSync, setASync] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    setLista(await listarParagens(filtro))
    setACarregar(false)
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  async function sincronizar() {
    setASync(true)
    const r = await sincronizarAgora()
    setASync(false)
    if (!r.ok && r.erro) { setToast('Erro: ' + r.erro); return }
    setToast(`Sincronizado ✓ — ${r.novos ?? 0} nova(s), ${r.alterados ?? 0} alterada(s), ${r.cancelados ?? 0} cancelada(s)${r.erros && r.erros.length ? ` · ${r.erros.length} calendário(s) com erro` : ''}`)
    carregar()
  }

  function tituloAgenda(): string {
    const z = filtro.zona ? ` — ${zonaLabel(filtro.zona)}` : ''
    return `Agenda de transportes${z}`
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoAgenda(lista, tituloAgenda()))
      setToast('Agenda copiada — cola no WhatsApp/email.')
    } catch { setToast('Não consegui copiar automaticamente.') }
  }
  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) { setToast('Permite pop-ups para gerar o PDF.'); return }
    const texto = textoAgenda(lista, tituloAgenda())
    const esc = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tituloAgenda()}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;margin:0}</style></head><body><pre>${esc}</pre></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 200)
  }

  if (perfilCarregado && !isAdministrativo) return <main style={c.page}><p style={c.muted}>Sem acesso.</p></main>

  const porClassificar = lista.filter((p) => p.estado === 'por_classificar').length
  const alterados = lista.filter((p) => p.alterado).length

  return (
    <main style={c.page}>
      <Link href="/alugueres/agenda" style={c.voltar}>← Agenda</Link>
      <div style={c.topo}>
        <div>
          <h1 style={c.titulo}>Paragens (próximos dias)</h1>
          <p style={c.sub}>Entregas e recolhas lidas dos calendários. <Link href="/alugueres/agenda/planeamento" style={c.link}>Planeamento ↗</Link> · <Link href="/alugueres/agenda/mapeamento" style={c.link}>Mapeamento ↗</Link> · <Link href="/alugueres/agenda/recursos" style={c.link}>Motoristas & carrinhas ↗</Link></p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={c.btnSec} onClick={copiar} disabled={lista.length === 0} title="Copiar a agenda (respeita os filtros) para enviar aos colaboradores">📋 Copiar texto</button>
          <button style={c.btnSec} onClick={imprimir} disabled={lista.length === 0} title="Abrir versão limpa para imprimir ou gravar como PDF">🖨️ PDF</button>
          <button style={c.btnPrim} onClick={sincronizar} disabled={aSync}>{aSync ? 'A sincronizar…' : '↻ Sincronizar agora'}</button>
        </div>
      </div>

      {(porClassificar > 0 || alterados > 0) && (
        <p style={c.avisos}>
          {porClassificar > 0 && <span style={c.pillAviso}>{porClassificar} por classificar</span>}
          {alterados > 0 && <span style={c.pillAlt}>{alterados} alterada(s) desde a última revisão</span>}
        </p>
      )}

      <section style={c.filtros}>
        <select style={c.select} value={filtro.zona ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, zona: (e.target.value || undefined) as ZonaTransporte | undefined }))}>
          <option value="">Zona: todas</option>
          {ZONAS_TRANSPORTE.map((z) => <option key={z.valor} value={z.valor}>{z.label}</option>)}
        </select>
        <select style={c.select} value={filtro.estado ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, estado: (e.target.value || undefined) as EstadoParagem | undefined }))}>
          <option value="">Estado: todos</option>
          {ESTADOS_PARAGEM.filter((e) => e.valor !== 'cancelada').map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <input style={c.data} type="date" value={filtro.de ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value || undefined }))} title="De" />
        <input style={c.data} type="date" value={filtro.ate ?? ''} onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value || undefined }))} title="Até" />
        {(filtro.zona || filtro.estado || filtro.de || filtro.ate) && <button style={c.btnLimpar} onClick={() => setFiltro({})}>Limpar</button>}
      </section>

      {aCarregar ? <p style={c.muted}>A carregar…</p> : lista.length === 0 ? (
        <p style={c.muted}>Sem paragens. Carrega em “Sincronizar agora” para ler os calendários.</p>
      ) : (
        <div style={c.wrap}>
          <table style={c.tabela}>
            <thead><tr>
              <th style={c.th}>Data</th><th style={c.th}>Zona</th><th style={c.th}>Tipo</th>
              <th style={c.th}>Cliente</th><th style={c.th}>Morada</th><th style={c.th}>Equipamento</th><th style={c.th}>Estado</th><th style={c.th}></th>
            </tr></thead>
            <tbody>
              {lista.map((p) => {
                const est = estadoParagemInfo(p.estado)
                return (
                  <tr key={p.id} style={{ ...c.tr, ...(p.estado === 'por_classificar' ? c.trAviso : {}) }}>
                    <td style={c.td}>
                      <div style={c.diaSemana}>{diaSemanaPt(p.data)}</div>
                      <div>{dataCurta(p.data)}{p.alterado && <span style={c.alt} title="Alterado desde a última revisão"> ●</span>}</div>
                    </td>
                    <td style={c.td}>{p.zona ? zonaLabel(p.zona) : '—'}</td>
                    <td style={c.td}>{p.tipo === 'entrega' ? '📦 Entrega' : p.tipo === 'recolha' ? '↩ Recolha' : '❓'}{p.notas && <div style={c.avisoMini} title={p.notas}>⏰ até 13h00</div>}</td>
                    <td style={c.td}>{p.cliente_nome ?? <span style={c.faltaMini}>—</span>}</td>
                    <td style={c.td}>{p.morada ?? '—'}{p.aviso_morada && <div style={c.avisoMini} title="Morada pode não corresponder à zona do calendário">⚠ morada/zona?</div>}</td>
                    <td style={c.td}>{equipamentoParagem(p) || '—'}</td>
                    <td style={c.td}><span style={{ ...c.badge, color: est.cor, background: est.bg }}>{est.label}</span>{p.confianca && p.estado === 'por_classificar' && <div style={c.conf}>conf. {p.confianca}</div>}</td>
                    <td style={c.td}>{p.link_evento && <a href={p.link_evento} target="_blank" rel="noopener" style={c.link}>Google ↗</a>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div style={c.toast}>{toast}</div>}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 1200, margin: '0 auto' },
  voltar: { color: '#2563EB', textDecoration: 'none', fontSize: 13 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 13, marginTop: 4 },
  link: { color: '#2563EB', textDecoration: 'none' },
  btnPrim: { padding: '9px 16px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnSec: { padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  avisos: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' },
  pillAviso: { background: '#FEF3C7', color: '#92400E', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
  pillAlt: { background: '#EDE9FE', color: '#5B21B6', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 },
  filtros: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  select: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit', background: '#fff' },
  data: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, font: 'inherit' },
  btnLimpar: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', font: 'inherit' },
  muted: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  wrap: { overflowX: 'auto', border: '1px solid #eee', borderRadius: 10 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #eee', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 700 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  trAviso: { background: '#FFFBEB' },
  td: { padding: '8px', verticalAlign: 'top' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 },
  diaSemana: { fontWeight: 700, color: '#111827' },
  alt: { color: '#7C3AED', fontWeight: 900 },
  conf: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  faltaMini: { color: '#B45309' },
  avisoMini: { fontSize: 11, color: '#B45309', marginTop: 2 },
  toast: { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 60, maxWidth: '90%', textAlign: 'center' },
}
