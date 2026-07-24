'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BotaoExportar from '@/components/BotaoExportar'
import type { ColunaExport } from '@/lib/exportar'
import {
  listarMovimentosPecas, dataPt, diasDesde, type ParteMovimento,
} from '@/lib/saldosPecas'

type PartAgg = {
  peca: string
  enviado: number
  recebido: number
  emReparacao: number
  saldo: number
  emReparacaoDesde: string | null
  movimentos: ParteMovimento[]
}
type EntityAgg = {
  entidade: string
  enviado: number
  recebido: number
  emReparacao: number
  saldo: number
  emReparacaoDesde: string | null
  pecas: PartAgg[]
}

function menorData(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

export default function SaldosPecasPage() {
  const [movs, setMovs] = useState<ParteMovimento[]>([])
  const [carregando, setCarregando] = useState(true)

  const [fEntidade, setFEntidade] = useState('')
  const [fPeca, setFPeca] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')
  const [soSaldo, setSoSaldo] = useState(false)
  const [diasAlerta, setDiasAlerta] = useState(30)

  const [entExp, setEntExp] = useState<Set<string>>(new Set())
  const [pecaExp, setPecaExp] = useState<Set<string>>(new Set())

  useEffect(() => { listarMovimentosPecas().then(setMovs).finally(() => setCarregando(false)) }, [])

  // Filtra os movimentos (entidade/peça/datas) e agrega por entidade -> peça.
  const entidades = useMemo<EntityAgg[]>(() => {
    const te = fEntidade.trim().toLowerCase()
    const tp = fPeca.trim().toLowerCase()
    const filtrados = movs.filter((m) => {
      if (te && !m.entidade.toLowerCase().includes(te)) return false
      if (tp && !m.peca.toLowerCase().includes(tp)) return false
      const d = m.data ?? ''
      if (fDe && d < fDe) return false
      if (fAte && d > fAte) return false
      return true
    })

    const porEnt = new Map<string, Map<string, PartAgg>>()
    for (const m of filtrados) {
      if (!porEnt.has(m.entidade)) porEnt.set(m.entidade, new Map())
      const pecas = porEnt.get(m.entidade)!
      if (!pecas.has(m.peca)) {
        pecas.set(m.peca, { peca: m.peca, enviado: 0, recebido: 0, emReparacao: 0, saldo: 0, emReparacaoDesde: null, movimentos: [] })
      }
      const p = pecas.get(m.peca)!
      p.enviado += m.enviado
      p.recebido += m.recebido
      if (m.estado === 'em_reparacao') {
        p.emReparacao += m.enviado - m.recebido
        p.emReparacaoDesde = menorData(p.emReparacaoDesde, m.data_saida)
      }
      p.movimentos.push(m)
    }

    const lista: EntityAgg[] = []
    for (const [entidade, pecasMap] of porEnt) {
      let pecas = Array.from(pecasMap.values())
      pecas.forEach((p) => { p.saldo = p.recebido - p.enviado; p.movimentos.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')) })
      if (soSaldo) pecas = pecas.filter((p) => p.saldo !== 0)
      if (pecas.length === 0) continue
      pecas.sort((a, b) => a.saldo - b.saldo)
      const ent: EntityAgg = {
        entidade,
        enviado: pecas.reduce((s, p) => s + p.enviado, 0),
        recebido: pecas.reduce((s, p) => s + p.recebido, 0),
        emReparacao: pecas.reduce((s, p) => s + p.emReparacao, 0),
        saldo: pecas.reduce((s, p) => s + p.saldo, 0),
        emReparacaoDesde: pecas.reduce<string | null>((d, p) => menorData(d, p.emReparacaoDesde), null),
        pecas,
      }
      lista.push(ent)
    }
    lista.sort((a, b) => a.saldo - b.saldo)
    return lista
  }, [movs, fEntidade, fPeca, fDe, fAte, soSaldo])

  const alertaVelho = (desde: string | null, emRep: number) => {
    if (emRep <= 0 || !desde) return false
    const d = diasDesde(desde)
    return d !== null && d > diasAlerta
  }

  const colunasExport: ColunaExport<{ entidade: string; peca: string; enviado: number; recebido: number; emReparacao: number; saldo: number }>[] = [
    { cabecalho: 'Entidade', valor: (r) => r.entidade },
    { cabecalho: 'Peça', valor: (r) => r.peca },
    { cabecalho: 'Enviado', valor: (r) => String(r.enviado) },
    { cabecalho: 'Recebido', valor: (r) => String(r.recebido) },
    { cabecalho: 'Em reparação', valor: (r) => String(r.emReparacao) },
    { cabecalho: 'Saldo', valor: (r) => String(r.saldo) },
  ]
  const linhasExport = entidades.flatMap((e) => e.pecas.map((p) => ({ entidade: e.entidade, peca: p.peca, enviado: p.enviado, recebido: p.recebido, emReparacao: p.emReparacao, saldo: p.saldo })))

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const n = new Set(set)
    if (n.has(key)) n.delete(key); else n.add(key)
    setter(n)
  }

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <div>
          <h1 style={s.titulo}>Saldos de Peças</h1>
          <Link href="/logistico/reparacao-pecas" style={s.voltar}>← Reparação de Peças</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/logistico/saldos-pecas/receber" style={s.btnReceber}>📥 Registar receção</Link>
          <BotaoExportar nome="saldos-pecas" colunas={colunasExport} linhas={linhasExport} />
        </div>
      </div>

      <p style={s.nota}>
        Por entidade (fornecedor/técnico): peças enviadas, recebidas de volta, em reparação e o <b>saldo</b>.
        Saldo negativo = peças nossas que ainda estão fora.
      </p>

      {/* Filtros */}
      <div style={s.filtros}>
        <input placeholder="Entidade..." value={fEntidade} onChange={(e) => setFEntidade(e.target.value)} style={s.input} />
        <input placeholder="Peça..." value={fPeca} onChange={(e) => setFPeca(e.target.value)} style={s.input} />
        <label style={s.campoData}>De <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} style={s.inputData} /></label>
        <label style={s.campoData}>Até <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} style={s.inputData} /></label>
        <label style={s.check}><input type="checkbox" checked={soSaldo} onChange={(e) => setSoSaldo(e.target.checked)} /> Só saldos ≠ 0</label>
        <label style={s.campoData}>Alerta &gt; <input type="number" min={1} value={diasAlerta} onChange={(e) => setDiasAlerta(Math.max(1, Number(e.target.value) || 30))} style={{ ...s.inputData, width: 64 }} /> dias</label>
      </div>

      {carregando ? (
        <p style={s.estado}>A carregar...</p>
      ) : entidades.length === 0 ? (
        <p style={s.estado}>Sem resultados para os filtros.</p>
      ) : (
        <div style={s.tabela}>
          <div style={{ ...s.linhaCab }}>
            <span style={s.colNome}>Entidade / Peça</span>
            <span style={s.colNum}>Env.</span>
            <span style={s.colNum}>Rec.</span>
            <span style={s.colNum}>Rep.</span>
            <span style={s.colNum}>Saldo</span>
          </div>

          {entidades.map((ent) => {
            const abertoEnt = entExp.has(ent.entidade)
            const entAlerta = alertaVelho(ent.emReparacaoDesde, ent.emReparacao)
            return (
              <div key={ent.entidade}>
                <div style={{ ...s.linha, ...s.linhaEnt }} onClick={() => toggle(entExp, ent.entidade, setEntExp)}>
                  <span style={s.colNome}>
                    <span style={s.seta}>{abertoEnt ? '▾' : '▸'}</span>
                    <b>{ent.entidade}</b>
                    {entAlerta && <span style={s.badgeAlerta} title={`Em reparação há mais de ${diasAlerta} dias`}>⏱ +{diasAlerta}d</span>}
                  </span>
                  <span style={s.colNum}>{ent.enviado}</span>
                  <span style={s.colNum}>{ent.recebido}</span>
                  <span style={s.colNum}>{ent.emReparacao || '—'}</span>
                  <span style={{ ...s.colNum, ...saldoEstilo(ent.saldo) }}>{ent.saldo}</span>
                </div>

                {abertoEnt && ent.pecas.map((p) => {
                  const pkey = ent.entidade + '||' + p.peca
                  const abertoPeca = pecaExp.has(pkey)
                  const pecaAlerta = alertaVelho(p.emReparacaoDesde, p.emReparacao)
                  return (
                    <div key={pkey}>
                      <div style={{ ...s.linha, ...s.linhaPeca }} onClick={() => toggle(pecaExp, pkey, setPecaExp)}>
                        <span style={{ ...s.colNome, paddingLeft: 26 }}>
                          <span style={s.seta}>{abertoPeca ? '▾' : '▸'}</span>
                          {p.peca}
                          {pecaAlerta && <span style={s.badgeAlerta} title={`Em reparação há mais de ${diasAlerta} dias (desde ${dataPt(p.emReparacaoDesde)})`}>⏱</span>}
                        </span>
                        <span style={s.colNum}>{p.enviado}</span>
                        <span style={s.colNum}>{p.recebido}</span>
                        <span style={s.colNum}>{p.emReparacao || '—'}</span>
                        <span style={{ ...s.colNum, ...saldoEstilo(p.saldo) }}>{p.saldo}</span>
                      </div>

                      {abertoPeca && (
                        <div style={s.movBloco}>
                          {p.movimentos.map((m) => (
                            <div key={m.id} style={s.movLinha}>
                              <span style={s.movRef}>{m.referencia || (m.serial_number ? `S/N ${m.serial_number}` : '—')}</span>
                              <span style={s.movEstado}>{estadoLabel(m.estado)}</span>
                              <span style={s.movData}>Saída: {dataPt(m.data_saida)}</span>
                              <span style={s.movData}>Entrada: {dataPt(m.data_entrada)}</span>
                              <span style={s.movQtd}>{m.enviado}{m.recebido !== m.enviado ? ` / rec. ${m.recebido}` : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

function saldoEstilo(saldo: number): React.CSSProperties {
  if (saldo < 0) return { color: '#c62828', fontWeight: 800 }
  if (saldo > 0) return { color: '#00795c', fontWeight: 700 }
  return { color: 'var(--muted)' }
}
function estadoLabel(e: ParteMovimento['estado']): string {
  return e === 'recebido' ? '✓ Recebido' : e === 'em_reparacao' ? '🔧 Em reparação' : '⊘ Sem retorno'
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  btnReceber: { background: 'var(--primary)', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' },
  nota: { fontSize: 13, color: 'var(--muted)', margin: '4px 0 14px' },
  filtros: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  input: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit', minWidth: 150 },
  campoData: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' },
  inputData: { padding: '7px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--foreground)', font: 'inherit' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--foreground)', cursor: 'pointer' },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  tabela: { border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' },
  linhaCab: { display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'var(--background)', textTransform: 'uppercase', letterSpacing: 0.3 },
  linha: { display: 'flex', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 14 },
  linhaEnt: { background: 'var(--surface)' },
  linhaPeca: { background: 'var(--background)' },
  colNome: { flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: 'var(--foreground)' },
  colNum: { width: 62, textAlign: 'right', color: 'var(--foreground)' },
  seta: { color: 'var(--muted)', fontSize: 11, width: 12 },
  badgeAlerta: { fontSize: 11, fontWeight: 700, color: '#9a5b00', background: '#fdf2e3', border: '1px solid #f0c884', borderRadius: 999, padding: '1px 7px' },
  movBloco: { background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '4px 12px 10px 40px' },
  movLinha: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--muted)' },
  movRef: { fontWeight: 700, color: 'var(--foreground)', minWidth: 90 },
  movEstado: { minWidth: 110 },
  movData: { minWidth: 130 },
  movQtd: { marginLeft: 'auto', fontWeight: 700, color: 'var(--foreground)' },
}
