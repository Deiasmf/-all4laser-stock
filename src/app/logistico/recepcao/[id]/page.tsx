'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  obterProcesso, listarMovimentosProcesso, listarItensProcesso,
  criarMovimentoProcesso, atualizarMovimentoProcesso, alterarEstadoProcesso, atualizarProcesso,
  eliminarProcesso, entrarAvariadaNoStock, devolverCortesiaAoStock,
} from '@/lib/processosPecas'
import { listarFornecedoresReparacao } from '@/lib/reparacaoPecas'
import type { FornecedorReparacao } from '@/types/reparacaoPeca'
import {
  ESTADOS, TIPOS_GARANTIA, RESPONSAVEIS_PAGAMENTO,
  estadoInfo, fluxoInfo, movimentoInfo, accoesProcesso, formatarEuro,
  type ProcessoPeca, type ProcessoMovimento, type ProcessoItem, type Accao,
  type TipoGarantia, type ResponsavelPagamento,
} from '@/types/processoPeca'

const hoje = () => new Date().toISOString().slice(0, 10)

export default function DetalheProcessoPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const { isAdmin, perfil } = useAuth()

  const [processo, setProcesso] = useState<ProcessoPeca | null>(null)
  const [movimentos, setMovimentos] = useState<ProcessoMovimento[]>([])
  const [itens, setItens] = useState<ProcessoItem[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorReparacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Form da ação selecionada
  const [accaoAberta, setAccaoAberta] = useState<Accao | null>(null)
  const [fData, setFData] = useState(hoje())
  const [fQtd, setFQtd] = useState('1')
  const [fSn, setFSn] = useState('')
  const [fFornecedorId, setFFornecedorId] = useState('')
  const [fNotas, setFNotas] = useState('')

  // Edição de processo
  const [editar, setEditar] = useState(false)
  // Edição de movimento
  const [movEdit, setMovEdit] = useState<ProcessoMovimento | null>(null)

  const criadoNome = perfil?.nome ?? perfil?.email ?? null

  const recarregar = useCallback(async () => {
    const p = await obterProcesso(id)
    setProcesso(p)
    setMovimentos(await listarMovimentosProcesso(id))
    setItens(await listarItensProcesso(id))
    setCarregando(false)
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => { listarFornecedoresReparacao().then(setFornecedores) }, [])

  function abrirAccao(a: Accao) {
    setMsg(null)
    setAccaoAberta(a)
    // Ao registar a receção da avariada, pré-preenche com a data indicada na criação.
    setFData((a.movimento === 'cliente_enviou_avariada' && processo?.data_rececao_avariada) ? processo.data_rececao_avariada : hoje())
    setFQtd('1')
    setFSn(a.pedeSn ? (processo?.sn_avariado ?? processo?.sn_substituto ?? '') : '')
    setFFornecedorId(processo?.fornecedor_reparacao_id ?? '')
    setFNotas('')
  }

  async function confirmarAccao() {
    if (!processo || !accaoAberta) return
    const a = accaoAberta
    setATrabalhar(true); setMsg(null)
    try {
      const quantidade = a.pedeItens ? Math.max(1, Number(fQtd) || 1) : 1
      const forn = a.pedeFornecedor ? fornecedores.find((x) => x.id === fFornecedorId) : null

      // Movimento
      await criarMovimentoProcesso(id, {
        tipo: a.movimento,
        data_movimento: fData || hoje(),
        quantidade,
        sn: a.pedeSn ? (fSn.trim() || null) : null,
        destino: forn?.nome ?? null,
        notas: fNotas.trim() || null,
      }, perfil?.id ?? null, criadoNome)

      // Ligar fornecedor de reparação ao processo
      if (a.pedeFornecedor && forn) {
        await atualizarProcesso(id, { fornecedor_reparacao_id: forn.id, fornecedor_reparacao_nome: forn.nome })
      }

      // Efeitos no stock
      if (a.efeitoStock === 'avariada') {
        await entrarAvariadaNoStock(processo, {
          descricao: processo.peca_descricao,
          sn: a.pedeSn ? (fSn.trim() || processo.sn_avariado) : processo.sn_avariado,
          quantidade,
        }, criadoNome)
        // Regista também o movimento "entrou_no_stock"
        await criarMovimentoProcesso(id, { tipo: 'entrou_no_stock', data_movimento: fData || hoje(), quantidade, notas: 'Peça avariada a aguardar reparação.' }, perfil?.id ?? null, criadoNome)
      }
      if (a.efeitoStock === 'cortesia') {
        await devolverCortesiaAoStock(processo, { quantidade })
        await criarMovimentoProcesso(id, { tipo: 'entrou_no_stock', data_movimento: fData || hoje(), quantidade, notas: 'Cortesia devolvida ao stock.' }, perfil?.id ?? null, criadoNome)
      }

      // Estado
      await alterarEstadoProcesso(id, a.estadoDestino)
      setAccaoAberta(null)
      await recarregar()
    } catch (e) {
      setMsg('Erro: ' + (e instanceof Error ? e.message : 'desconhecido'))
    } finally {
      setATrabalhar(false)
    }
  }

  async function guardarFaturacao(patch: Partial<ProcessoPeca>) {
    setATrabalhar(true)
    await atualizarProcesso(id, patch)
    await recarregar()
    setATrabalhar(false)
  }

  async function cancelar() {
    if (!confirm('Cancelar este processo?')) return
    setATrabalhar(true)
    await alterarEstadoProcesso(id, 'cancelado')
    await recarregar()
    setATrabalhar(false)
  }

  async function apagar() {
    if (!confirm('Apagar este processo? Remove o processo e todos os movimentos.\n\nEsta ação não pode ser revertida.')) return
    setATrabalhar(true)
    const { error } = await eliminarProcesso(id)
    if (error) { setMsg('Não foi possível apagar: ' + error.message); setATrabalhar(false); return }
    router.push('/logistico/recepcao')
  }

  if (carregando) return <main style={c.page}><p style={c.muted}>A carregar...</p></main>
  if (!processo) return <main style={c.page}><p style={c.muted}>Processo não encontrado.</p></main>

  const i = estadoInfo(processo.estado)
  const fl = fluxoInfo(processo.tipo_fluxo)
  const accoes = accoesProcesso(processo)
  const podeEnviarPago = processo.pago || processo.em_garantia
  const mostraFaturacao = processo.tipo_fluxo === 'cortesia_reparacao_externa' && processo.estado === 'aguarda_pagamento'

  return (
    <main style={c.page}>
      <div style={c.cabecalho}>
        <div>
          <h1 style={c.titulo}>{processo.numero ?? 'Processo'}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...c.badge, color: i.cor, background: i.bg }}>{i.label}</span>
            <span style={c.muted}>{fl.icon} {fl.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/logistico/recepcao/scan" style={c.btnScan}>📷 Scan QR</Link>
          {isAdmin && <button style={c.btnApagar} disabled={aTrabalhar} onClick={apagar}>🗑 Apagar</button>}
          <Link href="/logistico/recepcao" style={c.voltar}>← Processos</Link>
        </div>
      </div>

      {msg && <div style={c.aviso}>{msg}</div>}

      {/* Dados */}
      <section style={c.card}>
        <div style={c.cardCabecalho}>
          <div style={c.cardTitulo}>Dados do processo</div>
          <button style={c.btnMini} onClick={() => setEditar(true)}>✏️ Editar</button>
        </div>
        <Linha rotulo="Cliente" valor={processo.cliente_nome} />
        <Linha rotulo="Peça" valor={`${processo.peca_descricao}${processo.sn_avariado ? ` · S/N avariado ${processo.sn_avariado}` : ''}`} />
        {processo.data_rececao_avariada && <Linha rotulo="Receção da avariada" valor={processo.data_rececao_avariada} />}
        {processo.sn_substituto && <Linha rotulo="S/N substituta" valor={processo.sn_substituto} />}
        {processo.equipamento_sn && <Linha rotulo="Equipamento" valor={processo.equipamento_sn} />}
        <Linha rotulo="Garantia" valor={processo.em_garantia ? `Sim · ${TIPOS_GARANTIA.find((g) => g.valor === processo.tipo_garantia)?.label ?? ''}` : 'Não'} />
        {!processo.em_garantia && <Linha rotulo="Responsável pagamento" valor={RESPONSAVEIS_PAGAMENTO.find((r) => r.valor === processo.responsavel_pagamento)?.label} />}
        {processo.fornecedor_reparacao_nome && <Linha rotulo="Fornecedor reparação" valor={processo.fornecedor_reparacao_nome} />}
        {processo.notas && <Linha rotulo="Notas" valor={processo.notas} />}
      </section>

      {/* Timeline */}
      <section style={c.card}>
        <div style={c.cardTitulo}>Movimentos</div>
        {movimentos.length === 0 ? <p style={c.muted}>Ainda sem movimentos.</p> : (
          <div style={c.timeline}>
            {movimentos.map((m) => {
              const mi = movimentoInfo(m.tipo)
              const cor = mi.direcao === 'entrada' ? '#159a4a' : mi.direcao === 'saida' ? '#c62828' : '#6b7280'
              return (
                <div key={m.id} style={c.tlItem}>
                  <div style={{ ...c.tlIcon, background: cor }}>{mi.icon}</div>
                  <div style={c.tlCorpo}>
                    <div style={c.tlTopo}>
                      <strong>{mi.label}</strong>
                      <span style={c.muted}>{m.data_movimento}</span>
                      <button style={c.btnMini} onClick={() => setMovEdit(m)}>✏️</button>
                    </div>
                    <div style={c.muted}>
                      {m.quantidade && m.quantidade !== 1 ? `Qtd ${m.quantidade} · ` : ''}
                      {m.sn ? `S/N ${m.sn} · ` : ''}
                      {m.destino ? `→ ${m.destino} · ` : ''}
                      {m.criado_por_nome ?? ''}
                    </div>
                    {m.notas && <div style={c.tlNotas}>{m.notas}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Faturação (Caso 1) */}
      {mostraFaturacao && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Faturação</div>
          {processo.em_garantia ? (
            <p style={c.muted}>Em garantia — sem faturação.</p>
          ) : (
            <>
              <div style={c.grid2}>
                <Campo rotulo="Valor a faturar (€)">
                  <input type="number" step="0.01" defaultValue={processo.valor_a_faturar ?? ''} onBlur={(e) => guardarFaturacao({ valor_a_faturar: e.target.value === '' ? null : Number(e.target.value) })} style={c.input} />
                </Campo>
              </div>
              <label style={c.checkLinha}>
                <input type="checkbox" checked={processo.faturado} onChange={(e) => guardarFaturacao({ faturado: e.target.checked })} />
                <span>Faturado</span>
              </label>
              <label style={c.checkLinha}>
                <input type="checkbox" checked={processo.pago} onChange={(e) => guardarFaturacao({ pago: e.target.checked, data_pagamento: e.target.checked ? hoje() : null })} />
                <span>Pago</span>
              </label>
              {processo.pago && (
                <Campo rotulo="Data de pagamento">
                  <input type="date" defaultValue={processo.data_pagamento ?? hoje()} onBlur={(e) => guardarFaturacao({ data_pagamento: e.target.value || hoje() })} style={{ ...c.input, maxWidth: 200 }} />
                </Campo>
              )}
            </>
          )}
        </section>
      )}

      {/* Ações dinâmicas */}
      {accoes.length > 0 && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Próximos passos</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {accoes.map((a) => {
              const bloqueado = a.requerPago && !podeEnviarPago
              return (
                <button key={a.id} style={{ ...c.btnAccao, ...(bloqueado ? c.btnDisabled : {}) }} disabled={bloqueado || aTrabalhar} onClick={() => abrirAccao(a)} title={bloqueado ? 'Marca como pago primeiro' : ''}>
                  {a.icon} {a.label}
                </button>
              )
            })}
          </div>
          {accoes.some((a) => a.requerPago) && !podeEnviarPago && <p style={c.ajuda}>Marca a faturação como paga para poder enviar ao cliente.</p>}
        </section>
      )}

      {/* Saldo de itens sem SN */}
      {itens.length > 0 && (
        <section style={c.card}>
          <div style={c.cardTitulo}>Itens (sem S/N)</div>
          <div style={c.tabelaItens}>
            <div style={{ ...c.itemLinha, ...c.itemCab }}>
              <span>Descrição</span><span style={{ textAlign: 'center' }}>Total</span><span style={{ textAlign: 'center' }}>Recebido</span><span style={{ textAlign: 'center' }}>Pendente</span>
            </div>
            {itens.map((it) => (
              <div key={it.id} style={c.itemLinha}>
                <span>{it.descricao}</span>
                <span style={{ textAlign: 'center' }}>{it.quantidade_total}</span>
                <span style={{ textAlign: 'center' }}>{it.quantidade_recebida}</span>
                <span style={{ textAlign: 'center', fontWeight: 700, color: it.quantidade_pendente > 0 ? '#991B1B' : '#065F46' }}>{it.quantidade_pendente}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {processo.estado !== 'fechado' && processo.estado !== 'cancelado' && (
        <div><button style={c.btnGhost} disabled={aTrabalhar} onClick={cancelar}>Cancelar processo</button></div>
      )}

      {/* Modal ação */}
      {accaoAberta && (
        <Modal titulo={accaoAberta.label} onFechar={() => setAccaoAberta(null)}>
          {accaoAberta.nota && <div style={c.aviso}>{accaoAberta.nota}</div>}
          <Campo rotulo="Data"><input type="date" value={fData} onChange={(e) => setFData(e.target.value)} style={c.input} /></Campo>
          {accaoAberta.pedeItens && <Campo rotulo="Quantidade"><input type="number" min={1} value={fQtd} onChange={(e) => setFQtd(e.target.value)} style={c.input} /></Campo>}
          {accaoAberta.pedeSn && <Campo rotulo="Serial Number"><input value={fSn} onChange={(e) => setFSn(e.target.value)} style={c.input} placeholder="S/N..." /></Campo>}
          {accaoAberta.pedeFornecedor && (
            <Campo rotulo="Fornecedor de reparação">
              <select value={fFornecedorId} onChange={(e) => setFFornecedorId(e.target.value)} style={c.input}>
                <option value="">— escolher —</option>
                {fornecedores.map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Notas"><textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} style={c.textarea} /></Campo>
          <div style={c.modalBotoes}>
            <button style={c.btnGhost} onClick={() => setAccaoAberta(null)}>Cancelar</button>
            <button style={c.btnPrimario} disabled={aTrabalhar} onClick={confirmarAccao}>{aTrabalhar ? 'A gravar...' : 'Confirmar'}</button>
          </div>
        </Modal>
      )}

      {/* Modal editar processo */}
      {editar && (
        <EditarProcessoModal
          processo={processo}
          fornecedores={fornecedores}
          aTrabalhar={aTrabalhar}
          onFechar={() => setEditar(false)}
          onGuardar={async (patch) => { setEditar(false); await guardarFaturacao(patch) }}
        />
      )}

      {/* Modal editar movimento */}
      {movEdit && (
        <Modal titulo="Editar movimento" onFechar={() => setMovEdit(null)}>
          <Campo rotulo="Data"><input type="date" defaultValue={movEdit.data_movimento} onChange={(e) => setMovEdit({ ...movEdit, data_movimento: e.target.value })} style={c.input} /></Campo>
          <Campo rotulo="Quantidade"><input type="number" min={1} defaultValue={movEdit.quantidade} onChange={(e) => setMovEdit({ ...movEdit, quantidade: Number(e.target.value) || 1 })} style={c.input} /></Campo>
          <Campo rotulo="Notas"><textarea defaultValue={movEdit.notas ?? ''} onChange={(e) => setMovEdit({ ...movEdit, notas: e.target.value })} style={c.textarea} /></Campo>
          <div style={c.modalBotoes}>
            <button style={c.btnGhost} onClick={() => setMovEdit(null)}>Cancelar</button>
            <button style={c.btnPrimario} disabled={aTrabalhar} onClick={async () => {
              setATrabalhar(true)
              await atualizarMovimentoProcesso(movEdit.id, { data_movimento: movEdit.data_movimento, quantidade: movEdit.quantidade, notas: movEdit.notas })
              setMovEdit(null); await recarregar(); setATrabalhar(false)
            }}>Guardar</button>
          </div>
        </Modal>
      )}
    </main>
  )
}

function EditarProcessoModal({ processo, fornecedores, aTrabalhar, onFechar, onGuardar }: {
  processo: ProcessoPeca
  fornecedores: FornecedorReparacao[]
  aTrabalhar: boolean
  onFechar: () => void
  onGuardar: (patch: Partial<ProcessoPeca>) => void
}) {
  const [clienteNome, setClienteNome] = useState(processo.cliente_nome)
  const [pecaDescricao, setPecaDescricao] = useState(processo.peca_descricao)
  const [emGarantia, setEmGarantia] = useState(processo.em_garantia)
  const [tipoGarantia, setTipoGarantia] = useState<TipoGarantia>(processo.tipo_garantia ?? 'sem_garantia')
  const [responsavel, setResponsavel] = useState<ResponsavelPagamento>(processo.responsavel_pagamento ?? 'cliente')
  const [fornId, setFornId] = useState(processo.fornecedor_reparacao_id ?? '')
  const [notas, setNotas] = useState(processo.notas ?? '')
  return (
    <Modal titulo="Editar dados do processo" onFechar={onFechar}>
      <Campo rotulo="Cliente"><input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} style={c.input} /></Campo>
      <Campo rotulo="Peça"><input value={pecaDescricao} onChange={(e) => setPecaDescricao(e.target.value)} style={c.input} /></Campo>
      <label style={c.checkLinha}><input type="checkbox" checked={emGarantia} onChange={(e) => setEmGarantia(e.target.checked)} /><span>Em garantia</span></label>
      <Campo rotulo="Tipo de garantia">
        <select value={tipoGarantia} onChange={(e) => setTipoGarantia(e.target.value as TipoGarantia)} style={c.input}>
          {TIPOS_GARANTIA.map((g) => <option key={g.valor} value={g.valor}>{g.label}</option>)}
        </select>
      </Campo>
      {!emGarantia && (
        <Campo rotulo="Responsável pagamento">
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value as ResponsavelPagamento)} style={c.input}>
            {RESPONSAVEIS_PAGAMENTO.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Fornecedor de reparação">
        <select value={fornId} onChange={(e) => setFornId(e.target.value)} style={c.input}>
          <option value="">— nenhum —</option>
          {fornecedores.map((fo) => <option key={fo.id} value={fo.id}>{fo.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Notas"><textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={c.textarea} /></Campo>
      <div style={c.modalBotoes}>
        <button style={c.btnGhost} onClick={onFechar}>Cancelar</button>
        <button style={c.btnPrimario} disabled={aTrabalhar} onClick={() => onGuardar({
          cliente_nome: clienteNome.trim(),
          peca_descricao: pecaDescricao.trim(),
          em_garantia: emGarantia,
          tipo_garantia: tipoGarantia,
          responsavel_pagamento: emGarantia ? null : responsavel,
          fornecedor_reparacao_id: fornId || null,
          fornecedor_reparacao_nome: fornecedores.find((x) => x.id === fornId)?.nome ?? null,
          notas: notas.trim() || null,
        })}>Guardar</button>
      </div>
    </Modal>
  )
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div style={c.overlay} onClick={onFechar}>
      <div style={c.modal} onClick={(e) => e.stopPropagation()}>
        <div style={c.modalCab}><h2 style={c.modalTitulo}>{titulo}</h2><button style={c.fechar} onClick={onFechar}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return <div style={c.linhaInfo}><span style={c.linhaRotulo}>{rotulo}</span><span style={{ whiteSpace: 'pre-wrap' }}>{valor || '—'}</span></div>
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label style={c.campo}><span style={c.rotulo}>{rotulo}</span>{children}</label>
}

const c: Record<string, React.CSSProperties> = {
  page: { maxWidth: 780, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  btnScan: { background: '#1b1b2e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', fontSize: 13 },
  btnApagar: { background: 'transparent', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  card: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardCabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 },
  linhaInfo: { display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8, fontSize: 14 },
  linhaRotulo: { color: 'var(--muted)', fontWeight: 600 },
  badge: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  muted: { color: 'var(--muted)', fontSize: 13.5 },
  ajuda: { color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' },
  aviso: { background: '#fff8e6', border: '1px solid #e6c34a', borderRadius: 8, padding: '10px 12px', fontSize: 14 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 12 },
  tlItem: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  tlIcon: { width: 30, height: 30, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 },
  tlCorpo: { flex: 1, minWidth: 0 },
  tlTopo: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  tlNotas: { fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnAccao: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  btnMini: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.7 },
  tabelaItens: { border: '1px solid var(--border)', borderRadius: 8, padding: 6 },
  itemLinha: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '6px', alignItems: 'center', fontSize: 14, borderBottom: '1px solid #f2f2f2' },
  itemCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 1000, overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460, margin: '24px auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' },
  modalCab: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitulo: { fontSize: 18, fontWeight: 700, color: 'var(--primary)' },
  fechar: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)' },
  modalBotoes: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 },
}
