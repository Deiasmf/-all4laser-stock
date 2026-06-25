'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  obterEnvio, listarItens, alterarEstado, marcarPago,
  carregarDocumento, notificarProntoExpedir, atualizarEnvio, listarFuncionarios,
  type FuncionarioOpc,
} from '@/lib/enviosPecas'
import {
  estadoInfo, transportadoraLabel, formatarEuro, TRANSPORTADORA_LINK, TRANSPORTADORAS, KEYINVOICE_URL,
  type EnvioPeca, type EnvioItem,
} from '@/types/envioPecas'

const hoje = () => new Date().toISOString().slice(0, 10)

export default function DetalheEnvioPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [envio, setEnvio] = useState<EnvioPeca | null>(null)
  const [itens, setItens] = useState<EnvioItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpc[]>([])

  useEffect(() => { listarFuncionarios().then(setFuncionarios) }, [])

  const recarregar = useCallback(async () => {
    const { data } = await obterEnvio(id)
    setEnvio((data as EnvioPeca) ?? null)
    setItens(await listarItens(id))
    setCarregando(false)
  }, [id])

  // setState corre só após o await dentro de recarregar()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])

  async function mudar(estado: EnvioPeca['estado']) {
    setATrabalhar(true); setMsg(null)
    await alterarEstado(id, estado)
    await recarregar()
    setATrabalhar(false)
  }

  // Logística → handoff para o Administrativo
  async function marcarProntoExpedir() {
    setATrabalhar(true); setMsg(null)
    await alterarEstado(id, 'pronto_a_expedir')
    const { data } = await obterEnvio(id)
    if (data) await notificarProntoExpedir(data as EnvioPeca).catch(() => {})
    await recarregar()
    setATrabalhar(false)
  }

  function faturar() {
    window.open(KEYINVOICE_URL, '_blank', 'noopener,noreferrer')
  }

  async function mudarTransportadora(t: string) {
    setATrabalhar(true)
    await atualizarEnvio(id, {
      transportadora: t || null,
      transportadora_outro: t === 'Outro' ? envio?.transportadora_outro ?? null : null,
    })
    await recarregar()
    setATrabalhar(false)
  }

  async function guardarTransportadoraOutro(v: string) {
    setATrabalhar(true)
    await atualizarEnvio(id, { transportadora_outro: v.trim() || null })
    await recarregar()
    setATrabalhar(false)
  }

  async function confirmarExpedicao() {
    if (!envio?.carta_porte_url) { setMsg('Carrega a carta de porte antes de expedir.'); return }
    setATrabalhar(true); setMsg(null)
    await alterarEstado(id, 'expedido')
    await recarregar()
    setATrabalhar(false)
  }

  async function upload(tipo: 'fatura' | 'carta_porte', file: File | undefined) {
    if (!file) return
    setATrabalhar(true); setMsg(null)
    const r = await carregarDocumento(id, tipo, file)
    if (!r.ok) setMsg('Erro no upload: ' + (r.motivo ?? ''))
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarResponsavel(fid: string) {
    setATrabalhar(true)
    const nome = funcionarios.find((f) => f.id === fid)?.nome ?? null
    await atualizarEnvio(id, { responsavel_id: fid || null, responsavel_nome: nome })
    await recarregar()
    setATrabalhar(false)
  }

  async function togglePago() {
    if (!envio) return
    setATrabalhar(true); setMsg(null)
    await marcarPago(id, !envio.pago, !envio.pago ? hoje() : null)
    await recarregar()
    setATrabalhar(false)
  }

  async function mudarDataPagamento(data: string) {
    setATrabalhar(true)
    await marcarPago(id, true, data || hoje())
    await recarregar()
    setATrabalhar(false)
  }

  async function enviarDocumentos() {
    setATrabalhar(true); setMsg(null)
    try {
      const r = await fetch('/api/envios-pecas/enviar-documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const j = await r.json()
      setMsg(j.ok ? '✅ Documentos enviados ao cliente.' : '⚠️ ' + (j.erro ?? 'Não foi possível enviar.'))
    } catch {
      setMsg('⚠️ Erro de rede ao enviar os documentos.')
    }
    setATrabalhar(false)
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!envio) return <main style={c.page}><p style={c.muted}>Envio não encontrado.</p></main>

  const i = estadoInfo(envio.estado)
  const dims = [envio.comprimento_cm, envio.largura_cm, envio.altura_cm].filter((x) => x != null)

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{envio.numero ?? 'Envio'}</h1>
          <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px', color: i.cor, background: i.bg }}>{i.label}</span>
        </div>
        <Link href="/logistico/envios-pecas" style={c.voltar}>← Envios</Link>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Funcionário responsável */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Funcionário responsável</div>
        <select
          value={envio.responsavel_id ?? ''}
          onChange={(e) => mudarResponsavel(e.target.value)}
          disabled={aTrabalhar}
          style={c.input}
        >
          <option value="">— quem está a tratar —</option>
          {funcionarios.map((fn) => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
        </select>
      </section>

      {/* Dados */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Cliente</div>
        <Linha rotulo="Nome" valor={envio.cliente_nome} />
        <Linha rotulo="Email" valor={envio.cliente_email} />
        <Linha rotulo="Morada de envio" valor={envio.morada_envio} />
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Itens</div>
        {itens.length === 0 ? <p style={c.muted}>Sem itens.</p> : (
          <div style={c.itens}>
            {itens.map((it) => (
              <div key={it.id} style={c.itemLinha}>
                <span>{it.peca_nome}</span>
                <span style={c.muted}>{it.quantidade} × {formatarEuro(it.preco_unitario)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(it.preco_total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={c.card}>
        <div style={c.cardTitulo}>Envio</div>
        <Linha rotulo="Transportadora" valor={transportadoraLabel(envio)} />
        <Linha rotulo="Dimensões (C×L×A)" valor={dims.length ? dims.map((d) => `${d}`).join(' × ') + ' cm' : null} />
        <Linha rotulo="Peso" valor={envio.peso_kg != null ? `${envio.peso_kg} kg` : null} />
        <Linha rotulo="Valor a faturar" valor={formatarEuro(envio.valor_a_faturar)} />
        {envio.notas && <Linha rotulo="Notas" valor={envio.notas} />}
      </section>

      {/* Documentos */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Documentos</div>
        <div style={c.docLinha}>
          <span>Carta de porte</span>
          {envio.carta_porte_url
            ? <a href={envio.carta_porte_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : <span style={c.muted}>— por carregar</span>}
        </div>
        <div style={c.docLinha}>
          <span>Fatura</span>
          {envio.fatura_url
            ? <a href={envio.fatura_url} target="_blank" rel="noopener noreferrer" style={c.link}>Ver documento ↗</a>
            : <span style={c.muted}>— por carregar</span>}
        </div>
      </section>

      {/* Ações por estado */}
      {envio.estado === 'aberto' && (
        <Acoes>
          <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => mudar('a_realizar')}>Marcar como A Realizar</button>
          <button style={c.btnGhost} disabled={aTrabalhar} onClick={() => mudar('cancelado')}>Cancelar envio</button>
        </Acoes>
      )}

      {envio.estado === 'a_realizar' && (
        <Acoes>
          <button style={c.btnPrimario} disabled={aTrabalhar} onClick={marcarProntoExpedir}>Marcar como Pronto a Expedir</button>
        </Acoes>
      )}

      {/* Logística termina em "pronto a expedir"; daqui para a frente é Administrativo */}
      {envio.estado === 'pronto_a_expedir' && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Administrativo — Faturação e expedição</div>

          {/* 1. Faturar (Keyinvoice) */}
          <button style={c.btnSecundario} disabled={aTrabalhar} onClick={faturar}>🧾 Faturar (abrir Keyinvoice)</button>

          {/* 2. Transportadora — escolher e abrir o site para fazer a carta de porte */}
          <div style={{ marginTop: 12 }}>
            <div style={c.rotulo}>Transportadora</div>
            <select value={envio.transportadora ?? ''} onChange={(e) => mudarTransportadora(e.target.value)} disabled={aTrabalhar} style={{ ...c.input, maxWidth: 240, marginTop: 4 }}>
              <option value="">— escolher —</option>
              {TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {envio.transportadora === 'Outro' && (
              <input
                key={envio.transportadora_outro ?? ''}
                defaultValue={envio.transportadora_outro ?? ''}
                placeholder="Qual transportadora?"
                onBlur={(e) => guardarTransportadoraOutro(e.target.value)}
                style={{ ...c.input, maxWidth: 240, marginTop: 8, display: 'block' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {(['Nacex', 'UPS', 'FedEx'] as const).map((t) => (
                <a key={t} href={TRANSPORTADORA_LINK[t]} target="_blank" rel="noopener noreferrer" style={c.btnTrans}>Abrir {t} ↗</a>
              ))}
            </div>
          </div>

          {/* 3. Adicionar carta de porte e fatura */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <label style={c.uploadLabel}>
              {envio.carta_porte_url ? 'Substituir carta de porte ✓' : 'Carregar carta de porte'}
              <input type="file" style={{ display: 'none' }} onChange={(e) => upload('carta_porte', e.target.files?.[0])} />
            </label>
            <label style={c.uploadLabel}>
              {envio.fatura_url ? 'Substituir fatura ✓' : 'Carregar fatura'}
              <input type="file" style={{ display: 'none' }} onChange={(e) => upload('fatura', e.target.files?.[0])} />
            </label>
          </div>

          {/* 4. Confirmar expedição */}
          <button style={{ ...c.btnPrimario, marginTop: 14 }} disabled={aTrabalhar || !envio.carta_porte_url} onClick={confirmarExpedicao}>
            Confirmar Expedição
          </button>
          {!envio.carta_porte_url && <p style={c.ajuda}>Carrega a carta de porte para poder expedir.</p>}
        </section>
      )}

      {envio.estado === 'expedido' && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Administrativo — Cliente e pagamento</div>

          <button style={c.btnSecundario} disabled={aTrabalhar} onClick={enviarDocumentos}>
            ✉️ Enviar documentos ao cliente
          </button>
          {!envio.fatura_url && <p style={c.ajuda}>Sugestão: carrega a fatura antes de enviar (na fase anterior).</p>}

          {/* Pago toggle */}
          <div style={{ marginTop: 16 }}>
            <div style={c.rotulo}>Pagamento</div>
            <button
              onClick={togglePago}
              disabled={aTrabalhar}
              style={{ ...c.toggle, background: envio.pago ? '#15803D' : '#DC2626' }}
              aria-pressed={envio.pago}
            >
              <span style={{ ...c.toggleKnob, transform: envio.pago ? 'translateX(26px)' : 'translateX(0)' }} />
              <span style={c.toggleTexto}>{envio.pago ? 'Pago' : 'Não pago'}</span>
            </button>

            {envio.pago && (
              <div style={{ marginTop: 10 }}>
                <label style={c.rotulo}>Data de pagamento</label>
                <input type="date" value={envio.data_pagamento ?? hoje()} onChange={(e) => mudarDataPagamento(e.target.value)} style={{ ...c.input, maxWidth: 200, display: 'block', marginTop: 4 }} />
              </div>
            )}
          </div>
        </section>
      )}

      {envio.estado === 'cancelado' && <p style={c.muted}>Este envio foi cancelado.</p>}
    </main>
  )
}

function Acoes({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div style={c.linhaInfo}>
      <span style={c.linhaRotulo}>{rotulo}</span>
      <span style={{ whiteSpace: 'pre-wrap' }}>{valor || '—'}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  linhaInfo: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 14 },
  linhaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  itens: { display: 'flex', flexDirection: 'column', gap: 6 },
  itemLinha: { display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr', gap: 8, fontSize: 14, alignItems: 'center', borderBottom: '1px solid #f4f4f4', paddingBottom: 4 },
  docLinha: { display: 'flex', justifyContent: 'space-between', fontSize: 14 },
  link: { color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' },
  muted: { color: 'var(--muted)', fontSize: 14 },
  ajuda: { color: 'var(--muted)', fontSize: 13, margin: 0 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  uploadLabel: { display: 'inline-block', background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px dashed var(--primary)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSecundario: { background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 15, marginTop: 8 },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer' },
  btnTrans: { background: 'var(--accent-bg, #eef1f6)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontWeight: 700, textDecoration: 'none' },
  toggle: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 999, padding: '6px 14px 6px 8px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14, marginTop: 6, minWidth: 110 },
  toggleKnob: { width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s', display: 'inline-block' },
  toggleTexto: { marginLeft: 4 },
}
