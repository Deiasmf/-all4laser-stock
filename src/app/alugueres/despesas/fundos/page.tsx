'use client'

// Fundos em mãos de todos os colaboradores (admin/financeiro): dinheiro recebido
// de clientes e entregas em caixa, por mês. As entradas são registadas pelo
// próprio colaborador (RLS); aqui o financeiro consulta e, se preciso, elimina.
import { useCallback, useEffect, useMemo, useState } from 'react'
import GuardaFinanceiro from '@/components/despesas/GuardaFinanceiro'
import NavGestao from '@/components/despesas/NavGestao'
import {
  listarFundosMes, listarColaboradores, apagarFundo, mesFechado, mesCorrente,
  type Colaborador,
} from '@/lib/despesas'
import type { Fundo } from '@/types/despesa'

const eur = (v: number) => v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
const dataPt = (d: string) => { const [a, m, dia] = d.split('-'); return dia ? `${dia}/${m}/${a}` : d }

export default function FundosPage() {
  return <GuardaFinanceiro><Conteudo /></GuardaFinanceiro>
}

function Conteudo() {
  const [mes, setMes] = useState(mesCorrente())
  const [fundos, setFundos] = useState<Fundo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [fechado, setFechado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const nomeColab = useCallback((id: string) => {
    const c = colaboradores.find((x) => x.id === id); return c?.nome ?? c?.email ?? 'Colaborador'
  }, [colaboradores])

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [fs, fch] = await Promise.all([listarFundosMes(mes), mesFechado(mes)])
    setFundos(fs); setFechado(fch); setCarregando(false)
  }, [mes])

  useEffect(() => { listarColaboradores().then(setColaboradores) }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  // Agrupa por colaborador com totais.
  const grupos = useMemo(() => {
    const m = new Map<string, Fundo[]>()
    for (const f of fundos) { (m.get(f.colaborador_id) ?? m.set(f.colaborador_id, []).get(f.colaborador_id)!).push(f) }
    return Array.from(m.entries())
      .map(([id, fs]) => ({
        id, nome: nomeColab(id), fs,
        recebido: fs.filter((f) => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0),
        entregue: fs.filter((f) => f.tipo === 'entrega').reduce((s, f) => s + Number(f.valor), 0),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
  }, [fundos, nomeColab])

  async function eliminar(f: Fundo) {
    if (fechado) return
    if (!confirm(`Apagar este movimento de ${eur(Number(f.valor))}?`)) return
    const { error } = await apagarFundo(f.id)
    if (!error) await carregar()
  }

  return (
    <main style={c.page}>
      <NavGestao />
      <div style={c.topo}>
        <h1 style={c.titulo}>Fundos em mãos</h1>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesCorrente())} style={c.input} />
      </div>
      {fechado && <div style={c.fechadoBar}>🔒 Mês fechado — apenas consulta.</div>}

      {carregando ? <p style={c.muted}>A carregar…</p> : grupos.length === 0 ? (
        <p style={c.muted}>Sem movimentos de fundos neste mês.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.id} style={c.grupo}>
            <div style={c.grupoCab}>
              <span>{g.nome}</span>
              <span style={c.grupoTotais}>Recebido {eur(g.recebido)} · Entregue {eur(g.entregue)}</span>
            </div>
            {g.fs.map((f) => (
              <div key={f.id} style={c.linha}>
                <span style={{ ...c.tag, ...(f.tipo === 'entrada' ? c.tagEntrada : c.tagEntrega) }}>
                  {f.tipo === 'entrada' ? 'Recebido' : 'Entregue'}
                </span>
                <span style={c.valor}>{eur(Number(f.valor))}</span>
                <span style={c.meta}>{dataPt(f.data)}{f.aluguer_ref ? ` · ${f.aluguer_ref}` : ''}{f.nota ? ` · ${f.nota}` : ''}</span>
                {!fechado && <button style={c.btnMini} onClick={() => eliminar(f)}>🗑️</button>}
              </div>
            ))}
          </div>
        ))
      )}
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: '0 auto', padding: 20 },
  topo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: 0 },
  input: { padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', background: '#fff' },
  fechadoBar: { background: '#F3F4F6', color: '#374151', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginBottom: 12 },
  muted: { color: 'var(--muted)', fontSize: 14, padding: 20, textAlign: 'center' },
  grupo: { marginBottom: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  grupoCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F7F6FF', fontWeight: 700, fontSize: 13.5, gap: 10, flexWrap: 'wrap' },
  grupoTotais: { color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 },
  linha: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
  tag: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 9px' },
  tagEntrada: { color: '#065F46', background: '#D1FAE5' },
  tagEntrega: { color: '#1E40AF', background: '#DBEAFE' },
  valor: { fontWeight: 800, fontSize: 14 },
  meta: { fontSize: 12.5, color: 'var(--muted)', flex: 1, minWidth: 0 },
  btnMini: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 13 },
}
