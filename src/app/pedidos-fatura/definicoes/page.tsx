'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { carregarConfigPedidos, guardarConfigPedidos, listarFuncionarios, type FuncionarioOpc } from '@/lib/pedidosFatura'
import type { PedidoFaturaConfig } from '@/types/pedidoFatura'

// Definições dos Pedidos de Fatura (admin/financeiro): template do email,
// lembretes e substituto de faturação.
export default function DefinicoesPedidosPage() {
  const { perfil, isFinanceiro, perfilCarregado } = useAuth()
  const [cfg, setCfg] = useState<PedidoFaturaConfig | null>(null)
  const [funcs, setFuncs] = useState<FuncionarioOpc[]>([])
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    carregarConfigPedidos().then(setCfg)
    listarFuncionarios().then(setFuncs)
  }, [])

  async function guardar() {
    if (!cfg) return
    setAGravar(true); setMsg(null)
    const { error } = await guardarConfigPedidos(cfg, perfil?.nome ?? null)
    setAGravar(false)
    setMsg(error ? 'Erro ao guardar: ' + error.message : 'Guardado ✓')
  }

  if (perfilCarregado && !isFinanceiro) {
    return <main style={c.page}><p style={c.info}>Sem acesso. Esta área é do financeiro/administração.</p></main>
  }
  if (!cfg) return <main style={c.page}><p style={c.info}>A carregar…</p></main>

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>⚙️ Pedidos de Fatura — Definições</h1>
        <Link href="/pedidos-fatura" style={c.voltar}>← Pedidos</Link>
      </div>

      <section style={c.card}>
        <div style={c.cardTitulo}>Template do email ao cliente</div>
        <p style={c.ajuda}>Marcadores: {'{n_fatura}'} · {'{nome_cliente}'} · {'{nome_contacto}'} · {'{data_fatura}'} · {'{valor_total}'}. A assinatura da Vanessa é acrescentada automaticamente.</p>
        <label style={c.campo}>
          <span style={c.rotulo}>Assunto</span>
          <input value={cfg.assunto_template} onChange={(e) => setCfg({ ...cfg, assunto_template: e.target.value })} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Corpo</span>
          <textarea value={cfg.corpo_template} onChange={(e) => setCfg({ ...cfg, corpo_template: e.target.value })} style={{ ...c.input, minHeight: 180, resize: 'vertical' }} />
        </label>
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Lembretes</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={c.campo}>
            <span style={c.rotulo}>Avisar após (horas)</span>
            <input type="number" min={1} max={720} value={cfg.lembrete_horas}
              onChange={(e) => setCfg({ ...cfg, lembrete_horas: Math.max(1, Number(e.target.value) || 48) })}
              style={{ ...c.input, maxWidth: 120 }} />
          </label>
          <label style={c.check}>
            <input type="checkbox" checked={cfg.lembrete_horas_uteis} onChange={(e) => setCfg({ ...cfg, lembrete_horas_uteis: e.target.checked })} />
            Contar só horas úteis (excluir fim de semana)
          </label>
          <label style={c.check}>
            <input type="checkbox" checked={cfg.escalona_cc_andreia} onChange={(e) => setCfg({ ...cfg, escalona_cc_andreia: e.target.checked })} />
            A partir do 2º lembrete, CC à Andreia
          </label>
        </div>
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Substituto de faturação</div>
        <p style={c.ajuda}>Quando definido, as notificações e lembretes vão para esta pessoa (ex.: férias da Vanessa).</p>
        <select
          value={cfg.substituto_id ?? ''}
          onChange={(e) => {
            const f = funcs.find((x) => x.id === e.target.value)
            setCfg({ ...cfg, substituto_id: f?.id ?? null, substituto_nome: f?.nome ?? null })
          }}
          style={{ ...c.input, maxWidth: 320 }}
        >
          <option value="">— sem substituto (vai para o financeiro) —</option>
          {funcs.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </section>

      {msg && <div style={{ fontSize: 14, fontWeight: 600, color: msg.startsWith('Erro') ? 'var(--danger)' : 'var(--primary)' }}>{msg}</div>}
      <div><button style={c.btnPrimario} onClick={guardar} disabled={aGravar}>{aGravar ? 'A guardar…' : 'Guardar'}</button></div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  titulo: { fontSize: 20, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  info: { color: 'var(--muted)', padding: 24, textAlign: 'center' },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  ajuda: { fontSize: 13, color: 'var(--muted)', margin: 0 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { padding: 10, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box', width: '100%' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
}
