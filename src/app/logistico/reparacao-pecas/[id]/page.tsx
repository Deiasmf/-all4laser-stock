'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { useAuth } from '@/lib/auth'
import {
  obterReparacao, atualizarReparacao,
  listarItens, atualizarItem,
  listarMovimentos, criarMovimento,
} from '@/lib/reparacaoPecas'
import type { ReparacaoPeca, ReparacaoItem, ReparacaoMovimento } from '@/types/reparacaoPeca'
import { estadoInfo, TIPOS_GARANTIA, RESPONSAVEIS_PAGAMENTO } from '@/types/reparacaoPeca'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

const TIPO_MOV_LABEL: Record<string, string> = {
  saida: 'Saída para reparação',
  entrada: 'Entrada (devolvida)',
  substituta_enviada: 'Substituta enviada',
  avariada_recebida: 'Avariada recebida do cliente',
}

export default function ReparacaoDetalhePage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { perfil, isAdmin } = useAuth()

  const [r, setR] = useState<ReparacaoPeca | null>(null)
  const [itens, setItens] = useState<ReparacaoItem[]>([])
  const [movimentos, setMovimentos] = useState<ReparacaoMovimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // painéis de ação
  const [painel, setPainel] = useState<'entrada' | 'avariada' | null>(null)
  const [aData, setAData] = useState(hoje())
  const [aNotas, setANotas] = useState('')
  const [itemQtd, setItemQtd] = useState<Record<string, string>>({})

  // pagamento
  const [valorFinal, setValorFinal] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')

  const recarregar = useCallback(async () => {
    const rep = await obterReparacao(id)
    setR(rep)
    setValorFinal(rep?.valor_reparacao != null ? String(rep.valor_reparacao) : '')
    setItens(await listarItens(id))
    setMovimentos(await listarMovimentos(id))
    setCarregando(false)
  }, [id])

  useEffect(() => {
    // setState corre após o await, dentro de recarregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar()
  }, [recarregar])

  // QR: codifica o link para esta página
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/logistico/reparacao-pecas/${id}`
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQrDataUrl).catch(() => {})
  }, [id])

  const criador = { criado_por: perfil?.id ?? null, criado_por_nome: perfil?.nome ?? perfil?.email ?? null }

  async function acao(fn: () => Promise<void>) {
    setErro(null)
    try {
      await fn()
      setPainel(null)
      setAData(hoje())
      setANotas('')
      await recarregar()
    } catch (e) {
      setErro('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'))
    }
  }

  async function registarEntrada() {
    await acao(async () => {
      await atualizarReparacao(id, { status: 'reparada', data_entrada: aData || hoje() })
      await criarMovimento({ reparacao_id: id, tipo: 'entrada', data: aData || hoje(), sn: r?.sn_avariado ?? null, notas: aNotas || null, ...criador })
    })
  }

  async function marcarNaoReparavel() {
    if (!confirm('Marcar esta reparação como Não Reparável?')) return
    await acao(async () => {
      await atualizarReparacao(id, { status: 'nao_reparavel', data_entrada: hoje() })
      await criarMovimento({ reparacao_id: id, tipo: 'entrada', data: hoje(), notas: 'Não reparável', ...criador })
    })
  }

  async function registarSubstituta() {
    if (!confirm('Registar o envio de peça substituta em avanço?')) return
    await acao(async () => {
      await atualizarReparacao(id, { substituta_enviada: true })
      await criarMovimento({ reparacao_id: id, tipo: 'substituta_enviada', data: hoje(), sn: r?.substituta_sn ?? null, ...criador })
    })
  }

  async function registarAvariadaRecebida() {
    await acao(async () => {
      await atualizarReparacao(id, { cliente_enviou_avariada: true, data_cliente_enviou: aData || hoje() })
      await criarMovimento({ reparacao_id: id, tipo: 'avariada_recebida', data: aData || hoje(), notas: aNotas || null, ...criador })
    })
  }

  async function receberItem(item: ReparacaoItem) {
    const voltou = Number(itemQtd[item.id] || '0')
    if (!voltou || voltou <= 0) return
    await acao(async () => {
      const novaEntrada = Math.min(item.quantidade_saida, item.quantidade_entrada + voltou)
      const completo = novaEntrada >= item.quantidade_saida
      await atualizarItem(item.id, { quantidade_entrada: novaEntrada, estado: completo ? 'reparada' : 'em_reparacao' })
      await criarMovimento({ reparacao_id: id, tipo: 'entrada', data: hoje(), quantidade: voltou, notas: item.descricao, ...criador })
      setItemQtd((m) => ({ ...m, [item.id]: '' }))
      // Se todos os itens ficarem completos, fecha a reparação
      const restantes = itens.filter((it) => it.id !== item.id && it.quantidade_entrada < it.quantidade_saida)
      if (completo && restantes.length === 0) {
        await atualizarReparacao(id, { status: 'reparada', data_entrada: hoje() })
      }
    })
  }

  async function guardarPagamento(patch: Partial<ReparacaoPeca>) {
    await acao(async () => { await atualizarReparacao(id, patch) })
  }

  function imprimirQr() {
    if (!qrDataUrl || !r) return
    const w = window.open('', '_blank', 'width=400,height=500')
    if (!w) return
    w.document.write(`<html><head><title>${r.numero ?? 'QR'}</title></head><body style="text-align:center;font-family:sans-serif;padding:20px">
      <img src="${qrDataUrl}" style="width:280px;height:280px" />
      <div style="font-size:18px;font-weight:700;margin-top:8px">${r.numero ?? ''}</div>
      <div style="color:#555">${(r.peca ?? '').replace(/</g, '')}</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`)
    w.document.close()
  }

  if (carregando) return <main style={c.page}><p style={c.nota}>A carregar...</p></main>
  if (!r) return (
    <main style={c.page}>
      <div style={c.cabecalho}><h1 style={c.titulo}>Reparação</h1><Link href="/logistico/reparacao-pecas" style={c.voltar}>← Voltar</Link></div>
      <p style={c.nota}>Registo não encontrado.</p>
    </main>
  )

  const semSn = r.tem_sn === false && itens.length > 0
  const estado = estadoInfo(r.status)
  const aguardaAvariada = r.tipo_dono === 'cliente' && r.substituta_enviada && !r.cliente_enviou_avariada
  const emReparacao = r.status === 'em_reparacao'
  const garantiaLabel = r.tipo_garantia ? TIPOS_GARANTIA.find((t) => t.valor === r.tipo_garantia)?.label : r.garantia
  const respLabel = r.responsavel_pagamento ? RESPONSAVEIS_PAGAMENTO.find((x) => x.valor === r.responsavel_pagamento)?.label : null

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{r.numero || 'Reparação'}</h1>
          <div style={c.sub}>{r.peca || '—'}</div>
        </div>
        <Link href="/logistico/reparacao-pecas" style={c.voltar}>← Voltar</Link>
      </div>

      {erro && <div style={c.erro}>{erro}</div>}

      <div style={c.badgeRow}>
        {estado && <span style={{ ...c.badge, background: estado.cor }}>{estado.label}</span>}
        {!estado && r.status && <span style={{ ...c.badge, background: '#6B7280' }}>{r.status}</span>}
        <span style={c.tagDono}>{r.tipo_dono === 'cliente' ? `Cliente: ${r.cliente_nome || '—'}` : 'Peça Nossa'}</span>
      </div>

      {aguardaAvariada && (
        <div style={c.bannerAviso}>⚠️ Aguarda envio da peça avariada pelo cliente.</div>
      )}

      {/* Dados */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Dados</div>
        <Linha k="Fornecedor" v={r.fornecedor} />
        <Linha k="Peça" v={r.peca} />
        {r.tem_sn && <Linha k="SN avariado" v={r.sn_avariado || r.serial_number} />}
        <Linha k="SN do equipamento" v={r.equipamento_sn} />
        <Linha k="Avaria" v={r.avaria} />
        <Linha k="Garantia" v={garantiaLabel} />
        <Linha k="Data de saída" v={r.data_saida} />
        <Linha k="Data de entrada" v={r.data_entrada} />
        {r.tipo_dono === 'cliente' && r.substituta_enviada && (
          <>
            <Linha k="Substituta enviada" v={r.substituta_sn ? `SN ${r.substituta_sn}` : 'Sim'} />
            <Linha k="Avariada recebida" v={r.cliente_enviou_avariada ? (r.data_cliente_enviou || 'Sim') : 'Não'} />
          </>
        )}
        {r.notas && <Linha k="Notas" v={r.notas} />}
        {r.observacoes && <Linha k="Observações" v={r.observacoes} />}
      </section>

      {/* Itens sem SN */}
      {semSn && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Itens ({itens.length})</div>
          {itens.map((it) => {
            const itEstado = estadoInfo(it.estado)
            return (
              <div key={it.id} style={c.itemRow}>
                <div style={{ minWidth: 0 }}>
                  <strong>{it.descricao}</strong>
                  <div style={c.nota}>Voltaram {it.quantidade_entrada} de {it.quantidade_saida}</div>
                </div>
                <div style={c.itemDir}>
                  {itEstado && <span style={{ ...c.badgeMini, background: itEstado.cor }}>{itEstado.label}</span>}
                  {isAdmin && emReparacao && it.quantidade_entrada < it.quantidade_saida && (
                    <div style={c.itemAcao}>
                      <input style={c.inputMini} type="number" min={1} placeholder="Qtd" value={itemQtd[it.id] ?? ''} onChange={(e) => setItemQtd((m) => ({ ...m, [it.id]: e.target.value }))} />
                      <button style={c.btnMini} onClick={() => receberItem(it)}>Registar</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Ações */}
      {isAdmin && (emReparacao || aguardaAvariada) && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Ações</div>

          {emReparacao && !semSn && (
            painel === 'entrada' ? (
              <div style={c.painel}>
                <label style={c.label}>Data de entrada</label>
                <input style={c.input} type="date" value={aData} onChange={(e) => setAData(e.target.value)} />
                <label style={c.label}>Notas</label>
                <input style={c.input} value={aNotas} onChange={(e) => setANotas(e.target.value)} />
                <div style={c.painelBtns}>
                  <button style={c.btnGhost} onClick={() => setPainel(null)}>Cancelar</button>
                  <button style={c.btnPrimario} onClick={registarEntrada}>Confirmar entrada</button>
                </div>
              </div>
            ) : (
              <button style={c.btnPrimario} onClick={() => setPainel('entrada')}>Registar Entrada</button>
            )
          )}

          {emReparacao && (
            <button style={c.btnDanger} onClick={marcarNaoReparavel}>Marcar como Não Reparável</button>
          )}

          {emReparacao && r.tipo_dono === 'cliente' && !r.substituta_enviada && (
            <button style={c.btnGhost} onClick={registarSubstituta}>Registar envio de substituta</button>
          )}

          {aguardaAvariada && (
            painel === 'avariada' ? (
              <div style={c.painel}>
                <label style={c.label}>Data de receção</label>
                <input style={c.input} type="date" value={aData} onChange={(e) => setAData(e.target.value)} />
                <label style={c.label}>Notas</label>
                <input style={c.input} value={aNotas} onChange={(e) => setANotas(e.target.value)} />
                <div style={c.painelBtns}>
                  <button style={c.btnGhost} onClick={() => setPainel(null)}>Cancelar</button>
                  <button style={c.btnPrimario} onClick={registarAvariadaRecebida}>Confirmar receção</button>
                </div>
              </div>
            ) : (
              <button style={c.btnPrimario} onClick={() => setPainel('avariada')}>Registar receção da peça avariada do cliente</button>
            )
          )}
        </section>
      )}

      {/* Pagamento */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Pagamento</div>
        <Linha k="Responsável" v={respLabel} />
        <label style={c.label}>Valor final de reparação (€)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...c.input, flex: 1 }} type="number" inputMode="decimal" step="0.01" value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} disabled={!isAdmin} />
          {isAdmin && (
            <button style={c.btnGhost} onClick={() => guardarPagamento({ valor_reparacao: valorFinal.trim() ? Number(valorFinal) : null })}>Guardar</button>
          )}
        </div>
        {r.responsavel_pagamento === 'cliente' && (
          <label style={c.check}>
            <input type="checkbox" checked={!!r.faturado_cliente} disabled={!isAdmin} onChange={(e) => guardarPagamento({ faturado_cliente: e.target.checked })} />
            Faturado ao cliente
          </label>
        )}
      </section>

      {/* Movimentos */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Histórico de movimentos</div>
        {movimentos.length === 0 ? (
          <p style={c.nota}>Sem movimentos.</p>
        ) : (
          <div style={c.timeline}>
            {movimentos.map((m) => (
              <div key={m.id} style={c.mov}>
                <span style={c.movData}>{m.data}</span>
                <span style={c.movCorpo}>
                  <strong>{TIPO_MOV_LABEL[m.tipo ?? ''] ?? m.tipo}</strong>
                  {m.quantidade && m.quantidade !== 1 ? ` · ${m.quantidade} un` : ''}
                  {m.sn ? ` · S/N ${m.sn}` : ''}
                  {m.notas ? ` · ${m.notas}` : ''}
                  {m.criado_por_nome ? <span style={c.nota}> — {m.criado_por_nome}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* QR Code */}
      <section style={c.card}>
        <div style={c.cardTitulo}>QR Code</div>
        {qrDataUrl ? (
          <div style={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200 }} />
            <div style={c.nota}>{r.numero}</div>
            <button style={{ ...c.btnGhost, marginTop: 8 }} onClick={imprimirQr}>🖨 Imprimir QR</button>
          </div>
        ) : (
          <p style={c.nota}>A gerar QR...</p>
        )}
      </section>
    </main>
  )
}

function Linha({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null
  return (
    <div style={c.linha}>
      <span style={c.linhaK}>{k}</span>
      <span style={c.linhaV}>{v}</span>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 2 },
  voltar: { color: 'var(--muted)', textDecoration: 'none', whiteSpace: 'nowrap' },
  badgeRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  badge: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 12px', color: '#fff' },
  badgeMini: { fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', color: '#fff' },
  tagDono: { fontSize: 13, color: 'var(--muted)' },
  bannerAviso: { background: '#fff8e1', border: '1px solid #f0c884', color: '#8a5a00', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontWeight: 600, fontSize: 14 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitulo: { fontWeight: 700, color: 'var(--primary)', marginBottom: 10 },
  linha: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '5px 0', fontSize: 14, borderBottom: '1px solid #f6f6f6' },
  linhaK: { color: 'var(--muted)' },
  linhaV: { fontWeight: 500 },
  itemRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid #f2f2f2', alignItems: 'center' },
  itemDir: { display: 'flex', alignItems: 'center', gap: 8 },
  itemAcao: { display: 'flex', gap: 6, alignItems: 'center' },
  inputMini: { width: 64, padding: 6, border: '1px solid #ccc', borderRadius: 6, fontSize: 14 },
  btnMini: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  painel: { display: 'flex', flexDirection: 'column', gap: 4, background: '#fafafa', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8 },
  painelBtns: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  label: { fontWeight: 600, fontSize: 13, marginTop: 8, marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  check: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  timeline: { display: 'flex', flexDirection: 'column', gap: 8 },
  mov: { display: 'grid', gridTemplateColumns: '92px 1fr', gap: 8, fontSize: 13.5, paddingBottom: 8, borderBottom: '1px solid #f6f6f6' },
  movData: { color: 'var(--muted)' },
  movCorpo: { minWidth: 0 },
  nota: { fontSize: 13, color: 'var(--muted)' },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 12, color: '#c62828' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  btnGhost: { background: '#fff', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  btnDanger: { background: '#fff', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', marginTop: 8, marginLeft: 8 },
}
