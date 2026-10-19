'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  listarRegrasCategoriaTodas, guardarRegraCategoria, apagarRegraCategoria, categoriasExistentes,
  type RegraCategoria,
} from '@/lib/conciliacaoBancaria'

const CAMPOS = [
  { v: 'descritivo', t: 'Descritivo' },
  { v: 'observacoes', t: 'Observações' },
  { v: 'ambos', t: 'Ambos' },
] as const
const OPERADORES = [
  { v: 'contem', t: 'contém' },
  { v: 'comeca', t: 'começa por' },
  { v: 'igual', t: 'igual a' },
  { v: 'regex', t: 'expressão (regex)' },
] as const
const SENTIDOS = [
  { v: '', t: 'Qualquer' },
  { v: 'credito', t: 'Entrada (crédito)' },
  { v: 'debito', t: 'Saída (débito)' },
] as const

function regraVazia(ordem: number): RegraCategoria {
  return { ordem, ativo: true, campo: 'descritivo', operador: 'contem', sentido: null, padrao: '', categoria: '', rubrica: '', marcar_interna: false, nota: '' }
}

export default function RegrasCategoriaPage() {
  const { perfil } = useAuth()
  const [regras, setRegras] = useState<RegraCategoria[]>([])
  const [cats, setCats] = useState<string[]>([])
  const [edicao, setEdicao] = useState<RegraCategoria | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setRegras(await listarRegrasCategoriaTodas())
    setCats(await categoriasExistentes())
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function guardar() {
    if (!edicao) return
    if (!edicao.padrao.trim() || !edicao.categoria.trim()) { setErro('Preenche o padrão e a categoria.'); return }
    setAGuardar(true); setErro('')
    const { error } = await guardarRegraCategoria(edicao, perfil?.nome ?? null)
    setAGuardar(false)
    if (error) { setErro(error.message); return }
    setEdicao(null)
    await carregar()
  }

  async function alternarAtivo(r: RegraCategoria) {
    await guardarRegraCategoria({ ...r, ativo: !r.ativo }, perfil?.nome ?? null)
    await carregar()
  }

  async function apagar(r: RegraCategoria) {
    if (!r.id) return
    if (!confirm(`Apagar a regra "${r.padrao}" → ${r.categoria}?`)) return
    await apagarRegraCategoria(r.id)
    await carregar()
  }

  const proximaOrdem = (regras.at(-1)?.ordem ?? 0) + 10

  return (
    <main style={c.page}>
      <div style={c.topo}>
        <div>
          <Link href="/financeiro/conciliacao" style={c.voltar}>← Conciliação</Link>
          <h1 style={c.titulo}>🏷️ Regras de categorização</h1>
          <p style={c.sub}>Cada movimento do extrato recebe uma <strong>categoria</strong> e <strong>rubrica</strong> de cashflow. A primeira regra (por ordem) que bate ganha.</p>
        </div>
        <button style={c.btnPrim} onClick={() => { setErro(''); setEdicao(regraVazia(proximaOrdem)) }}>+ Nova regra</button>
      </div>

      {edicao && (
        <section style={c.card}>
          <div style={c.cardTitulo}>{edicao.id ? 'Editar regra' : 'Nova regra'}</div>
          <div style={c.form}>
            <Campo label="Ordem"><input type="number" value={edicao.ordem} onChange={(e) => setEdicao({ ...edicao, ordem: Number(e.target.value) })} style={c.inpN} /></Campo>
            <Campo label="Campo">
              <select value={edicao.campo} onChange={(e) => setEdicao({ ...edicao, campo: e.target.value as RegraCategoria['campo'] })} style={c.inp}>
                {CAMPOS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </Campo>
            <Campo label="Condição">
              <select value={edicao.operador} onChange={(e) => setEdicao({ ...edicao, operador: e.target.value as RegraCategoria['operador'] })} style={c.inp}>
                {OPERADORES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </Campo>
            <Campo label="Sentido">
              <select value={edicao.sentido ?? ''} onChange={(e) => setEdicao({ ...edicao, sentido: (e.target.value || null) as RegraCategoria['sentido'] })} style={c.inp}>
                {SENTIDOS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </Campo>
            <Campo label="Padrão" wide><input value={edicao.padrao} onChange={(e) => setEdicao({ ...edicao, padrao: e.target.value })} placeholder="ex.: DD  ·  REMUNERA[CÇ][AÃ]O\s+(.+)" style={c.inp} /></Campo>
            <Campo label="Categoria">
              <input list="cats" value={edicao.categoria} onChange={(e) => setEdicao({ ...edicao, categoria: e.target.value })} placeholder="ex.: Débitos diretos" style={c.inp} />
              <datalist id="cats">{cats.map((x) => <option key={x} value={x} />)}</datalist>
            </Campo>
            <Campo label="Rubrica"><input value={edicao.rubrica ?? ''} onChange={(e) => setEdicao({ ...edicao, rubrica: e.target.value })} placeholder="$1 · $OBS · texto fixo" style={c.inp} /></Campo>
            <Campo label="Transf. interna">
              <label style={c.check}><input type="checkbox" checked={edicao.marcar_interna} onChange={(e) => setEdicao({ ...edicao, marcar_interna: e.target.checked })} /> marcar como interna</label>
            </Campo>
            <Campo label="Nota" wide><input value={edicao.nota ?? ''} onChange={(e) => setEdicao({ ...edicao, nota: e.target.value })} style={c.inp} /></Campo>
          </div>
          <p style={c.dica}>Templates da rubrica: <code style={c.code}>$1…$9</code> (capturas do regex), <code style={c.code}>$0</code> (campo todo), <code style={c.code}>$OBS</code>/<code style={c.code}>$OBS1</code> (Observações), <code style={c.code}>$DESC1</code> (1.ª palavra do descritivo).</p>
          {erro && <p style={c.erro}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={c.btnPrim} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar…' : 'Guardar'}</button>
            <button style={c.btnSec} onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section style={c.card}>
        <div style={c.cardTitulo}>Regras ({regras.length})</div>
        <div style={c.tabela}>
          <div style={{ ...c.linha, ...c.cab }}>
            <span>Ordem</span><span>Quando</span><span>→ Categoria / Rubrica</span><span style={{ textAlign: 'center' }}>Ativa</span><span style={{ textAlign: 'right' }}>Ações</span>
          </div>
          {regras.map((r) => (
            <div key={r.id} style={{ ...c.linha, ...(r.ativo ? {} : { opacity: 0.5 }) }}>
              <span style={c.muted}>{r.ordem}</span>
              <span style={{ fontSize: 13 }}>
                <span style={c.muted}>{CAMPOS.find((x) => x.v === r.campo)?.t} {OPERADORES.find((x) => x.v === r.operador)?.t} </span>
                <code style={c.code}>{r.padrao}</code>
                {r.sentido && <span style={c.chipS}>{r.sentido === 'credito' ? 'entrada' : 'saída'}</span>}
              </span>
              <span style={{ fontSize: 13 }}>
                <strong>{r.categoria}</strong>{r.rubrica ? <span style={c.muted}> · {r.rubrica}</span> : ''}
                {r.marcar_interna && <span style={{ ...c.chipS, background: '#FEF3C7', color: '#92400E' }}>interna</span>}
              </span>
              <span style={{ textAlign: 'center' }}>
                <button style={c.toggle} onClick={() => alternarAtivo(r)} title="Ativar/desativar">{r.ativo ? '✓' : '—'}</button>
              </span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button style={c.btnMini} onClick={() => { setErro(''); setEdicao({ ...r }) }}>Editar</button>
                <button style={{ ...c.btnMini, color: '#B91C1C' }} onClick={() => apagar(r)}>Apagar</button>
              </span>
            </div>
          ))}
          {regras.length === 0 && <p style={c.muted}>Ainda sem regras.</p>}
        </div>
      </section>
    </main>
  )
}

function Campo({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label style={{ ...c.campo, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={c.campoLabel}>{label}</span>
      {children}
    </label>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 4px' },
  sub: { color: 'var(--muted)', fontSize: 14, maxWidth: 640 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  campoLabel: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' },
  inp: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', width: '100%' },
  inpN: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', width: 90 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 0' },
  dica: { fontSize: 12, color: 'var(--muted)', margin: 0 },
  code: { background: '#f1f2f5', padding: '1px 6px', borderRadius: 6, fontSize: 12 },
  erro: { color: '#B91C1C', fontSize: 13, margin: 0 },
  tabela: { border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflowX: 'auto' },
  linha: { display: 'grid', gridTemplateColumns: '0.5fr 2.6fr 2.2fr 0.6fr 1.1fr', gap: 8, padding: '9px 8px', fontSize: 13, borderBottom: '1px solid #f2f2f2', alignItems: 'center', minWidth: 760 },
  cab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12, borderBottom: '2px solid var(--border)' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  chipS: { marginLeft: 6, fontSize: 10.5, fontWeight: 700, background: '#EEF2FF', color: '#3730A3', borderRadius: 999, padding: '1px 7px' },
  toggle: { border: '1px solid var(--border)', background: '#fff', borderRadius: 8, width: 30, height: 26, cursor: 'pointer', fontWeight: 700 },
  btnPrim: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnSec: { background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnMini: { background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: '2px 6px' },
}
