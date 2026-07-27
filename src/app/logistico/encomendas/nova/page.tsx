'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { PAISES } from '@/lib/paises'
import {
  criarEnvio, listarClientesEnvio, criarClienteEnvio, pesquisarMaterial, listarFuncionarios,
  listarFornecedoresEnvio,
  type ClienteEnvioOpc, type MaterialOpc, type FuncionarioOpc, type FornecedorEnvioOpc,
} from '@/lib/enviosPecas'
import { criarRececao, pesquisarDocumentos, type RefDocOpc } from '@/lib/rececoesPecas'
import { seriaisEmAberto } from '@/lib/serialPecas'
import { pesquisarEquipamentos, type EquipOpc } from '@/lib/folhasObra'
import {
  formatarEuro, calcularIva, MOTIVOS_ENVIO, motivoInfo, type DestinatarioTipo, type MotivoEnvio,
} from '@/types/envioPecas'
import { MOTIVOS_RECECAO, type MotivoRececao, type RefDocTipo } from '@/types/rececaoPecas'

type Modo = 'envio' | 'rececao'
type Item = { peca_id: string | null; peca_nome: string; serial_number: string | null; quantidade: number; preco_unitario: number }
const num = (s: string) => (s.trim() === '' ? null : Number(s))

export default function NovaEncomendaPage() {
  const router = useRouter()
  const { perfil } = useAuth()

  const [modo, setModo] = useState<Modo>('envio')

  // Contraparte (destinatário do envio / origem da receção)
  const [contraparteTipo, setContraparteTipo] = useState<DestinatarioTipo>('cliente')
  const [clientes, setClientes] = useState<ClienteEnvioOpc[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [pais, setPais] = useState('')
  const [fornecedores, setFornecedores] = useState<FornecedorEnvioOpc[]>([])
  const [fornecedorId, setFornecedorId] = useState<string | null>(null)
  const [fornecedorNome, setFornecedorNome] = useState('')

  const [funcionarios, setFuncionarios] = useState<FuncionarioOpc[]>([])
  const [responsavelId, setResponsavelId] = useState('')

  // Itens (partilhado)
  const [itens, setItens] = useState<Item[]>([])
  const [manualNome, setManualNome] = useState('')
  const [manualPreco, setManualPreco] = useState('')

  const [notas, setNotas] = useState('')

  // S/N enviados a esta entidade ainda por receber (sugestões na receção).
  const [snAbertos, setSnAbertos] = useState<{ serial_number: string; peca_nome: string | null; envio: string | null }[]>([])

  // Envio
  const [motivoEnvio, setMotivoEnvio] = useState<MotivoEnvio>('venda')
  const [faturavel, setFaturavel] = useState(true)
  const [moradaEnvio, setMoradaEnvio] = useState('')
  const [valorFaturar, setValorFaturar] = useState('')
  const [ivaOpcao, setIvaOpcao] = useState<'23' | '6' | 'isento'>('23')

  // Receção
  const [motivoRececao, setMotivoRececao] = useState<MotivoRececao>('reparacao')
  const [equipSn, setEquipSn] = useState('')
  const [equipId, setEquipId] = useState<string | null>(null)
  const [refNumero, setRefNumero] = useState('')
  const [refTipo, setRefTipo] = useState<RefDocTipo>('manual')
  const [refId, setRefId] = useState<string | null>(null)

  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesEnvio().then(setClientes) }, [])
  useEffect(() => { listarFornecedoresEnvio().then(setFornecedores) }, [])
  useEffect(() => { listarFuncionarios().then(setFuncionarios) }, [])

  // Ao rececionar de uma entidade, sugerir os S/N que lhe enviámos e ainda não voltaram.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (modo !== 'rececao') { setSnAbertos([]); return }
    const id = contraparteTipo === 'cliente' ? clienteId : fornecedorId
    const nome = (contraparteTipo === 'cliente' ? clienteNome : fornecedorNome).trim()
    if (!id && !nome) { setSnAbertos([]); return }
    let vivo = true
    seriaisEmAberto(contraparteTipo, id, nome || null).then((r) => { if (vivo) setSnAbertos(r) })
    return () => { vivo = false }
  }, [modo, contraparteTipo, clienteId, fornecedorId, clienteNome, fornecedorNome])

  const semCusto = motivoInfo(motivoEnvio).semCusto
  function escolherMotivoEnvio(m: MotivoEnvio) { setMotivoEnvio(m); setFaturavel(!motivoInfo(m).semCusto) }

  const totalItens = useMemo(() => itens.reduce((a, i) => a + i.quantidade * i.preco_unitario, 0), [itens])

  const buscarCliente = useCallback(async (q: string): Promise<ClienteEnvioOpc[]> => {
    const t = q.trim().toLowerCase()
    return (t ? clientes.filter((c) => c.nome.toLowerCase().includes(t)) : clientes).slice(0, 50)
  }, [clientes])
  const buscarFornecedor = useCallback(async (q: string): Promise<FornecedorEnvioOpc[]> => {
    const t = q.trim().toLowerCase()
    return (t ? fornecedores.filter((fo) => fo.nome.toLowerCase().includes(t)) : fornecedores).slice(0, 50)
  }, [fornecedores])
  const buscarPais = useCallback(async (q: string): Promise<string[]> => {
    const t = q.trim().toLowerCase()
    return (t ? PAISES.filter((p) => p.toLowerCase().includes(t)) : PAISES).slice(0, 50)
  }, [])

  function escolherCliente(c: ClienteEnvioOpc) {
    setClienteId(c.id); setClienteNome(c.nome)
    if (c.email) setClienteEmail(c.email)
    if (c.telefone) setClienteTelefone(c.telefone)
    if (c.pais) setPais(c.pais)
    if (c.morada) setMoradaEnvio(c.morada)
  }
  async function adicionarCliente(nome: string) {
    setErro(null)
    const existente = clientes.find((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    if (existente) { escolherCliente(existente); return }
    const novo = await criarClienteEnvio(nome, clienteEmail, clienteTelefone, pais)
    if (!novo) { setErro('Não foi possível adicionar o cliente.'); return }
    setClientes((p) => [...p, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
    escolherCliente(novo)
  }

  // Itens
  function adicionarItem(m: MaterialOpc) {
    setItens((prev) => [...prev, { peca_id: m.peca_id, peca_nome: m.nome, serial_number: m.serial_number, quantidade: 1, preco_unitario: m.preco }])
  }
  function alterarItem(i: number, patch: Partial<Item>) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function removerItem(i: number) { setItens((prev) => prev.filter((_, idx) => idx !== i)) }
  // Separa uma linha de N unidades em N linhas de 1 unidade (1 S/N por unidade).
  function dividirEmUnidades(i: number) {
    setItens((prev) => {
      const it = prev[i]
      if (!it || it.quantidade <= 1) return prev
      const copias = Array.from({ length: it.quantidade }, (_, k) => ({ ...it, quantidade: 1, serial_number: k === 0 ? it.serial_number : null }))
      return [...prev.slice(0, i), ...copias, ...prev.slice(i + 1)]
    })
  }
  // Adiciona uma linha a partir de um S/N sugerido (em aberto).
  function adicionarSnAberto(sug: { serial_number: string; peca_nome: string | null }) {
    setItens((prev) => [...prev, { peca_id: null, peca_nome: sug.peca_nome ?? '(peça)', serial_number: sug.serial_number, quantidade: 1, preco_unitario: 0 }])
    setSnAbertos((prev) => prev.filter((x) => x.serial_number !== sug.serial_number))
  }
  function adicionarManual() {
    const nome = manualNome.trim()
    if (!nome) return
    setItens((prev) => [...prev, { peca_id: null, peca_nome: nome, serial_number: null, quantidade: 1, preco_unitario: Number(manualPreco) || 0 }])
    setManualNome(''); setManualPreco('')
  }

  const contraparteOk = contraparteTipo === 'cliente' ? clienteNome.trim() : fornecedorNome.trim()

  async function submeter() {
    setErro(null)
    if (!contraparteOk) { setErro(contraparteTipo === 'cliente' ? 'Indica o cliente.' : 'Indica o fornecedor.'); return }
    setAGuardar(true)
    const eCliente = contraparteTipo === 'cliente'

    if (modo === 'envio') {
      const { data, error } = await criarEnvio(
        {
          destinatario_tipo: contraparteTipo,
          fornecedor_id: eCliente ? null : fornecedorId,
          fornecedor_nome: eCliente ? null : (fornecedorNome.trim() || null),
          motivo: motivoEnvio,
          faturavel: semCusto ? false : faturavel,
          cliente_id: eCliente ? clienteId : null,
          cliente_nome: eCliente ? (clienteNome.trim() || null) : null,
          cliente_email: eCliente ? (clienteEmail.trim() || null) : null,
          morada_envio: moradaEnvio.trim() || null,
          responsavel_id: responsavelId || null,
          responsavel_nome: funcionarios.find((f) => f.id === responsavelId)?.nome ?? null,
          transportadora: null, transportadora_outro: null,
          peso_kg: null, comprimento_cm: null, largura_cm: null, altura_cm: null,
          valor_a_faturar: (semCusto || !faturavel) ? null : num(valorFaturar),
          iva_isento: ivaOpcao === 'isento',
          iva_taxa: ivaOpcao === 'isento' ? 0 : Number(ivaOpcao),
          notas: notas.trim() || null,
        },
        itens, perfil?.id ?? null, perfil?.nome ?? perfil?.email ?? null
      )
      setAGuardar(false)
      if (error || !data) { setErro('Erro ao criar o envio: ' + (error?.message ?? '')); return }
      router.push(`/logistico/envios-pecas/${data.id}`)
    } else {
      const { data, error } = await criarRececao(
        {
          origem_tipo: contraparteTipo,
          cliente_id: eCliente ? clienteId : null,
          cliente_nome: eCliente ? (clienteNome.trim() || null) : null,
          fornecedor_id: eCliente ? null : fornecedorId,
          fornecedor_nome: eCliente ? null : (fornecedorNome.trim() || null),
          motivo: motivoRececao,
          equipamento_id: equipId,
          equipamento_sn: equipSn.trim() || null,
          referencia_tipo: refTipo,
          referencia_id: refId,
          referencia_numero: refNumero.trim() || null,
          responsavel_id: responsavelId || null,
          responsavel_nome: funcionarios.find((f) => f.id === responsavelId)?.nome ?? null,
          notas: notas.trim() || null,
        },
        itens, perfil?.id ?? null, perfil?.nome ?? perfil?.email ?? null
      )
      setAGuardar(false)
      if (error || !data) { setErro('Erro ao criar a receção: ' + (error?.message ?? '')); return }
      router.push(`/logistico/rececoes-pecas/${data.id}`)
    }
  }

  const eCliente = contraparteTipo === 'cliente'

  return (
    <main style={f.page}>
      <div style={f.cabecalho}>
        <h1 style={f.titulo}>Nova Encomenda</h1>
        <Link href="/logistico/encomendas" style={f.voltar}>← Encomendas</Link>
      </div>

      {/* Escolha Envio / Receção */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>O que vais registar?</div>
        <div style={f.modoGrid}>
          <button type="button" onClick={() => setModo('envio')} style={{ ...f.modoCard, ...(modo === 'envio' ? f.modoCardAtivo : {}) }}>
            <div style={f.modoIcon}>📤</div>
            <div style={f.modoLabel}>Envio de Encomenda</div>
            <div style={f.modoDesc}>Peças/equipamento que saem para cliente ou fornecedor.</div>
          </button>
          <button type="button" onClick={() => setModo('rececao')} style={{ ...f.modoCard, ...(modo === 'rececao' ? f.modoCardAtivo : {}) }}>
            <div style={f.modoIcon}>📥</div>
            <div style={f.modoLabel}>Receção de Encomenda</div>
            <div style={f.modoDesc}>Peças/equipamento que recebemos de cliente ou fornecedor.</div>
          </button>
        </div>
      </section>

      {/* Contraparte */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>{modo === 'envio' ? 'Destinatário' : 'De quem recebeste'}</div>
        <div style={f.toggleTipo}>
          <button type="button" style={{ ...f.toggleBtn, ...(contraparteTipo === 'cliente' ? f.toggleBtnAtivo : {}) }} onClick={() => setContraparteTipo('cliente')}>👤 Cliente</button>
          <button type="button" style={{ ...f.toggleBtn, ...(contraparteTipo === 'fornecedor' ? f.toggleBtnAtivo : {}) }} onClick={() => setContraparteTipo('fornecedor')}>🏭 Fornecedor</button>
        </div>

        <div style={f.grid2}>
          {eCliente ? (
            <Campo rotulo="Nome do cliente *">
              <Autocomplete valor={clienteNome} placeholder="Escolher da lista ou escrever..." buscar={buscarCliente}
                onChangeTexto={(v) => { setClienteNome(v); setClienteId(null) }} onEscolher={escolherCliente}
                render={(c) => `${c.nome}${c.pais ? ` · ${c.pais}` : ''}`} chaveTexto={(c) => c.nome}
                onTextoNovo={adicionarCliente} textoNovoRotulo={(t) => `➕ Adicionar «${t}» como novo cliente`} />
            </Campo>
          ) : (
            <Campo rotulo="Fornecedor *">
              <Autocomplete valor={fornecedorNome} placeholder="Escolher da lista ou escrever..." buscar={buscarFornecedor}
                onChangeTexto={(v) => { setFornecedorNome(v); setFornecedorId(null) }} onEscolher={(fo) => { setFornecedorNome(fo.nome); setFornecedorId(fo.id); if (fo.morada) setMoradaEnvio(fo.morada) }}
                render={(fo) => fo.nome} chaveTexto={(fo) => fo.nome} onTextoNovo={(t) => { setFornecedorNome(t); setFornecedorId(null) }} textoNovoRotulo={(t) => `➕ Usar «${t}»`} />
            </Campo>
          )}
          <Campo rotulo="Funcionário responsável">
            <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} style={f.input}>
              <option value="">— quem está a tratar —</option>
              {funcionarios.map((fn) => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
            </select>
          </Campo>
        </div>

        {modo === 'envio' && eCliente && (
          <>
            <div style={f.grid2}>
              <Campo rotulo="Email do cliente"><input value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} style={f.input} placeholder="email@cliente.com" /></Campo>
              <Campo rotulo="Telefone do cliente"><input value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} style={f.input} placeholder="+351 ..." /></Campo>
            </div>
            <div style={f.grid2}>
              <Campo rotulo="País">
                <Autocomplete valor={pais} placeholder="Escolher da lista ou escrever..." buscar={buscarPais}
                  onChangeTexto={setPais} onEscolher={setPais} render={(p) => p} chaveTexto={(p) => p} onTextoNovo={setPais} textoNovoRotulo={(t) => `➕ Usar «${t}»`} />
              </Campo>
            </div>
          </>
        )}
      </section>

      {/* Motivo */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Motivo</div>
        {modo === 'envio' ? (
          <>
            <div style={f.motivos}>
              {MOTIVOS_ENVIO.map((m) => (
                <button key={m.valor} type="button" style={{ ...f.motivoBtn, ...(motivoEnvio === m.valor ? f.motivoBtnAtivo : {}) }} onClick={() => escolherMotivoEnvio(m.valor)}>
                  {m.label}{m.semCusto ? ' · sem custo' : ''}
                </button>
              ))}
            </div>
            <label style={f.checkLinha}>
              <input type="checkbox" checked={faturavel} disabled={semCusto} onChange={(e) => setFaturavel(e.target.checked)} />
              <span>Faturável{semCusto ? ' (não se aplica a este motivo)' : ''}</span>
            </label>
          </>
        ) : (
          <div style={f.motivos}>
            {MOTIVOS_RECECAO.map((m) => (
              <button key={m.valor} type="button" style={{ ...f.motivoBtn, ...(motivoRececao === m.valor ? f.motivoBtnAtivo : {}) }} onClick={() => setMotivoRececao(m.valor)}>{m.label}</button>
            ))}
          </div>
        )}
      </section>

      {/* Receção: ligação + equipamento */}
      {modo === 'rececao' && (
        <section style={f.seccao}>
          <div style={f.seccaoTitulo}>Ligações</div>
          <Campo rotulo="Nº do envio (EP) ou reparação (RPC) — para a correspondência">
            <div style={{ position: 'relative' }}>
              <input style={f.input} placeholder="Escreve o número e escolhe da lista..." value={refNumero}
                onChange={(e) => { setRefNumero(e.target.value); setRefId(null); setRefTipo('manual') }} />
              <RefDropdown valor={refNumero} refId={refId} onEscolher={(rp) => { setRefNumero(rp.numero); setRefId(rp.id); setRefTipo(rp.tipo) }} />
            </div>
          </Campo>
          <Campo rotulo="Equipamento associado (procurar por S/N no stock)">
            <div style={{ position: 'relative' }}>
              <input style={f.input} placeholder="Procurar por SN do equipamento..." value={equipSn}
                onChange={(e) => { setEquipSn(e.target.value); setEquipId(null) }} />
              <EquipDropdown valor={equipSn} equipId={equipId} onEscolher={(eq) => { setEquipSn(eq.serial_number ?? ''); setEquipId(eq.id) }} />
            </div>
          </Campo>
        </section>
      )}

      {/* Envio: morada */}
      {modo === 'envio' && (
        <section style={f.seccao}>
          <div style={f.seccaoTitulo}>Morada de envio</div>
          <textarea value={moradaEnvio} onChange={(e) => setMoradaEnvio(e.target.value)} style={f.textarea} placeholder="Morada completa de entrega..." />
        </section>
      )}

      {/* Itens (partilhado) */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>{modo === 'envio' ? 'Itens a enviar' : 'Peças recebidas'}</div>
        {modo === 'rececao' && (
          <div style={f.snHint}>🔖 Regista <b>um Serial Number por unidade</b>. Se receberes várias unidades da mesma peça, usa o botão <b>÷</b> na linha para a separar (1 S/N cada).</div>
        )}
        {modo === 'rececao' && snAbertos.length > 0 && (
          <div style={f.snAbertos}>
            <div style={f.snAbertosTit}>💡 S/N enviados a esta entidade ainda por receber — clica para rececionar:</div>
            <div style={f.snAbertosLista}>
              {snAbertos.map((sug) => (
                <button type="button" key={sug.serial_number} style={f.snChip} onClick={() => adicionarSnAberto(sug)}>
                  + S/N {sug.serial_number}{sug.peca_nome ? ` · ${sug.peca_nome}` : ''}{sug.envio ? ` · ${sug.envio}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <Campo rotulo="Procurar peça (Stock de Peças + Tabela de Preços)">
          <Autocomplete valor="" placeholder="Escreve para procurar e clica para adicionar..." limparAoEscolher
            buscar={(q) => pesquisarMaterial(q)} onChangeTexto={() => {}} onEscolher={adicionarItem}
            render={(m) => `${m.nome}${m.serial_number ? ` · S/N ${m.serial_number}` : ''}${m.detalhe ? ` · ${m.detalhe}` : ''} · ${m.origem} — ${formatarEuro(m.preco)}`} />
        </Campo>
        <div style={f.manualLinha}>
          <input value={manualNome} onChange={(e) => setManualNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarManual() } }} placeholder="Ou escreve uma peça manualmente..." style={{ ...f.input, flex: 1 }} />
          <input type="number" step="0.01" min={0} value={manualPreco} onChange={(e) => setManualPreco(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarManual() } }} placeholder="Valor €" style={{ ...f.input, width: 110 }} />
          <button type="button" onClick={adicionarManual} style={f.btnAdd}>Adicionar</button>
        </div>

        {itens.length === 0 ? <p style={f.ajuda}>Ainda não há peças. Procura uma peça acima para adicionar.</p> : (
          <div style={f.itensTabela}>
            <div style={{ ...f.itemLinha, ...f.itemCab }}>
              <span>Peça</span><span>S/N</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Valor unit. (€)</span><span style={{ textAlign: 'right' }}>Total</span><span />
            </div>
            {itens.map((it, i) => (
              <div key={i} style={f.itemLinha}>
                <span>{it.peca_nome}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input value={it.serial_number ?? ''} onChange={(e) => alterarItem(i, { serial_number: e.target.value || null })} placeholder={modo === 'rececao' ? 'S/N por unidade' : 'Sem SN'} style={{ ...f.inputMini, ...(modo === 'rececao' ? f.snDestaque : {}) }} />
                  {it.quantidade > 1 && <button type="button" title="Separar em 1 linha por unidade (1 S/N cada)" onClick={() => dividirEmUnidades(i)} style={f.btnSplit}>÷</button>}
                </div>
                <input type="number" min={1} value={it.quantidade} onChange={(e) => alterarItem(i, { quantidade: Math.max(1, Number(e.target.value) || 1) })} style={{ ...f.inputMini, textAlign: 'center' }} />
                <input type="number" min={0} step="0.01" value={it.preco_unitario} onChange={(e) => alterarItem(i, { preco_unitario: Number(e.target.value) || 0 })} style={{ ...f.inputMini, textAlign: 'right' }} />
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(it.quantidade * it.preco_unitario)}</span>
                <button type="button" onClick={() => removerItem(i)} style={f.btnX} aria-label="Remover">×</button>
              </div>
            ))}
            <div style={f.totalLinha}><span>Total</span><strong>{formatarEuro(totalItens)}</strong></div>
          </div>
        )}
      </section>

      {/* Envio: valor (dimensões e peso preenchem-se na ficha depois de criar) */}
      {modo === 'envio' && (
        <>
          {faturavel && !semCusto && (
            <section style={f.seccao}>
              <div style={f.seccaoTitulo}>Valor a faturar</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="number" step="0.01" value={valorFaturar} onChange={(e) => setValorFaturar(e.target.value)} style={{ ...f.input, maxWidth: 200 }} placeholder="0.00" />
                <button type="button" style={f.btnAdd} onClick={() => setValorFaturar(String(totalItens))}>Usar total dos itens ({formatarEuro(totalItens)})</button>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>IVA</span>
                <select value={ivaOpcao} onChange={(e) => setIvaOpcao(e.target.value as '23' | '6' | 'isento')} style={{ ...f.input, maxWidth: 180 }}>
                  <option value="23">23%</option>
                  <option value="6">6%</option>
                  <option value="isento">Isento de IVA</option>
                </select>
              </div>
              {(() => {
                const b = calcularIva({ valor_a_faturar: num(valorFaturar), iva_isento: ivaOpcao === 'isento', iva_taxa: ivaOpcao === 'isento' ? 0 : Number(ivaOpcao) })
                return (
                  <div style={{ marginTop: 8, fontSize: 14 }}>
                    {b.isento
                      ? <>Isento de IVA · Total: <strong>{formatarEuro(b.total)}</strong></>
                      : <>IVA ({b.taxa}%): {formatarEuro(b.iva)} · Total: <strong>{formatarEuro(b.total)}</strong></>}
                  </div>
                )
              })()}
            </section>
          )}
        </>
      )}

      {/* Notas */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Notas</div>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={f.textarea} />
      </section>

      {erro && <div style={f.erro}>{erro}</div>}

      <div style={f.acoes}>
        <button onClick={submeter} disabled={aGuardar} style={f.btnPrimario}>
          {aGuardar ? 'A criar...' : (modo === 'envio' ? 'Criar Envio' : 'Criar Receção')}
        </button>
      </div>
    </main>
  )
}

function RefDropdown({ valor, refId, onEscolher }: { valor: string; refId: string | null; onEscolher: (rp: RefDocOpc) => void }) {
  const [resultados, setResultados] = useState<RefDocOpc[]>([])
  useEffect(() => {
    if (refId) { setResultados([]); return }
    const t = setTimeout(async () => setResultados(await pesquisarDocumentos(valor)), 250)
    return () => clearTimeout(t)
  }, [valor, refId])
  if (refId || resultados.length === 0) return null
  return <div style={f.dropdown}>{resultados.map((rp) => <button key={rp.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(rp) }} style={f.opcao}>{rp.label}</button>)}</div>
}

function EquipDropdown({ valor, equipId, onEscolher }: { valor: string; equipId: string | null; onEscolher: (eq: EquipOpc) => void }) {
  const [resultados, setResultados] = useState<EquipOpc[]>([])
  useEffect(() => {
    if (equipId) { setResultados([]); return }
    const t = setTimeout(async () => setResultados(await pesquisarEquipamentos(valor)), 250)
    return () => clearTimeout(t)
  }, [valor, equipId])
  if (equipId || resultados.length === 0) return null
  return <div style={f.dropdown}>{resultados.map((eq) => <button key={eq.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(eq) }} style={f.opcao}>{eq.modelo || '—'}{eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}</button>)}</div>
}

function Autocomplete<T>({ valor, placeholder, buscar, onChangeTexto, onEscolher, render, chaveTexto, onTextoNovo, textoNovoRotulo, limparAoEscolher }: {
  valor: string; placeholder?: string; buscar: (q: string) => Promise<T[]>; onChangeTexto: (v: string) => void; onEscolher: (item: T) => void
  render: (item: T) => string; chaveTexto?: (item: T) => string; onTextoNovo?: (texto: string) => void; textoNovoRotulo?: (texto: string) => string; limparAoEscolher?: boolean
}) {
  const [texto, setTexto] = useState(valor)
  const [resultados, setResultados] = useState<T[]>([])
  const [aberto, setAberto] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTexto(valor) }, [valor])
  useEffect(() => { const t = setTimeout(async () => setResultados(await buscar(texto)), 250); return () => clearTimeout(t) }, [texto, buscar])
  const textoTrim = texto.trim()
  const correspExata = resultados.some((r) => (chaveTexto ? chaveTexto(r) : render(r)).trim().toLowerCase() === textoTrim.toLowerCase())
  const rotuloCriar = onTextoNovo && textoTrim && !correspExata ? (textoNovoRotulo ? textoNovoRotulo(textoTrim) : `Usar «${textoTrim}»`) : null
  return (
    <div style={{ position: 'relative' }}>
      <input value={texto} placeholder={placeholder} onChange={(e) => { setTexto(e.target.value); onChangeTexto(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} style={f.input} />
      {aberto && (resultados.length > 0 || rotuloCriar) && (
        <div style={f.dropdown}>
          {rotuloCriar && <button type="button" onMouseDown={(e) => { e.preventDefault(); onTextoNovo!(textoTrim); setAberto(false) }} style={f.opcaoCriar}>{rotuloCriar}</button>}
          {resultados.map((item, i) => <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(item); setAberto(false); if (limparAoEscolher) setTexto('') }} style={f.opcao}>{render(item)}</button>)}
        </div>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label style={f.campo}><span style={f.rotulo}>{rotulo}</span>{children}</label>
}

const f: Record<string, React.CSSProperties> = {
  page: { maxWidth: 880, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  seccao: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  seccaoTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  modoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  modoCard: { textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 },
  modoCardAtivo: { borderColor: 'var(--primary)', background: 'var(--accent-bg, #ece8fb)' },
  modoIcon: { fontSize: 26 },
  modoLabel: { fontWeight: 700, color: 'var(--primary-dark)' },
  modoDesc: { fontSize: 12.5, color: 'var(--muted)' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  inputMini: { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 60, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  ajuda: { fontSize: 13, color: 'var(--muted)', margin: 0 },
  itensTabela: { border: '1px solid var(--border)', borderRadius: 8, padding: 6 },
  itemLinha: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.6fr 1fr 1fr 32px', gap: 8, padding: '6px 6px', alignItems: 'center', fontSize: 14, borderBottom: '1px solid #f2f2f2' },
  itemCab: { fontWeight: 700, color: 'var(--muted)', fontSize: 12 },
  totalLinha: { display: 'flex', justifyContent: 'space-between', padding: '10px 6px 2px', fontSize: 15 },
  btnX: { background: 'transparent', border: 'none', color: 'var(--danger, #c62828)', fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  btnAdd: { background: 'var(--surface, #fff)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  manualLinha: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' },
  opcao: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  opcaoCriar: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'var(--background)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--primary)', fontWeight: 600 },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  acoes: { display: 'flex', gap: 10 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  toggleTipo: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface, #fff)', fontWeight: 700, cursor: 'pointer', color: 'var(--foreground)' },
  toggleBtnAtivo: { background: 'var(--accent-bg, #ece8fb)', borderColor: 'var(--primary)', color: 'var(--primary-dark)' },
  motivos: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  motivoBtn: { padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface, #fff)', fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)', fontSize: 14 },
  motivoBtnAtivo: { background: 'var(--accent-bg, #ece8fb)', borderColor: 'var(--primary)', color: 'var(--primary-dark)' },
  checkLinha: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  snHint: { fontSize: 13, color: '#155e75', background: '#e0f5fb', border: '1px solid #a9e2ee', borderRadius: 8, padding: '8px 12px' },
  snDestaque: { borderColor: '#0e7490', background: '#f2fcff' },
  btnSplit: { border: '1px solid var(--border)', background: 'var(--surface, #fff)', borderRadius: 6, width: 26, height: 30, cursor: 'pointer', fontWeight: 800, color: 'var(--primary)', flexShrink: 0 },
  snAbertos: { background: '#fff8e1', border: '1px solid #f0d98a', borderRadius: 8, padding: '10px 12px' },
  snAbertosTit: { fontSize: 12.5, fontWeight: 700, color: '#7a5b00', marginBottom: 8 },
  snAbertosLista: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  snChip: { border: '1px solid #d9b84a', background: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, color: '#7a5b00', cursor: 'pointer' },
}
