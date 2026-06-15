'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AlugueresNav from '@/components/AlugueresNav'
import { listarModelos, verificarDisponibilidade, type ResultadoDisponibilidade } from '@/lib/disponibilidade'
import { MODALIDADE_OPCOES, MODALIDADE_CONFIG, ZIMMER_PACK, type ModeloAluguer, type Modalidade } from '@/types/reserva'

export default function DisponibilidadePage() {
  const [modelos, setModelos] = useState<ModeloAluguer[]>([])
  const [modeloId, setModeloId] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [modalidade, setModalidade] = useState<Modalidade | ''>('')
  const [resultado, setResultado] = useState<ResultadoDisponibilidade | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aVerificar, setAVerificar] = useState(false)

  useEffect(() => { listarModelos().then(setModelos) }, [])

  const modelo = modelos.find((m) => m.id === modeloId)

  async function verificar() {
    setErro(null)
    setResultado(null)
    if (!modelo) return setErro('Escolhe um modelo.')
    if (!inicio || !fim) return setErro('Indica as datas de início e fim.')
    if (fim < inicio) return setErro('A data de fim não pode ser anterior à de início.')
    setAVerificar(true)
    const r = await verificarDisponibilidade(modelo, inicio, fim)
    setResultado(r)
    setAVerificar(false)
  }

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <h1 style={c.titulo}>Disponibilidade</h1>
        <Link href="/alugueres/lista" style={c.voltar}>← Alugueres</Link>
      </div>
      <AlugueresNav />

      <div style={c.painel}>
        <div style={c.campo}>
          <label style={c.lbl}>Modelo</label>
          <select value={modeloId} onChange={(e) => { setModeloId(e.target.value); setResultado(null) }} style={c.input}>
            <option value="">— Escolher modelo —</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}{m.requer_zimmer ? ' (pack + Zimmer)' : ''}</option>
            ))}
          </select>
        </div>

        <div style={c.linhaCampos}>
          <div style={c.campo}>
            <label style={c.lbl}>De</label>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={c.input} />
          </div>
          <div style={c.campo}>
            <label style={c.lbl}>Até</label>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} style={c.input} />
          </div>
          <div style={c.campo}>
            <label style={c.lbl}>Modalidade</label>
            <select value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade | '')} style={c.input}>
              <option value="">—</option>
              {MODALIDADE_OPCOES.map((m) => <option key={m} value={m}>{MODALIDADE_CONFIG[m].label}</option>)}
            </select>
          </div>
        </div>

        {modelo?.requer_zimmer && (
          <p style={c.notaPack}>📦 Este modelo é alugado em <strong>pack com {ZIMMER_PACK}</strong> (incluído no preço).</p>
        )}

        {erro && <div style={c.erro}>{erro}</div>}

        <button onClick={verificar} disabled={aVerificar} style={c.btn}>
          {aVerificar ? 'A verificar...' : 'Verificar disponibilidade'}
        </button>
      </div>

      {resultado && (
        <div style={{ ...c.resultado, borderColor: resultado.disponivel ? '#00A87A' : 'var(--danger)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: resultado.disponivel ? '#00A87A' : 'var(--danger)' }}>
            {resultado.disponivel ? '✓ Disponível' : '✗ Sem disponibilidade'}
          </div>
          <div style={c.detalhe}>
            <span><strong>{resultado.modelo.nome}</strong>: {resultado.laserDisponiveis} de {resultado.frotaLaser} livres no período</span>
            {resultado.requerZimmer && (
              <span>{ZIMMER_PACK}: {resultado.zimmerDisponiveis} de {resultado.frotaZimmer} livres</span>
            )}
            {resultado.requerZimmer && !resultado.disponivel && resultado.laserDisponiveis > 0 && resultado.zimmerDisponiveis <= 0 && (
              <span style={{ color: 'var(--danger)' }}>Há laser livre, mas não há Zimmer Cryo 6 disponível para o pack.</span>
            )}
          </div>
        </div>
      )}

      <p style={c.rodape}>
        A disponibilidade é calculada com base na frota registada e nas reservas existentes (pendentes e confirmadas) que se sobrepõem ao período.
      </p>
    </main>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  painel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 },
  linhaCampos: { display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  lbl: { fontSize: 14, fontWeight: 600 },
  input: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--foreground)', width: '100%' },
  notaPack: { marginTop: 12, fontSize: 13, background: 'var(--accent-bg)', borderRadius: 8, padding: '8px 12px' },
  erro: { marginTop: 12, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontWeight: 600 },
  btn: { marginTop: 16, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' },
  resultado: { marginTop: 16, background: 'var(--surface)', border: '2px solid', borderRadius: 12, padding: 18 },
  detalhe: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontSize: 14 },
  rodape: { marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
}
