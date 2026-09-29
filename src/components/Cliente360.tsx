'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { formatarEuro, formatarData } from '@/lib/contasCorrentes'
import {
  carregarFinanceiroCliente, carregarEnvios, carregarTracking, carregarAlugueres,
  carregarEquipamentos, carregarPecasParceiro, listarNotasCliente, criarNotaCliente, apagarNotaCliente,
  carregarFichasEnviadas, carregarAvisosPagamento, emTransito,
  TIMELINE_ICONE, TIMELINE_LABEL,
  type FinanceiroCliente, type EnvioResumo, type TrackingResumo, type AluguerResumo,
  type EquipamentoResumo, type PecaSaldo, type ClienteNota, type DocItem,
  type TimelineEvento, type TimelineTipo,
} from '@/lib/cliente360'
import { historicoCliente } from '@/lib/clientes'
import type { Cliente, HistoricoItem } from '@/types/cliente'

// Vista 360º agregada por cliente. Só lê dos módulos existentes; a única secção
// com escrita é "Notas internas". A secção Financeiro só aparece a admin/financeiro.
export default function Cliente360({ cliente }: { cliente: Cliente }) {
  const { perfil, isFinanceiro, isGestorUtilizadores } = useAuth()
  const [fin, setFin] = useState<FinanceiroCliente | null>(null)
  const [envios, setEnvios] = useState<EnvioResumo[]>([])
  const [tracking, setTracking] = useState<TrackingResumo[]>([])
  const [alugueres, setAlugueres] = useState<AluguerResumo[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([])
  const [pecas, setPecas] = useState<PecaSaldo[]>([])
  const [notas, setNotas] = useState<ClienteNota[]>([])
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [fichas, setFichas] = useState<DocItem[]>([])
  const [avisos, setAvisos] = useState<DocItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novaNota, setNovaNota] = useState('')
  const [aGuardarNota, setAGuardarNota] = useState(false)
  const [filtro, setFiltro] = useState<TimelineTipo | 'todos'>('todos')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [en, tr, al, eq, pc, no, hi, fi, f, av] = await Promise.all([
      carregarEnvios(cliente.id),
      carregarTracking(cliente.id),
      carregarAlugueres(cliente.id),
      carregarEquipamentos(cliente.nome),
      carregarPecasParceiro(cliente.nome),
      listarNotasCliente(cliente.id),
      historicoCliente(cliente),
      carregarFichasEnviadas(cliente.id),
      isFinanceiro ? carregarFinanceiroCliente(cliente.id) : Promise.resolve(null),
      isFinanceiro ? carregarAvisosPagamento(cliente.id) : Promise.resolve([] as DocItem[]),
    ])
    setEnvios(en); setTracking(tr); setAlugueres(al); setEquipamentos(eq); setPecas(pc)
    setNotas(no); setHistorico(hi); setFichas(fi); setFin(f); setAvisos(av)
    setCarregando(false)
  }, [cliente, isFinanceiro])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  const emTransitoLista = useMemo(() => tracking.filter(emTransito), [tracking])
  const alugueresAtivos = useMemo(
    () => new Set(alugueres.filter((a) => !a.data_recolha && a.data_entrega).map((a) => a.serial_number)).size,
    [alugueres],
  )
  const saldoPecas = useMemo(
    () => (pecas.length ? pecas.reduce((s, p) => s + (p.saldo ?? 0), 0) : null),
    [pecas],
  )
  const ultimaInteracao = useMemo(() => {
    const datas = [
      ...envios.map((e) => e.created_at),
      ...tracking.map((t) => t.created_at),
      ...alugueres.map((a) => a.data_entrega),
      ...notas.map((n) => n.created_at),
      fin?.extrato.at(-1)?.data_documento ?? null,
    ].filter(Boolean) as string[]
    return datas.length ? datas.sort().at(-1) ?? null : null
  }, [envios, tracking, alugueres, notas, fin])

  // Timeline unificada (a partir dos dados já carregados; sem novas queries).
  const timeline = useMemo<TimelineEvento[]>(() => {
    const ev: TimelineEvento[] = []
    for (const h of historico) ev.push({ chave: `h-${h.tipo}-${h.id}`, tipo: h.tipo as TimelineTipo, data: h.data, titulo: h.titulo || TIMELINE_LABEL[h.tipo as TimelineTipo], detalhe: h.detalhe, href: h.href ?? undefined })
    for (const e of envios) {
      ev.push({ chave: `env-${e.id}`, tipo: 'envio', data: e.expedido_em ?? e.created_at, titulo: `EP ${e.numero || ''}`.trim(), detalhe: e.transportadora || '—' })
      if (e.entregue_em) ev.push({ chave: `env-ent-${e.id}`, tipo: 'entrega', data: e.entregue_em, titulo: `EP ${e.numero || ''} entregue`.trim(), detalhe: '' })
    }
    for (const t of tracking) {
      ev.push({ chave: `trk-${t.id}`, tipo: 'envio', data: t.data_expedicao ?? t.created_at, titulo: `${t.carrier_nome || 'Envio'} ${t.tracking_number || t.awb || ''}`.trim(), detalhe: t.descricao_conteudo || '' })
      if (t.entrega_efetiva) ev.push({ chave: `trk-ent-${t.id}`, tipo: 'entrega', data: t.entrega_efetiva, titulo: 'Entregue', detalhe: t.tracking_number || t.awb || '' })
    }
    if (fin) for (const m of fin.extrato) {
      if (m.tipo_documento === 'fatura') ev.push({ chave: `fat-${m.id}`, tipo: 'fatura', data: m.data_documento, titulo: `Fatura ${m.documento_ref || ''}`.trim(), detalhe: formatarEuro(m.valor_debito) })
      if (m.data_pagamento) ev.push({ chave: `pag-${m.id}`, tipo: 'pagamento', data: m.data_pagamento, titulo: `Pagamento ${m.documento_ref || ''}`.trim(), detalhe: formatarEuro(m.valor_credito || m.valor_liquidado || 0) })
    }
    for (const a of avisos) ev.push({ chave: `av-${a.id}`, tipo: 'aviso', data: a.data, titulo: a.titulo, detalhe: a.detalhe })
    for (const f of fichas) ev.push({ chave: `fi-${f.id}`, tipo: 'ficha', data: f.data, titulo: f.titulo, detalhe: f.detalhe })
    for (const n of notas) ev.push({ chave: `ni-${n.id}`, tipo: 'nota_interna', data: n.created_at, titulo: 'Nota interna', detalhe: n.texto })
    return ev.filter((e) => e.data).sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
  }, [historico, envios, tracking, fin, avisos, fichas, notas])

  const tiposPresentes = useMemo(() => Array.from(new Set(timeline.map((e) => e.tipo))), [timeline])
  const timelineFiltrada = filtro === 'todos' ? timeline : timeline.filter((e) => e.tipo === filtro)

  async function adicionarNota() {
    const t = novaNota.trim()
    if (!t) return
    setAGuardarNota(true)
    await criarNotaCliente(cliente.id, t, { id: perfil?.id ?? null, nome: perfil?.nome ?? perfil?.email ?? null })
    setNovaNota('')
    setNotas(await listarNotasCliente(cliente.id))
    setAGuardarNota(false)
  }
  async function removerNota(n: ClienteNota) {
    if (!window.confirm('Apagar esta nota?')) return
    await apagarNotaCliente(n.id)
    setNotas((arr) => arr.filter((x) => x.id !== n.id))
  }

  if (carregando) return <p style={c.aCarregar}>A carregar visão 360º…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Indicadores */}
      <div style={c.indicadores}>
        {isFinanceiro && <Indicador titulo="Saldo conta corrente" valor={formatarEuro(fin?.resumo?.saldo ?? 0)} cor={(fin?.resumo?.saldo ?? 0) > 0 ? '#B45309' : '#065F46'} />}
        {isFinanceiro && <Indicador titulo="Vencido" valor={formatarEuro(fin?.resumo?.vencido ?? 0)} cor={(fin?.resumo?.vencido ?? 0) > 0 ? '#B91C1C' : 'var(--muted)'} />}
        <Indicador titulo="Envios em trânsito" valor={String(emTransitoLista.length)} cor={emTransitoLista.length ? '#1D4ED8' : 'var(--muted)'} />
        {saldoPecas != null && <Indicador titulo="Saldo de peças" valor={String(saldoPecas)} cor={saldoPecas < 0 ? '#B91C1C' : '#065F46'} />}
        <Indicador titulo="Alugueres ativos" valor={String(alugueresAtivos)} cor={alugueresAtivos ? '#644DE3' : 'var(--muted)'} />
        <Indicador titulo="Última interação" valor={formatarData(ultimaInteracao)} cor="var(--foreground)" />
      </div>

      {/* Financeiro (só admin/financeiro) */}
      {isFinanceiro && (
        <Seccao titulo="Financeiro" acao={{ label: 'Ver conta corrente →', href: `/financeiro/contas-correntes/cliente/${cliente.id}` }}>
          {!fin || fin.extrato.length === 0 ? <Vazio /> : (
            <>
              <div style={c.miniIndics}>
                <span>Saldo <strong>{formatarEuro(fin.resumo?.saldo ?? 0)}</strong></span>
                <span>Vencido <strong style={{ color: (fin.resumo?.vencido ?? 0) > 0 ? '#B91C1C' : 'inherit' }}>{formatarEuro(fin.resumo?.vencido ?? 0)}</strong></span>
                <span>Pendentes <strong>{fin.resumo?.pendentes ?? 0}</strong></span>
              </div>
              <div style={c.lista}>
                {[...fin.extrato].reverse().slice(0, 6).map((m) => (
                  <div key={m.id} style={c.linha}>
                    <span style={c.linhaPrincipal}>{m.documento_ref || '—'} · {formatarData(m.data_documento)}</span>
                    <span style={c.linhaSec}>
                      {formatarEuro(m.valor_debito - m.valor_credito)}
                      {m.tipo_documento === 'fatura' && m.estadoCalc && (
                        <span style={{ ...c.pill, ...estadoPill(m.estadoCalc) }}>{m.estadoCalc}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Seccao>
      )}

      {/* Envios & Tracking */}
      <Seccao titulo="Envios & Tracking" acao={{ label: 'Ver tracking →', href: '/admin-dept/tracking' }}>
        {tracking.length === 0 && envios.length === 0 ? <Vazio /> : (
          <div style={c.lista}>
            {emTransitoLista.map((t) => (
              <div key={t.id} style={{ ...c.linha, background: '#EFF6FF', borderRadius: 8, padding: '8px 10px' }}>
                <span style={c.linhaPrincipal}>🚚 {t.carrier_nome || t.direcao || 'Envio'} · {t.tracking_number || t.awb || '—'}</span>
                <span style={c.linhaSec}>{t.last_status_milestone || t.estado || 'Em trânsito'}</span>
              </div>
            ))}
            {tracking.filter((t) => !emTransito(t)).slice(0, 5).map((t) => (
              <div key={t.id} style={c.linha}>
                <span style={c.linhaPrincipal}>{t.carrier_nome || 'Envio'} · {t.tracking_number || t.awb || '—'}</span>
                <span style={c.linhaSec}>{t.entrega_efetiva ? `Entregue ${formatarData(t.entrega_efetiva)}` : (t.last_status_milestone || t.estado || '—')}</span>
              </div>
            ))}
            {envios.slice(0, 5).map((e) => (
              <div key={e.id} style={c.linha}>
                <span style={c.linhaPrincipal}>📦 EP {e.numero || '—'} · {e.transportadora || '—'}</span>
                <span style={c.linhaSec}>{e.estado || '—'}{e.tracking_numero || e.awb_numero ? ` · ${e.tracking_numero || e.awb_numero}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Seccao>

      {/* Equipamentos & Alugueres */}
      <Seccao titulo="Equipamentos & Alugueres" acao={{ label: 'Ver alugueres →', href: '/alugueres/lista' }}>
        {alugueres.length === 0 && equipamentos.length === 0 ? <Vazio /> : (
          <div style={c.lista}>
            {alugueres.filter((a) => !a.data_recolha && a.data_entrega).slice(0, 8).map((a) => (
              <div key={a.id} style={c.linha}>
                <span style={c.linhaPrincipal}>🔄 {[a.modelo, a.serial_number].filter(Boolean).join(' · ')}</span>
                <span style={c.linhaSec}>Em aluguer desde {formatarData(a.data_entrega)}</span>
              </div>
            ))}
            {equipamentos.slice(0, 8).map((e) => (
              <div key={e.id} style={c.linha}>
                <span style={c.linhaPrincipal}>🩻 {[e.marca, e.modelo, e.serial_number].filter(Boolean).join(' · ')}</span>
                <span style={c.linhaSec}>{e.status || '—'}{e.data_saida ? ` · saída ${formatarData(e.data_saida)}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Seccao>

      {/* Peças (parceiro) — só quando o nome bate com uma entidade do sistema de peças */}
      {pecas.length > 0 && (
        <Seccao titulo="Peças (parceiro de reparação)" acao={{ label: 'Ver saldos de peças →', href: '/logistico' }}>
          <div style={c.lista}>
            {pecas.map((p, i) => (
              <div key={i} style={c.linha}>
                <span style={c.linhaPrincipal}>{p.peca || '—'}</span>
                <span style={c.linhaSec}>
                  enviadas {p.total_enviado ?? 0} · recebidas {p.total_recebido ?? 0} · em reparação {p.em_reparacao ?? 0} ·{' '}
                  <strong style={{ color: (p.saldo ?? 0) < 0 ? '#B91C1C' : '#065F46' }}>saldo {p.saldo ?? 0}</strong>
                </span>
              </div>
            ))}
          </div>
        </Seccao>
      )}

      {/* Documentos & Comunicações */}
      <Seccao titulo="Documentos & Comunicações">
        {fichas.length === 0 && avisos.length === 0 ? <Vazio /> : (
          <div style={c.lista}>
            {[...fichas, ...avisos].map((d) => (
              <div key={d.id} style={c.linha}>
                <span style={c.linhaPrincipal}>{d.tipo === 'ficha' ? '📃' : '📧'} {d.titulo}</span>
                <span style={c.linhaSec}>{[d.detalhe, formatarData(d.data)].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
      </Seccao>

      {/* Notas internas (escrita) */}
      <Seccao titulo="Notas internas">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <textarea
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            placeholder="Acrescentar uma nota interna (acordos, contactos, contexto)…"
            style={c.notaInput}
          />
          <button onClick={adicionarNota} disabled={aGuardarNota || !novaNota.trim()} style={c.notaBtn}>
            {aGuardarNota ? '…' : 'Adicionar'}
          </button>
        </div>
        {notas.length === 0 ? <Vazio texto="Sem notas internas." /> : (
          <div style={c.lista}>
            {notas.map((n) => (
              <div key={n.id} style={c.nota}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={c.notaTexto}>{n.texto}</div>
                  <div style={c.notaMeta}>{n.autor_nome || '—'} · {formatarData(n.created_at)}</div>
                </div>
                {(isGestorUtilizadores || n.autor_id === perfil?.id) && (
                  <button onClick={() => removerNota(n)} style={c.notaApagar} title="Apagar">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Seccao>

      {/* Atividade — timeline unificada (a joia) */}
      <Seccao titulo="Atividade">
        {timeline.length === 0 ? <Vazio texto="Sem atividade registada." /> : (
          <>
            <div style={c.filtros}>
              <button style={{ ...c.chip, ...(filtro === 'todos' ? c.chipAtivo : {}) }} onClick={() => setFiltro('todos')}>Todos ({timeline.length})</button>
              {tiposPresentes.map((t) => (
                <button key={t} style={{ ...c.chip, ...(filtro === t ? c.chipAtivo : {}) }} onClick={() => setFiltro(t)}>{TIMELINE_ICONE[t]} {TIMELINE_LABEL[t]}</button>
              ))}
            </div>
            <div style={c.lista}>
              {timelineFiltrada.map((e) => {
                const inner = (
                  <>
                    <span style={c.tlIcone}>{TIMELINE_ICONE[e.tipo]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={c.linhaPrincipal}>{e.titulo}</div>
                      <div style={c.tlDetalhe}>{TIMELINE_LABEL[e.tipo]}{e.detalhe ? ` · ${e.detalhe}` : ''}</div>
                    </div>
                    <span style={c.tlData}>{formatarData(e.data)}</span>
                  </>
                )
                return e.href ? (
                  <Link key={e.chave} href={e.href} style={{ ...c.tlItem, textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
                ) : (
                  <div key={e.chave} style={c.tlItem}>{inner}</div>
                )
              })}
            </div>
          </>
        )}
      </Seccao>
    </div>
  )
}

function Indicador({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div style={c.indicador}>
      <span style={c.indicadorTitulo}>{titulo}</span>
      <span style={{ ...c.indicadorValor, color: cor }}>{valor}</span>
    </div>
  )
}
function Seccao({ titulo, acao, children }: { titulo: string; acao?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <section style={c.seccao}>
      <div style={c.seccaoTopo}>
        <h2 style={c.seccaoTitulo}>{titulo}</h2>
        {acao && <Link href={acao.href} style={c.seccaoAcao}>{acao.label}</Link>}
      </div>
      {children}
    </section>
  )
}
function Vazio({ texto = 'Sem registos.' }: { texto?: string }) {
  return <p style={c.vazio}>{texto}</p>
}
function estadoPill(e: string): React.CSSProperties {
  if (e === 'liquidado') return { color: '#065F46', background: '#D1FAE5' }
  if (e === 'parcial') return { color: '#1E40AF', background: '#DBEAFE' }
  return { color: '#92400E', background: '#FEF3C7' }
}

const c: Record<string, React.CSSProperties> = {
  aCarregar: { color: 'var(--muted)', padding: 16, textAlign: 'center' },
  indicadores: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  indicador: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 },
  indicadorTitulo: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  indicadorValor: { fontSize: 18, fontWeight: 800 },
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  seccaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  seccaoTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  seccaoAcao: { fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 },
  miniIndics: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)', marginBottom: 10 },
  lista: { display: 'flex', flexDirection: 'column', gap: 6 },
  linha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13.5, padding: '6px 0', borderTop: '0.5px solid var(--border)', flexWrap: 'wrap' },
  linhaPrincipal: { fontWeight: 600, color: 'var(--foreground)' },
  linhaSec: { color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 },
  pill: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' },
  vazio: { color: 'var(--muted)', fontSize: 13, margin: 0 },
  notaInput: { flex: 1, minHeight: 44, padding: 10, border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  notaBtn: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  nota: { display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' },
  notaTexto: { fontSize: 14, color: 'var(--foreground)', whiteSpace: 'pre-wrap' },
  notaMeta: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  notaApagar: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 },
  filtros: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  chip: { border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--muted)', borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  chipAtivo: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  tlItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid var(--border)' },
  tlIcone: { fontSize: 16 },
  tlDetalhe: { fontSize: 12.5, color: 'var(--muted)' },
  tlData: { fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' },
}
