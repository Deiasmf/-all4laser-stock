'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  criarConta, listarClientesPicker, TIPOS_CONTA, MOEDAS,
  type TipoConta, type ClientePicker,
} from '@/lib/cc'

function parseNum(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

export default function NovaContaPage() {
  const router = useRouter()
  const { perfil } = useAuth()

  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoConta>('consignacao')
  const [moeda, setMoeda] = useState('AED')
  const [clienteId, setClienteId] = useState('')
  const [clientes, setClientes] = useState<ClientePicker[]>([])
  const [partilha, setPartilha] = useState('50')
  const [prazo, setPrazo] = useState('30')
  const [taxa, setTaxa] = useState('')
  const [taxaInicio, setTaxaInicio] = useState('')
  const [taxaFim, setTaxaFim] = useState('')
  const [limite, setLimite] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesPicker().then(setClientes) }, [])

  const podeGuardar = useMemo(() => !!nome.trim() && !!moeda.trim(), [nome, moeda])

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica pelo menos o nome e a moeda da conta.'); return }
    setAGuardar(true)
    const { id, error } = await criarConta(
      {
        nome: nome.trim(),
        tipo,
        moeda: moeda.trim().toUpperCase(),
        cliente_id: clienteId || null,
        partilha_margem_pct: parseNum(partilha) ?? 50,
        prazo_pagamento_dias: parseNum(prazo) ?? 30,
        taxa_contratual: parseNum(taxa),
        taxa_contratual_inicio: taxaInicio || null,
        taxa_contratual_fim: taxaFim || null,
        limite_exposicao: parseNum(limite),
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    if (error) { setErro('Não foi possível guardar: ' + error.message); setAGuardar(false); return }
    router.push(id ? `/contas-correntes/${id}` : '/contas-correntes')
  }

  return (
    <main style={c.page}>
      <Link href="/contas-correntes" style={c.voltar}>← Contas Correntes</Link>
      <h1 style={c.titulo}>Nova conta</h1>

      {erro && <div style={c.erro}>{erro}</div>}

      <div style={c.card}>
        <label style={c.campo}>
          <span style={c.rotulo}>Nome da conta</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Laserix (Dubai)" style={c.input} />
        </label>

        <div style={c.grelha2}>
          <label style={c.campo}>
            <span style={c.rotulo}>Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)} style={c.input}>
              {TIPOS_CONTA.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </label>
          <label style={c.campo}>
            <span style={c.rotulo}>Moeda</span>
            <select value={moeda} onChange={(e) => setMoeda(e.target.value)} style={c.input}>
              {MOEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <label style={c.campo}>
          <span style={c.rotulo}>Cliente associado <span style={c.opc}>(opcional)</span></span>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={c.input}>
            <option value="">— sem cliente —</option>
            {clientes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
          </select>
        </label>

        <div style={c.grelha2}>
          <label style={c.campo}>
            <span style={c.rotulo}>Partilha de margem (%)</span>
            <input inputMode="decimal" value={partilha} onChange={(e) => setPartilha(e.target.value)} style={c.input} />
            <span style={c.ajuda}>Consignação: fração da margem que fica para a All4laser.</span>
          </label>
          <label style={c.campo}>
            <span style={c.rotulo}>Prazo de pagamento (dias)</span>
            <input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={c.input} />
          </label>
        </div>

        <div style={c.bloco}>
          <span style={c.blocoTitulo}>Taxa contratual <span style={c.opc}>(opcional)</span></span>
          <span style={c.ajuda}>
            Unidades da moeda por 1 EUR (ex.: 4,40 = 1 EUR → 4,40 {moeda}). Se definida, aplica-se
            às vendas dentro do intervalo de datas; senão, a taxa é pedida em cada venda.
          </span>
          <div style={c.grelha3}>
            <label style={c.campo}>
              <span style={c.rotulo}>Taxa ({moeda}/EUR)</span>
              <input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="4,40" style={c.input} />
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Início</span>
              <input type="date" value={taxaInicio} onChange={(e) => setTaxaInicio(e.target.value)} style={c.input} />
            </label>
            <label style={c.campo}>
              <span style={c.rotulo}>Fim</span>
              <input type="date" value={taxaFim} onChange={(e) => setTaxaFim(e.target.value)} style={c.input} />
            </label>
          </div>
        </div>

        <label style={c.campo}>
          <span style={c.rotulo}>Limite de exposição <span style={c.opc}>(opcional)</span></span>
          <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder={`ex.: 200000 (${moeda})`} style={{ ...c.input, maxWidth: 260 }} />
          <span style={c.ajuda}>Alerta quando o saldo em aberto ultrapassa este valor.</span>
        </label>

        <label style={c.campo}>
          <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 60, resize: 'vertical' }} />
        </label>

        <div style={c.acoes}>
          <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
            {aGuardar ? 'A guardar...' : 'Criar conta'}
          </button>
        </div>
      </div>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 680, margin: '0 auto', padding: 20 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', fontSize: 13 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', margin: '6px 0 16px' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  grelha3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  bloco: { display: 'flex', flexDirection: 'column', gap: 8, border: '1px dashed var(--border)', borderRadius: 10, padding: 12 },
  blocoTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)' },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  acoes: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
}
