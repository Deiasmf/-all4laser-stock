'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarFolhas } from '@/lib/folhasObra'
import {
  ESTADO_FOLHA_CONFIG, ESTADO_FOLHA_OPCOES, TIPOS_SERVICO,
  type FolhaObra,
} from '@/types/folhaObra'

const MES_ATUAL = new Date().toISOString().slice(0, 7)
const nomesMes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function contar<T extends string>(itens: (T | null)[], rotuloVazio: string) {
  const m = new Map<string, number>()
  for (const it of itens) {
    const k = it ?? rotuloVazio
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export default function DashboardFolhas() {
  const [folhas, setFolhas] = useState<FolhaObra[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let activo = true
    listarFolhas()
      .then((d) => { if (activo) setFolhas(d) })
      .finally(() => { if (activo) setCarregando(false) })
    return () => { activo = false }
  }, [])

  const stats = useMemo(() => {
    const total = folhas.length
    const esteMes = folhas.filter((f) => f.data_intervencao?.startsWith(MES_ATUAL)).length
    const concluidas = folhas.filter((f) => f.estado === 'concluida').length
    const pendentes = folhas.filter((f) => f.estado === 'pendente_assinatura').length

    const porEstado = new Map<string, number>()
    for (const e of ESTADO_FOLHA_OPCOES) porEstado.set(e, 0)
    for (const f of folhas) porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1)

    const porTipo = contar(folhas.map((f) => f.tipo_servico), 'Sem tipo')
    const porTecnico = contar(folhas.map((f) => f.tecnico_nome), 'Sem técnico')

    // Gráfico: folhas por mês (últimos 12 meses, por data_intervencao)
    const meses: { label: string; n: number }[] = []
    const hoje = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      meses.push({
        label: `${nomesMes[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        n: folhas.filter((f) => f.data_intervencao?.startsWith(chave)).length,
      })
    }
    const maxMes = Math.max(1, ...meses.map((m) => m.n))

    const comAlex = folhas.filter(
      (f) =>
        f.valor_cabeca_alex != null || f.valor_transmissao_alex != null ||
        f.valor_cabeca_yag != null || f.valor_transmissao_yag != null
    ).length

    return { total, esteMes, concluidas, pendentes, porEstado, porTipo, porTecnico, meses, maxMes, comAlex }
  }, [folhas])

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>Dashboard · Folhas de Obra</h1>
          <Link href="/tecnico/folhas-obra" style={c.voltar}>← Folhas de Obra</Link>
        </div>
      </div>

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : (
        <>
          <div style={c.kpis}>
            <Kpi numero={stats.total} rotulo="Total de folhas" />
            <Kpi numero={stats.esteMes} rotulo="Este mês" />
            <Kpi numero={stats.concluidas} rotulo="Concluídas" cor="#00A87A" />
            <Kpi numero={stats.pendentes} rotulo="Pendentes de assinatura" cor="#D4820A" />
          </div>

          <section style={c.seccao}>
            <div style={c.seccaoTitulo}>Por estado</div>
            {ESTADO_FOLHA_OPCOES.map((e) => (
              <Barra
                key={e}
                rotulo={ESTADO_FOLHA_CONFIG[e].label}
                valor={stats.porEstado.get(e) ?? 0}
                max={stats.total}
                cor={ESTADO_FOLHA_CONFIG[e].color}
              />
            ))}
          </section>

          <section style={c.seccao}>
            <div style={c.seccaoTitulo}>Intervenções nos últimos 12 meses</div>
            {stats.meses.map((m) => (
              <Barra key={m.label} rotulo={m.label} valor={m.n} max={stats.maxMes} cor="var(--primary)" />
            ))}
          </section>

          <section style={c.seccao}>
            <div style={c.seccaoTitulo}>Por tipo de serviço</div>
            {TIPOS_SERVICO.map((t) => (
              <Barra key={t} rotulo={t} valor={stats.porTipo.get(t) ?? 0} max={stats.total} cor="var(--primary)" />
            ))}
            {stats.porTipo.get('Sem tipo') ? (
              <Barra rotulo="Sem tipo" valor={stats.porTipo.get('Sem tipo') ?? 0} max={stats.total} cor="var(--muted)" />
            ) : null}
          </section>

          <section style={c.seccao}>
            <div style={c.seccaoTitulo}>Por técnico</div>
            {Array.from(stats.porTecnico.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([nome, n]) => (
                <Barra key={nome} rotulo={nome} valor={n} max={stats.total} cor="var(--primary)" />
              ))}
          </section>

          {stats.comAlex > 0 && (
            <section style={c.seccao}>
              <div style={c.seccaoTitulo}>Candela Alex/Yag</div>
              <p style={{ fontSize: 14, color: 'var(--foreground)', margin: 0 }}>
                Folhas com valores de cabeça/transmissão registados: <strong>{stats.comAlex}</strong>
              </p>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function Kpi({ numero, rotulo, cor }: { numero: number; rotulo: string; cor?: string }) {
  return (
    <div style={c.kpi}>
      <div style={{ ...c.kpiNumero, color: cor ?? 'var(--primary)' }}>{numero}</div>
      <div style={c.kpiRotulo}>{rotulo}</div>
    </div>
  )
}

function Barra({ rotulo, valor, max, cor }: { rotulo: string; valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0
  return (
    <div style={c.barraLinha}>
      <span style={c.barraRotulo}>{rotulo}</span>
      <div style={c.barraTrilho}>
        <div style={{ ...c.barraPreenchida, width: `${pct}%`, background: cor }} />
      </div>
      <span style={c.barraValor}>{valor}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 860, margin: '0 auto', padding: 20 },
  cabecalho: { marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 14 },
  estado: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 },
  kpi: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  kpiNumero: { fontSize: 28, fontWeight: 800 },
  kpiRotulo: { fontSize: 13, color: 'var(--muted)', marginTop: 2 },
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 },
  seccaoTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 12 },
  barraLinha: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barraRotulo: { fontSize: 13, color: 'var(--foreground)', width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barraTrilho: { flex: 1, height: 10, background: 'var(--background)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)' },
  barraPreenchida: { height: '100%', borderRadius: 999, minWidth: 2 },
  barraValor: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)', width: 32, textAlign: 'right' },
}
