'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { historicoSerial, pesquisarSeriais, type SerialEvento } from '@/lib/serialPecas'

function dataPt(iso: string | null): string {
  if (!iso) return '—'
  const p = iso.slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}

const FONTE = {
  envio: { label: 'Enviado', icon: '📤', cor: '#1d4ed8', bg: '#e6efff' },
  recepcao: { label: 'Recebido', icon: '📥', cor: '#0a7a4f', bg: '#e3f7ee' },
  reparacao: { label: 'Reparação', icon: '🔧', cor: '#9a6700', bg: '#fff4d6' },
} as const

function Conteudo() {
  const params = useSearchParams()
  const inicial = params.get('q') ?? ''
  const [termo, setTermo] = useState(inicial)
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [snAtivo, setSnAtivo] = useState(inicial.trim())
  const [eventos, setEventos] = useState<SerialEvento[] | null>(null)
  const [carregando, setCarregando] = useState(false)

  // Autocomplete (debounce simples).
  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2 || t === snAtivo) { setSugestoes([]); return }
    let vivo = true
    const id = setTimeout(() => { pesquisarSeriais(t).then((r) => { if (vivo) setSugestoes(r) }) }, 250)
    return () => { vivo = false; clearTimeout(id) }
  }, [termo, snAtivo])

  const carregar = useCallback(async (sn: string) => {
    const s = sn.trim()
    setSnAtivo(s); setSugestoes([])
    if (!s) { setEventos(null); return }
    setCarregando(true)
    setEventos(await historicoSerial(s))
    setCarregando(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (inicial.trim()) carregar(inicial) }, [inicial, carregar])

  const atual = eventos && eventos.length > 0 ? eventos[0] : null

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <h1 style={s.titulo}>Pesquisar Serial Number</h1>
          <Link href="/logistico/saldos-pecas" style={s.voltar}>← Saldos de Peças</Link>
        </div>
      </div>
      <p style={s.nota}>Escreve um número de série para ver o histórico da unidade: enviada quando e para quem, recebida quando, e o estado atual.</p>

      <form style={s.barra} onSubmit={(e) => { e.preventDefault(); carregar(termo) }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="ex.: ABC123" style={s.input} />
          {sugestoes.length > 0 && (
            <div style={s.sugestoes}>
              {sugestoes.map((sn) => (
                <button type="button" key={sn} style={s.sugestao} onClick={() => { setTermo(sn); carregar(sn) }}>{sn}</button>
              ))}
            </div>
          )}
        </div>
        <button type="submit" style={s.btn}>Pesquisar</button>
      </form>

      {carregando ? <p style={s.estado}>A procurar…</p> : eventos === null ? null : eventos.length === 0 ? (
        <p style={s.estado}>Sem histórico para <b>{snAtivo}</b>.</p>
      ) : (
        <>
          {atual && (
            <div style={s.resumo}>
              <div style={s.resumoSn}>S/N {snAtivo}</div>
              <div style={s.resumoEstado}>
                Último movimento: <b>{FONTE[atual.fonte].label}</b>
                {atual.entidade ? ` · ${atual.entidade}` : ''}
                {atual.data ? ` · ${dataPt(atual.data)}` : ''}
              </div>
            </div>
          )}
          <ol style={s.timeline}>
            {eventos.map((ev, i) => {
              const f = FONTE[ev.fonte]
              return (
                <li key={i} style={s.item}>
                  <span style={{ ...s.dot, background: f.cor }}>{f.icon}</span>
                  <div style={s.card}>
                    <div style={s.cardTop}>
                      <span style={{ ...s.tag, color: f.cor, background: f.bg }}>{f.label}</span>
                      <span style={s.data}>{dataPt(ev.data)}</span>
                    </div>
                    <div style={s.linha}>
                      {ev.peca && <b>{ev.peca}</b>}
                      {ev.entidade && <span> · {ev.entidade}{ev.entidade_tipo ? ` (${ev.entidade_tipo === 'cliente' ? 'Cliente' : 'Fornecedor'})` : ''}</span>}
                    </div>
                    <div style={s.meta}>
                      {ev.referencia && <span>Ref.: {ev.referencia}</span>}
                      {ev.estado && <span> · Estado: {ev.estado}</span>}
                      {ev.detalhe && <span> · {ev.detalhe}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </main>
  )
}

export default function PesquisaSerialPage() {
  return (
    <Suspense fallback={<main style={s.page}><p style={s.estado}>A carregar…</p></main>}>
      <Conteudo />
    </Suspense>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 8 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  nota: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 14px' },
  barra: { display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-start', flexWrap: 'wrap' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  sugestoes: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, zIndex: 5, overflow: 'hidden' },
  sugestao: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  btn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 20, textAlign: 'center' },
  resumo: { background: '#dff5fa', border: '1px solid #a9e2ee', borderRadius: 12, padding: '12px 16px', marginBottom: 16 },
  resumoSn: { fontWeight: 800, fontSize: 16, color: '#0e7490' },
  resumoEstado: { fontSize: 13.5, color: '#155e75', marginTop: 2 },
  timeline: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  dot: { width: 30, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 },
  card: { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tag: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  data: { fontSize: 12.5, color: 'var(--muted)' },
  linha: { fontSize: 14, marginTop: 4, color: 'var(--foreground)' },
  meta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 3 },
}
