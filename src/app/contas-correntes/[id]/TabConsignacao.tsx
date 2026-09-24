'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  listarConsignacoes, listarEquipamentosPicker, custoDeclaradoSugerido,
  criarConsignacao, registarVenda, confirmarVenda, eliminarVendaRegistada, marcarDevolucao,
  estadoConsignacaoInfo, estadoVendaInfo, ORIGENS_CONSIGNACAO, MOEDAS,
  formatarMoeda, formatarData, hojeISO,
  type ContaComSaldo, type ConsignacaoRow, type EquipamentoPicker,
  type Venda, type OrigemConsignacao, type EntidadeFaturada,
} from '@/lib/cc'

function parseNum(v: string): number {
  const n = Number(v.replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

export default function TabConsignacao({ conta, onMudou }: {
  conta: ContaComSaldo; onMudou: () => void
}) {
  const [consigs, setConsigs] = useState<ConsignacaoRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  async function recarregar() {
    setConsigs(await listarConsignacoes(conta.id))
    setCarregando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregar() }, [conta.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const emStock = consigs.filter((x) => x.estado === 'em_stock').length

  // Agrupa por batch (data de envio); "sem data" fica num grupo "Por receber" no fim.
  const batches = useMemo(() => {
    const map = new Map<string, ConsignacaoRow[]>()
    for (const cg of consigs) {
      const k = cg.data_envio ?? 'sem_data'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(cg)
    }
    const keys = [...map.keys()].sort((a, b) =>
      a === 'sem_data' ? 1 : b === 'sem_data' ? -1 : a.localeCompare(b))
    return keys.map((k) => {
      const ms = map.get(k)!
      const custoEur = ms.reduce((s, m) => s + (m.custo_declarado || 0), 0)
      const custoAed = ms.reduce((s, m) => s + (m.custo_declarado || 0) * (m.taxa_cambio_custo || 0), 0)
      const devidoAed = ms.reduce((s, m) => s + (m.vendas || []).reduce((a, v) => a + (v.valor_devido || 0), 0), 0)
      const taxa = ms.find((m) => m.taxa_cambio_custo)?.taxa_cambio_custo ?? null
      const nVend = ms.filter((m) => (m.vendas || []).length > 0).length
      return { key: k, label: k === 'sem_data' ? 'Por receber' : formatarData(k), taxa, ms, custoEur, custoAed, devidoAed, nVend }
    })
  }, [consigs])

  return (
    <div>
      <div style={c.barra}>
        <span style={c.contagem}>{consigs.length} máquina(s) · {emStock} em stock</span>
        <button style={c.btnPrimarioSm} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? '× Fechar' : '+ Adicionar máquina'}
        </button>
      </div>

      {addOpen && (
        <FormAdicionar
          conta={conta}
          onCancelar={() => setAddOpen(false)}
          onGuardado={() => { setAddOpen(false); recarregar() }}
        />
      )}

      {carregando ? (
        <p style={c.estado}>A carregar...</p>
      ) : consigs.length === 0 ? (
        <p style={c.estado}>Ainda não há máquinas nesta consignação.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {batches.map((b) => (
            <div key={b.key}>
              <div style={c.batchHeader}>
                <div>
                  <span style={c.batchTitulo}>
                    {b.key === 'sem_data' ? '📦 Por receber' : `📦 Envio ${b.label}`}
                  </span>
                  <span style={c.batchSub}>
                    {b.ms.length} máquina(s) · {b.nVend} vendida(s)
                    {b.taxa ? ` · taxa ${b.taxa}` : ''}
                  </span>
                </div>
                <div style={c.batchNums}>
                  <span>custo {formatarMoeda(b.custoEur, 'EUR')}{b.custoAed ? ` · ${formatarMoeda(b.custoAed, conta.moeda)}` : ''}</span>
                  {b.devidoAed > 0 && <span>devido {formatarMoeda(b.devidoAed, conta.moeda)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {b.ms.map((cg) => (
                  <CartaoConsignacao
                    key={cg.id}
                    conta={conta}
                    cg={cg}
                    onMudou={() => { recarregar(); onMudou() }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cartão de uma consignação ───────────────────────────────────────────────

function CartaoConsignacao({ conta, cg, onMudou }: {
  conta: ContaComSaldo; cg: ConsignacaoRow; onMudou: () => void
}) {
  const [vendaOpen, setVendaOpen] = useState(false)
  const [aProcessar, setAProcessar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const info = estadoConsignacaoInfo(cg.estado)
  const eq = cg.equipamento
  const titulo = [eq?.marca, eq?.modelo].filter(Boolean).join(' ') || 'Equipamento'
  // Venda mais recente (a última criada; a lista vem por created_at desc do embed? não garantido) →
  // ordena por data_venda desc para mostrar a relevante.
  const venda = useMemo<Venda | null>(() => {
    if (!cg.vendas?.length) return null
    return [...cg.vendas].sort((a, b) => (b.data_venda ?? '').localeCompare(a.data_venda ?? ''))[0]
  }, [cg.vendas])

  async function devolver() {
    if (!window.confirm('Marcar esta máquina como devolvida?')) return
    setErro(null); setAProcessar(true)
    const { error } = await marcarDevolucao(cg.id)
    setAProcessar(false)
    if (error) { setErro(error.message); return }
    onMudou()
  }

  async function confirmar(vendaId: string) {
    setErro(null); setAProcessar(true)
    const { error } = await confirmarVenda(vendaId)
    setAProcessar(false)
    if (error) { setErro(error.message); return }
    onMudou()
  }

  async function eliminar(vendaId: string) {
    if (!window.confirm('Eliminar esta venda registada?')) return
    setErro(null); setAProcessar(true)
    const { error } = await eliminarVendaRegistada(vendaId)
    setAProcessar(false)
    if (error) { setErro(error.message); return }
    onMudou()
  }

  return (
    <div style={c.cartao}>
      <div style={c.cartaoTopo}>
        <div style={{ minWidth: 0 }}>
          <div style={c.cartaoTitulo}>{titulo}</div>
          <div style={c.cartaoMeta}>
            {eq?.serial_number && <span>SN: <strong>{eq.serial_number}</strong></span>}
            {eq?.ano && <span> · {eq.ano}</span>}
            {cg.origem && <span> · {ORIGENS_CONSIGNACAO.find((o) => o.valor === cg.origem)?.label}</span>}
            {cg.data_envio && <span> · envio {formatarData(cg.data_envio)}</span>}
          </div>
          {cg.acessorios?.length > 0 && (
            <div style={c.acessorios}>+ {cg.acessorios.join(', ')}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...c.estadoPill, color: info.cor, background: info.bg }}>{info.label}</span>
          <div style={c.custo}>custo declarado: <strong>{formatarMoeda(cg.custo_declarado, cg.moeda_custo)}</strong></div>
        </div>
      </div>

      {erro && <div style={c.erro}>{erro}</div>}

      {/* Venda associada */}
      {venda && (
        <div style={c.vendaBox}>
          <div style={c.vendaLinha}>
            <span>Venda {formatarData(venda.data_venda)}{venda.cliente_final ? ` · ${venda.cliente_final}` : ''}</span>
            <span style={{ ...c.estadoPillSm, ...estadoVendaCores(venda.estado) }}>{estadoVendaInfo(venda.estado).label}</span>
          </div>
          <div style={c.vendaNums}>
            <Num rotulo="Preço" valor={formatarMoeda(venda.preco_venda, venda.moeda_venda)} />
            <Num rotulo="Custo conv." valor={formatarMoeda(venda.custo_convertido, venda.moeda_venda)} />
            <Num rotulo="Margem" valor={formatarMoeda(venda.margem, venda.moeda_venda)} alerta={venda.margem_negativa} />
            <Num rotulo="Valor devido" valor={formatarMoeda(venda.valor_devido, venda.moeda_venda)} destaque />
          </div>
          {venda.estado === 'registada' && (
            <div style={c.vendaAcoes}>
              <span style={c.avisoRegistada}>Ainda não entrou no ledger. Confirma para criar o valor esperado.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={c.btnPrimarioSm} disabled={aProcessar} onClick={() => confirmar(venda.id)}>Confirmar venda</button>
                <button style={c.btnPerigoSm} disabled={aProcessar} onClick={() => eliminar(venda.id)}>Eliminar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ações da máquina em stock */}
      {cg.estado === 'em_stock' && !vendaOpen && (
        <div style={c.acoesLinha}>
          <button style={c.btnPrimarioSm} onClick={() => setVendaOpen(true)}>Registar venda</button>
          <button style={c.btnSecundarioSm} disabled={aProcessar} onClick={devolver}>Marcar devolução</button>
        </div>
      )}

      {vendaOpen && (
        <FormVenda
          conta={conta}
          consignacaoId={cg.id}
          taxaConsignacao={cg.taxa_cambio_custo}
          onCancelar={() => setVendaOpen(false)}
          onGuardado={() => { setVendaOpen(false); onMudou() }}
        />
      )}
    </div>
  )
}

function Num({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div style={c.num}>
      <span style={c.numRotulo}>{rotulo}</span>
      <span style={{ ...c.numValor, ...(destaque ? { color: 'var(--primary)', fontWeight: 800 } : {}), ...(alerta ? { color: '#B91C1C' } : {}) }}>{valor}</span>
    </div>
  )
}

function estadoVendaCores(estado: string): React.CSSProperties {
  const i = estadoVendaInfo(estado)
  return { color: i.cor, background: i.bg }
}

// ─── Formulário: adicionar máquina do stock ──────────────────────────────────

function FormAdicionar({ conta, onCancelar, onGuardado }: {
  conta: ContaComSaldo; onCancelar: () => void; onGuardado: () => void
}) {
  const { perfil } = useAuth()
  const [equipamentos, setEquipamentos] = useState<EquipamentoPicker[]>([])
  const [filtro, setFiltro] = useState('')
  const [equipId, setEquipId] = useState('')
  const [nConjuntos, setNConjuntos] = useState('1')
  const [custo, setCusto] = useState('')
  const [moedaCusto, setMoedaCusto] = useState('EUR')
  const [taxaCusto, setTaxaCusto] = useState('')
  const [origem, setOrigem] = useState<OrigemConsignacao>('envio_direto')
  const [dataEnvio, setDataEnvio] = useState(hojeISO())
  const [entidadeFaturada, setEntidadeFaturada] = useState<EntidadeFaturada | ''>('')
  const [acessorios, setAcessorios] = useState('')
  const [notas, setNotas] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarEquipamentosPicker().then(setEquipamentos) }, [])

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const base = q
      ? equipamentos.filter((e) =>
          [e.serial_number, e.modelo, e.marca].some((x) => (x ?? '').toLowerCase().includes(q)))
      : equipamentos
    return base.slice(0, 200)
  }, [equipamentos, filtro])

  const equipSel = equipamentos.find((e) => e.id === equipId) ?? null

  // Ao escolher máquina (ou mudar nº de conjuntos), pré-preenche o custo sugerido.
  async function aplicarSugestao(id: string, n: number) {
    const sug = await custoDeclaradoSugerido(id, n)
    if (sug != null) setCusto(String(sug))
  }
  function escolher(id: string) {
    setEquipId(id)
    if (id) aplicarSugestao(id, parseInt(nConjuntos) || 1)
    else setCusto('')
  }

  const custoNum = parseNum(custo)
  const podeGuardar = !!equipId && custoNum > 0

  async function guardar() {
    setErro(null)
    if (!podeGuardar) { setErro('Escolhe a máquina e um custo declarado maior que zero.'); return }
    setAGuardar(true)
    const acess = acessorios.split('\n').map((s) => s.trim()).filter(Boolean)
    const { error } = await criarConsignacao(
      {
        conta_id: conta.id,
        equipamento_id: equipId,
        numero_serie: equipSel?.serial_number ?? null,
        custo_declarado: custoNum,
        moeda_custo: moedaCusto,
        taxa_cambio_custo: parseNum(taxaCusto) > 0 ? parseNum(taxaCusto) : null,
        origem,
        data_envio: dataEnvio || null,
        entidade_faturada: entidadeFaturada || null,
        acessorios: acess,
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    if (error) { setErro('Não foi possível guardar: ' + error.message); setAGuardar(false); return }
    onGuardado()
  }

  return (
    <div style={c.formCard}>
      {erro && <div style={c.erro}>{erro}</div>}

      <label style={c.campo}>
        <span style={c.rotulo}>Máquina do stock</span>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Procurar por nº de série, modelo ou marca..." style={c.input} />
        <select value={equipId} onChange={(e) => escolher(e.target.value)} style={{ ...c.input, marginTop: 6 }} size={1}>
          <option value="">— escolher máquina —</option>
          {filtrados.map((e) => (
            <option key={e.id} value={e.id}>
              {[e.serial_number || 's/ SN', e.marca, e.modelo].filter(Boolean).join(' · ')}{e.status ? ` (${e.status})` : ''}
            </option>
          ))}
        </select>
        <span style={c.ajuda}>Mostra até 200 resultados. Máquinas já consignadas ficam de fora.</span>
      </label>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Nº de conjuntos</span>
          <input inputMode="numeric" value={nConjuntos} onChange={(e) => {
            setNConjuntos(e.target.value)
            if (equipId) aplicarSugestao(equipId, parseInt(e.target.value) || 1)
          }} style={c.input} />
          <span style={c.ajuda}>Só afeta a sugestão (Cynosure Elite+ com Zimmer).</span>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Custo declarado</span>
          <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" style={c.input} />
          <span style={c.ajuda}>Sugerido pela regra de família; editável.</span>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Moeda do custo</span>
          <select value={moedaCusto} onChange={(e) => setMoedaCusto(e.target.value)} style={c.input}>
            {MOEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Taxa de câmbio <span style={c.opc}>(opcional)</span></span>
          <input inputMode="decimal" value={taxaCusto} onChange={(e) => setTaxaCusto(e.target.value)} placeholder="ex.: 4,378" style={c.input} />
          <span style={c.ajuda}>Unidades por 1 EUR. Fica ligada à máquina e serve de default na venda.</span>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Origem</span>
          <select value={origem} onChange={(e) => setOrigem(e.target.value as OrigemConsignacao)} style={c.input}>
            {ORIGENS_CONSIGNACAO.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Data de envio</span>
          <input type="date" value={dataEnvio} onChange={(e) => setDataEnvio(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Entidade faturada <span style={c.opc}>(opcional)</span></span>
          <select value={entidadeFaturada} onChange={(e) => setEntidadeFaturada(e.target.value as EntidadeFaturada | '')} style={c.input}>
            <option value="">—</option>
            <option value="laserix">Laserix</option>
            <option value="dermamed">Dermamed</option>
          </select>
        </label>
      </div>

      <label style={c.campo}>
        <span style={c.rotulo}>Acessórios <span style={c.opc}>(um por linha, opcional)</span></span>
        <textarea value={acessorios} onChange={(e) => setAcessorios(e.target.value)} placeholder="ex.: Zimmer Cryo 6" style={{ ...c.input, minHeight: 48, resize: 'vertical' }} />
      </label>

      <label style={c.campo}>
        <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 48, resize: 'vertical' }} />
      </label>

      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={guardar}>
          {aGuardar ? 'A guardar...' : 'Adicionar à consignação'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Formulário: registar venda ──────────────────────────────────────────────

function FormVenda({ conta, consignacaoId, taxaConsignacao, onCancelar, onGuardado }: {
  taxaConsignacao: number | null;
  conta: ContaComSaldo; consignacaoId: string; onCancelar: () => void; onGuardado: () => void
}) {
  const { perfil } = useAuth()
  const [dataVenda, setDataVenda] = useState(hojeISO())
  const [preco, setPreco] = useState('')
  const [moedaVenda, setMoedaVenda] = useState(conta.moeda)
  const [clienteFinal, setClienteFinal] = useState('')
  const [clearing, setClearing] = useState('')
  const [notas, setNotas] = useState('')

  // Taxa contratual aplicável à data escolhida? Se sim, pré-preenche e a taxa
  // manual fica opcional; senão é obrigatória.
  function taxaContratualAplicavel(data: string): number | null {
    if (conta.taxa_contratual == null) return null
    if (conta.taxa_contratual_inicio && data < conta.taxa_contratual_inicio) return null
    if (conta.taxa_contratual_fim && data > conta.taxa_contratual_fim) return null
    return conta.taxa_contratual
  }
  const [taxa, setTaxa] = useState(() => {
    const t = conta.taxa_contratual ?? taxaConsignacao
    return t != null ? String(t) : ''
  })
  const taxaContratual = taxaContratualAplicavel(dataVenda)

  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [vendaFeita, setVendaFeita] = useState<Venda | null>(null)
  const [aConfirmar, setAConfirmar] = useState(false)

  const precoNum = parseNum(preco)
  const taxaNum = parseNum(taxa)
  const taxaEfetiva = taxaNum > 0 ? taxaNum : (taxaContratual ?? taxaConsignacao ?? 0)
  const podeGuardar = precoNum > 0 && !!dataVenda && taxaEfetiva > 0

  async function registar() {
    setErro(null)
    if (!podeGuardar) { setErro('Indica a data, o preço e uma taxa de câmbio (a conta não tem taxa contratual aplicável nesta data).'); return }
    setAGuardar(true)
    const { venda, error } = await registarVenda(
      {
        consignacao_id: consignacaoId,
        data_venda: dataVenda,
        preco_venda: precoNum,
        moeda_venda: moedaVenda.trim().toUpperCase(),
        cliente_final: clienteFinal.trim() || null,
        taxa_cambio_custo: taxaNum > 0 ? taxaNum : null,
        clearing: parseNum(clearing),
        notas: notas.trim() || null,
      },
      { id: perfil?.id ?? null, nome: perfil?.nome ?? null },
    )
    setAGuardar(false)
    if (error) { setErro('Não foi possível registar: ' + error.message); return }
    setVendaFeita(venda)
  }

  async function confirmar() {
    if (!vendaFeita) return
    setErro(null); setAConfirmar(true)
    const { error } = await confirmarVenda(vendaFeita.id)
    setAConfirmar(false)
    if (error) { setErro('Não foi possível confirmar: ' + error.message); return }
    onGuardado()
  }

  async function descartar() {
    if (vendaFeita) await eliminarVendaRegistada(vendaFeita.id)
    onCancelar()
  }

  // Depois de registada: mostra os cálculos e pede confirmação.
  if (vendaFeita) {
    return (
      <div style={c.formCard}>
        {erro && <div style={c.erro}>{erro}</div>}
        <div style={c.previaTitulo}>Venda registada — confirma para criar o valor esperado no ledger:</div>
        <div style={c.vendaNums}>
          <Num rotulo="Preço" valor={formatarMoeda(vendaFeita.preco_venda, vendaFeita.moeda_venda)} />
          <Num rotulo="Custo conv." valor={formatarMoeda(vendaFeita.custo_convertido, vendaFeita.moeda_venda)} />
          <Num rotulo="Margem" valor={formatarMoeda(vendaFeita.margem, vendaFeita.moeda_venda)} alerta={vendaFeita.margem_negativa} />
          <Num rotulo="Valor devido" valor={formatarMoeda(vendaFeita.valor_devido, vendaFeita.moeda_venda)} destaque />
        </div>
        {vendaFeita.margem_negativa && <div style={c.avisoMargem}>⚠️ Margem negativa (venda abaixo do custo).</div>}
        <div style={c.acoes}>
          <button style={c.btnPrimario} disabled={aConfirmar} onClick={confirmar}>{aConfirmar ? 'A confirmar...' : 'Confirmar venda'}</button>
          <button style={c.btnSecundario} disabled={aConfirmar} onClick={descartar}>Descartar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={c.formCard}>
      {erro && <div style={c.erro}>{erro}</div>}
      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Data da venda</span>
          <input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Preço de venda</span>
          <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Moeda</span>
          <select value={moedaVenda} onChange={(e) => setMoedaVenda(e.target.value)} style={c.input}>
            {Array.from(new Set([conta.moeda, ...MOEDAS])).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <div style={c.grelha3}>
        <label style={c.campo}>
          <span style={c.rotulo}>Cliente final <span style={c.opc}>(opcional)</span></span>
          <input value={clienteFinal} onChange={(e) => setClienteFinal(e.target.value)} style={c.input} />
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Taxa de câmbio do custo ({moedaVenda}/EUR)</span>
          <input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="4,378" style={c.input} />
          <span style={c.ajuda}>
            {taxaContratual != null
              ? `Taxa contratual: ${taxaContratual}. Deixa em branco para a usar.`
              : taxaConsignacao != null
              ? `Taxa da máquina: ${taxaConsignacao}. Deixa em branco para a usar.`
              : 'Sem taxa definida — obrigatória.'}
          </span>
        </label>
        <label style={c.campo}>
          <span style={c.rotulo}>Clearing <span style={c.opc}>(opcional)</span></span>
          <input inputMode="decimal" value={clearing} onChange={(e) => setClearing(e.target.value)} placeholder="0,00" style={c.input} />
          <span style={c.ajuda}>Desalfandegamento (em {moedaVenda}); reduz a margem.</span>
        </label>
      </div>

      <label style={c.campo}>
        <span style={c.rotulo}>Notas <span style={c.opc}>(opcional)</span></span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...c.input, minHeight: 44, resize: 'vertical' }} />
      </label>

      <div style={c.acoes}>
        <button style={c.btnPrimario} disabled={!podeGuardar || aGuardar} onClick={registar}>
          {aGuardar ? 'A calcular...' : 'Registar e calcular'}
        </button>
        <button style={c.btnSecundario} onClick={onCancelar} disabled={aGuardar}>Cancelar</button>
      </div>
    </div>
  )
}

const c: Record<string, React.CSSProperties> = {
  barra: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  batchHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '6px 4px 8px', borderBottom: '2px solid var(--border)', marginBottom: 10 },
  batchTitulo: { fontSize: 15, fontWeight: 800, color: 'var(--primary)', marginRight: 10 },
  batchSub: { fontSize: 12.5, color: 'var(--muted)' },
  batchNums: { display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' },
  contagem: { color: 'var(--muted)', fontSize: 13 },
  estado: { color: 'var(--muted)', padding: 12 },
  cartao: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  cartaoTopo: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  cartaoTitulo: { fontSize: 15, fontWeight: 700, color: 'var(--foreground)' },
  cartaoMeta: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 },
  acessorios: { fontSize: 12.5, color: 'var(--primary)', marginTop: 3 },
  custo: { fontSize: 12.5, color: 'var(--muted)', marginTop: 6 },
  estadoPill: { display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 10px' },
  estadoPillSm: { display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px' },
  vendaBox: { background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  vendaLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 },
  vendaNums: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 },
  vendaAcoes: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  avisoRegistada: { fontSize: 12, color: '#92400E' },
  num: { display: 'flex', flexDirection: 'column', gap: 1, borderLeft: '3px solid var(--border)', paddingLeft: 8 },
  numRotulo: { fontSize: 11, color: 'var(--muted)' },
  numValor: { fontSize: 14, fontWeight: 700, color: 'var(--foreground)' },
  acoesLinha: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  erro: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, padding: '8px 10px', fontSize: 13 },
  formCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 },
  previaTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)' },
  avisoMargem: { fontSize: 13, color: '#B91C1C', fontWeight: 600 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  grelha2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  grelha3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--foreground)' },
  opc: { color: 'var(--muted)', fontWeight: 400 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', boxSizing: 'border-box' },
  ajuda: { fontSize: 12, color: 'var(--muted)' },
  acoes: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSecundario: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 18px', fontWeight: 600, cursor: 'pointer' },
  btnPrimarioSm: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecundarioSm: { background: '#fff', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnPerigoSm: { background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
}
