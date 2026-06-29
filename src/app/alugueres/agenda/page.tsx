'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AlugueresNav from '@/components/AlugueresNav'

type Calendario = { id: string; nome: string }
type Mapa = { modelo_grupo: string; modelo_label: string; regiao: string | null }

// Modelos disponíveis para preço (grupos da tabela precos_aluguer).
const MODELOS: { grupo: string; label: string }[] = [
  { grupo: 'gentlepro', label: 'GentlePro U' },
  { grupo: 'gentlemaxpro', label: 'GentleMax Pro / Pro Plus' },
  { grupo: 'sopranoice', label: 'Soprano ICE' },
  { grupo: 'sopranoplatinum', label: 'Soprano Platinum' },
]

const ZONAS = ['Lisboa', 'Norte', 'Algarve']

export default function AgendaCalendariosPage() {
  const [cals, setCals] = useState<Calendario[]>([])
  const [mapas, setMapas] = useState<Record<string, Mapa>>({})
  const [pesquisa, setPesquisa] = useState('')
  const [soMapeados, setSoMapeados] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      try {
        const [rCal, rMap] = await Promise.all([
          fetch('/api/alugueres/agenda/calendarios', { headers: { Authorization: `Bearer ${token ?? ''}` } }).then((r) => r.json()),
          supabase.from('calendarios_aluguer').select('id, modelo_grupo, modelo_label, regiao'),
        ])
        if (!ativo) return
        setCarregando(false)
        if (!rCal.ok) { setErro(rCal.erro ?? 'Não foi possível ler os calendários.'); return }
        setCals(rCal.calendarios ?? [])
        const m: Record<string, Mapa> = {}
        for (const row of (rMap.data ?? []) as { id: string; modelo_grupo: string; modelo_label: string; regiao: string | null }[]) {
          m[row.id] = { modelo_grupo: row.modelo_grupo, modelo_label: row.modelo_label, regiao: row.regiao }
        }
        setMapas(m)
      } catch {
        if (ativo) { setCarregando(false); setErro('Erro de rede ao ler os calendários.') }
      }
    })()
    return () => { ativo = false }
  }, [])

  // Guarda (upsert) o mapeamento de um calendário com os valores indicados.
  async function guardar(cal: Calendario, grupo: string, regiao: string | null) {
    const label = MODELOS.find((x) => x.grupo === grupo)?.label ?? grupo
    setMapas((p) => ({ ...p, [cal.id]: { modelo_grupo: grupo, modelo_label: label, regiao } }))
    const { error } = await supabase.from('calendarios_aluguer').upsert({
      id: cal.id, nome: cal.nome, modelo_grupo: grupo, modelo_label: label, regiao, updated_at: new Date().toISOString(),
    })
    if (error) alert('Erro a guardar: ' + error.message)
  }

  async function mudarModelo(cal: Calendario, grupo: string) {
    if (!grupo) {
      setMapas((p) => { const n = { ...p }; delete n[cal.id]; return n })
      const { error } = await supabase.from('calendarios_aluguer').delete().eq('id', cal.id)
      if (error) alert('Erro a remover: ' + error.message)
      return
    }
    await guardar(cal, grupo, mapas[cal.id]?.regiao ?? null)
  }

  async function mudarZona(cal: Calendario, regiao: string) {
    const atual = mapas[cal.id]
    if (!atual) return // zona só faz sentido com modelo escolhido
    await guardar(cal, atual.modelo_grupo, regiao || null)
  }

  const filtrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return cals.filter((c) => {
      if (soMapeados && !mapas[c.id]) return false
      if (q && !c.nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [cals, mapas, pesquisa, soMapeados])

  const nMapeados = Object.keys(mapas).length

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Agenda — Calendários</h1>
        <Link href="/alugueres/lista" style={c.voltar}>← Lista</Link>
      </div>
      <AlugueresNav />

      <p style={c.sub}>
        Associa cada calendário de aluguer a um <strong>modelo</strong> e à <strong>zona</strong> (Lisboa/Norte/Algarve).
        Os calendários que não interessam deixa em <strong>“— ignorar —”</strong>.
      </p>

      {carregando ? (
        <p style={c.estado}>A ler calendários do Google…</p>
      ) : erro ? (
        <div style={c.erro}>{erro}</div>
      ) : (
        <>
          <div style={c.filtros}>
            <input
              placeholder="Procurar calendário…"
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              style={c.inputPesq}
            />
            <label style={c.check}>
              <input type="checkbox" checked={soMapeados} onChange={(e) => setSoMapeados(e.target.checked)} />
              Só mapeados
            </label>
          </div>

          <div style={c.resumo}>
            <span>{cals.length} calendário(s)</span>
            <span><strong>{nMapeados}</strong> mapeado(s) para aluguer</span>
          </div>

          <div style={c.tabela}>
            <div style={{ ...c.linha, ...c.cab }}>
              <span>Calendário</span>
              <span>Modelo (para preço)</span>
              <span>Zona</span>
            </div>
            {filtrados.map((cal) => {
              const mapeado = mapas[cal.id]
              return (
                <div key={cal.id} style={c.linha}>
                  <span style={{ fontWeight: mapeado ? 700 : 500 }}>
                    {cal.nome}
                    {mapeado && <span style={c.tag}>aluguer</span>}
                  </span>
                  <select
                    value={mapeado?.modelo_grupo ?? ''}
                    onChange={(e) => mudarModelo(cal, e.target.value)}
                    style={mapeado ? c.selectVerde : c.select}
                  >
                    <option value="">— ignorar —</option>
                    {MODELOS.map((m) => (
                      <option key={m.grupo} value={m.grupo}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={mapeado?.regiao ?? ''}
                    onChange={(e) => mudarZona(cal, e.target.value)}
                    disabled={!mapeado}
                    style={!mapeado ? c.selectDesativado : c.select}
                  >
                    <option value="">— zona —</option>
                    {ZONAS.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          <p style={c.sub}>
            A seguir (Fase 3): ler as marcações destes calendários e calcular a previsão de receita por mês (e por zona).
          </p>
        </>
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: '14px 0' },
  estado: { color: 'var(--muted)', padding: 8 },
  filtros: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' },
  inputPesq: { flex: 1, minWidth: 180, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 15 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--muted)' },
  resumo: { display: 'flex', justifyContent: 'space-between', background: 'var(--accent-bg, #eef1f6)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14, flexWrap: 'wrap', gap: 8 },
  tabela: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 8, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 0.8fr', gap: 10, padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 620 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  tag: { marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#fff', background: '#1b873f', borderRadius: 999, padding: '1px 7px' },
  select: { padding: '7px 8px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer', maxWidth: '100%' },
  selectVerde: { padding: '7px 8px', border: '1px solid #1b873f', borderRadius: 8, fontSize: 14, background: '#fff', color: '#1b873f', fontWeight: 700, cursor: 'pointer', maxWidth: '100%' },
  selectDesativado: { padding: '7px 8px', border: '1px solid #eee', borderRadius: 8, fontSize: 14, background: '#f7f7f7', color: '#bbb', maxWidth: '100%' },
  erro: { background: 'var(--danger-bg, #ffebee)', color: 'var(--danger, #c62828)', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, fontSize: 14 },
}
