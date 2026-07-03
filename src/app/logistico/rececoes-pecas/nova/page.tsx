'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  listarClientesEnvio, criarClienteEnvio, pesquisarMaterial, listarFuncionarios,
  listarFornecedoresEnvio,
  type ClienteEnvioOpc, type MaterialOpc, type FuncionarioOpc, type FornecedorEnvioOpc,
} from '@/lib/enviosPecas'
import { criarRececao, pesquisarDocumentos, type RefDocOpc } from '@/lib/rececoesPecas'
import { pesquisarEquipamentos, type EquipOpc } from '@/lib/folhasObra'
import {
  formatarEuro, MOTIVOS_RECECAO,
  type RececaoItemInput, type OrigemTipo, type MotivoRececao, type RefDocTipo,
} from '@/types/rececaoPecas'

export default function NovaRececaoPage() {
  const router = useRouter()
  const { perfil } = useAuth()

  // Origem: de quem recebemos (cliente ou fornecedor)
  const [origemTipo, setOrigemTipo] = useState<OrigemTipo>('fornecedor')

  // Cliente
  const [clientes, setClientes] = useState<ClienteEnvioOpc[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNome, setClienteNome] = useState('')

  // Fornecedor
  const [fornecedores, setFornecedores] = useState<FornecedorEnvioOpc[]>([])
  const [fornecedorId, setFornecedorId] = useState<string | null>(null)
  const [fornecedorNome, setFornecedorNome] = useState('')

  // Motivo
  const [motivo, setMotivo] = useState<MotivoRececao>('reparacao')

  // Funcionário responsável
  const [funcionarios, setFuncionarios] = useState<FuncionarioOpc[]>([])
  const [responsavelId, setResponsavelId] = useState('')

  // Equipamento associado (ligado ao stock de equipamentos)
  const [equipSn, setEquipSn] = useState('')
  const [equipId, setEquipId] = useState<string | null>(null)

  // Ligação ao documento existente (envio EP / reparação RPC)
  const [refNumero, setRefNumero] = useState('')
  const [refTipo, setRefTipo] = useState<RefDocTipo>('manual')
  const [refId, setRefId] = useState<string | null>(null)

  // Itens
  const [itens, setItens] = useState<RececaoItemInput[]>([])
  const [manualNome, setManualNome] = useState('')
  const [manualPreco, setManualPreco] = useState('')

  const [notas, setNotas] = useState('')

  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { listarClientesEnvio().then(setClientes) }, [])
  useEffect(() => { listarFornecedoresEnvio().then(setFornecedores) }, [])
  useEffect(() => { listarFuncionarios().then(setFuncionarios) }, [])

  const totalItens = useMemo(
    () => itens.reduce((a, i) => a + i.quantidade * i.preco_unitario, 0),
    [itens]
  )

  const buscarFornecedor = useCallback(async (q: string): Promise<FornecedorEnvioOpc[]> => {
    const t = q.trim().toLowerCase()
    const base = t ? fornecedores.filter((fo) => fo.nome.toLowerCase().includes(t)) : fornecedores
    return base.slice(0, 50)
  }, [fornecedores])

  const buscarCliente = useCallback(async (q: string): Promise<ClienteEnvioOpc[]> => {
    const t = q.trim().toLowerCase()
    const base = t ? clientes.filter((c) => c.nome.toLowerCase().includes(t)) : clientes
    return base.slice(0, 50)
  }, [clientes])

  function escolherCliente(c: ClienteEnvioOpc) {
    setClienteId(c.id)
    setClienteNome(c.nome)
  }

  async function adicionarCliente(nome: string) {
    setErro(null)
    const existente = clientes.find((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    if (existente) { escolherCliente(existente); return }
    const novo = await criarClienteEnvio(nome, '', '')
    if (!novo) { setErro('Não foi possível adicionar o cliente.'); return }
    setClientes((p) => [...p, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
    escolherCliente(novo)
  }

  // Itens — ao escolher do stock, herda o S/N da peça (se existir)
  function adicionarItem(m: MaterialOpc) {
    setItens((prev) => [
      ...prev,
      { peca_id: m.peca_id, peca_nome: m.nome, serial_number: m.serial_number, quantidade: 1, preco_unitario: m.preco },
    ])
  }
  function alterarItem(i: number, patch: Partial<RececaoItemInput>) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function removerItem(i: number) {
    setItens((prev) => prev.filter((_, idx) => idx !== i))
  }
  function adicionarManual() {
    const nome = manualNome.trim()
    if (!nome) return
    setItens((prev) => [
      ...prev,
      { peca_id: null, peca_nome: nome, serial_number: null, quantidade: 1, preco_unitario: Number(manualPreco) || 0 },
    ])
    setManualNome('')
    setManualPreco('')
  }

  async function submeter() {
    setErro(null)
    if (origemTipo === 'cliente' && !clienteNome.trim()) { setErro('Indica o cliente.'); return }
    if (origemTipo === 'fornecedor' && !fornecedorNome.trim()) { setErro('Indica o fornecedor.'); return }
    setAGuardar(true)
    const eCliente = origemTipo === 'cliente'
    const { data, error } = await criarRececao(
      {
        origem_tipo: origemTipo,
        cliente_id: eCliente ? clienteId : null,
        cliente_nome: eCliente ? (clienteNome.trim() || null) : null,
        fornecedor_id: eCliente ? null : fornecedorId,
        fornecedor_nome: eCliente ? null : (fornecedorNome.trim() || null),
        motivo,
        equipamento_id: equipId,
        equipamento_sn: equipSn.trim() || null,
        referencia_tipo: refTipo,
        referencia_id: refId,
        referencia_numero: refNumero.trim() || null,
        responsavel_id: responsavelId || null,
        responsavel_nome: funcionarios.find((f) => f.id === responsavelId)?.nome ?? null,
        notas: notas.trim() || null,
      },
      itens,
      perfil?.id ?? null,
      perfil?.nome ?? perfil?.email ?? null
    )
    setAGuardar(false)
    if (error || !data) { setErro('Erro ao criar a receção: ' + (error?.message ?? '')); return }
    router.push(`/logistico/rececoes-pecas/${data.id}`)
  }

  return (
    <main style={f.page}>
      <div style={f.cabecalho}>
        <h1 style={f.titulo}>Nova Receção de Encomenda</h1>
        <Link href="/logistico/encomendas" style={f.voltar}>← Encomendas</Link>
      </div>

      {/* 1. Origem */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>De quem recebeste</div>
        <div style={f.toggleTipo}>
          <button
            type="button"
            style={{ ...f.toggleBtn, ...(origemTipo === 'fornecedor' ? f.toggleBtnAtivo : {}) }}
            onClick={() => setOrigemTipo('fornecedor')}
          >🏭 Fornecedor</button>
          <button
            type="button"
            style={{ ...f.toggleBtn, ...(origemTipo === 'cliente' ? f.toggleBtnAtivo : {}) }}
            onClick={() => setOrigemTipo('cliente')}
          >👤 Cliente</button>
        </div>

        <div style={f.grid2}>
          {origemTipo === 'cliente' ? (
            <Campo rotulo="Nome do cliente *">
              <Autocomplete
                valor={clienteNome}
                placeholder="Escolher da lista ou escrever..."
                buscar={buscarCliente}
                onChangeTexto={(v) => { setClienteNome(v); setClienteId(null) }}
                onEscolher={escolherCliente}
                render={(c) => `${c.nome}${c.pais ? ` · ${c.pais}` : ''}`}
                chaveTexto={(c) => c.nome}
                onTextoNovo={adicionarCliente}
                textoNovoRotulo={(t) => `➕ Adicionar «${t}» como novo cliente`}
              />
            </Campo>
          ) : (
            <Campo rotulo="Fornecedor *">
              <Autocomplete
                valor={fornecedorNome}
                placeholder="Escolher da lista ou escrever..."
                buscar={buscarFornecedor}
                onChangeTexto={(v) => { setFornecedorNome(v); setFornecedorId(null) }}
                onEscolher={(fo) => { setFornecedorNome(fo.nome); setFornecedorId(fo.id) }}
                render={(fo) => fo.nome}
                chaveTexto={(fo) => fo.nome}
                onTextoNovo={(t) => { setFornecedorNome(t); setFornecedorId(null) }}
                textoNovoRotulo={(t) => `➕ Usar «${t}»`}
              />
            </Campo>
          )}
          <Campo rotulo="Funcionário responsável">
            <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} style={f.input}>
              <option value="">— quem está a tratar —</option>
              {funcionarios.map((fn) => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      {/* Motivo da receção */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Motivo da receção</div>
        <div style={f.motivos}>
          {MOTIVOS_RECECAO.map((m) => (
            <button
              key={m.valor}
              type="button"
              style={{ ...f.motivoBtn, ...(motivo === m.valor ? f.motivoBtnAtivo : {}) }}
              onClick={() => setMotivo(m.valor)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {/* 2. Documento ligado + equipamento */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Ligar a um documento existente</div>
        <Campo rotulo="Nº do envio (EP) ou reparação (RPC) — para a correspondência">
          <div style={{ position: 'relative' }}>
            <input
              style={f.input}
              placeholder="Escreve o número e escolhe da lista..."
              value={refNumero}
              onChange={(e) => { setRefNumero(e.target.value); setRefId(null); setRefTipo('manual') }}
            />
            <RefDropdown
              valor={refNumero}
              refId={refId}
              onEscolher={(rp) => { setRefNumero(rp.numero); setRefId(rp.id); setRefTipo(rp.tipo) }}
            />
          </div>
        </Campo>
        <Campo rotulo="Equipamento associado (procurar por S/N no stock)">
          <div style={{ position: 'relative' }}>
            <input
              style={f.input}
              placeholder="Procurar por SN do equipamento..."
              value={equipSn}
              onChange={(e) => { setEquipSn(e.target.value); setEquipId(null) }}
            />
            <EquipDropdown
              valor={equipSn}
              equipId={equipId}
              onEscolher={(eq) => { setEquipSn(eq.serial_number ?? ''); setEquipId(eq.id) }}
            />
          </div>
        </Campo>
      </section>

      {/* 3. Itens */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Peças recebidas</div>
        <Campo rotulo="Procurar peça (Stock de Peças + Tabela de Preços)">
          <Autocomplete
            valor=""
            placeholder="Escreve para procurar e clica para adicionar..."
            limparAoEscolher
            buscar={(q) => pesquisarMaterial(q)}
            onChangeTexto={() => {}}
            onEscolher={adicionarItem}
            render={(m) => `${m.nome}${m.serial_number ? ` · S/N ${m.serial_number}` : ''}${m.detalhe ? ` · ${m.detalhe}` : ''} · ${m.origem} — ${formatarEuro(m.preco)}`}
          />
        </Campo>

        {/* Adicionar item manual (peça que não está no stock) */}
        <div style={f.manualLinha}>
          <input
            value={manualNome}
            onChange={(e) => setManualNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarManual() } }}
            placeholder="Ou escreve uma peça manualmente..."
            style={{ ...f.input, flex: 1 }}
          />
          <input
            type="number" step="0.01" min={0}
            value={manualPreco}
            onChange={(e) => setManualPreco(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarManual() } }}
            placeholder="Valor €"
            style={{ ...f.input, width: 110 }}
          />
          <button type="button" onClick={adicionarManual} style={f.btnAdd}>Adicionar</button>
        </div>

        {itens.length === 0 ? (
          <p style={f.ajuda}>Ainda não há peças. Procura uma peça acima para adicionar.</p>
        ) : (
          <div style={f.itensTabela}>
            <div style={{ ...f.itemLinha, ...f.itemCab }}>
              <span>Peça</span>
              <span>S/N</span>
              <span style={{ textAlign: 'center' }}>Qtd</span>
              <span style={{ textAlign: 'right' }}>Valor unit. (€)</span>
              <span style={{ textAlign: 'right' }}>Total</span>
              <span />
            </div>
            {itens.map((it, i) => (
              <div key={i} style={f.itemLinha}>
                <span>{it.peca_nome}</span>
                <input
                  value={it.serial_number ?? ''}
                  onChange={(e) => alterarItem(i, { serial_number: e.target.value || null })}
                  placeholder="Sem SN"
                  style={f.inputMini}
                />
                <input
                  type="number" min={1} value={it.quantidade}
                  onChange={(e) => alterarItem(i, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ ...f.inputMini, textAlign: 'center' }}
                />
                <input
                  type="number" min={0} step="0.01" value={it.preco_unitario}
                  onChange={(e) => alterarItem(i, { preco_unitario: Number(e.target.value) || 0 })}
                  style={{ ...f.inputMini, textAlign: 'right' }}
                />
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatarEuro(it.quantidade * it.preco_unitario)}</span>
                <button type="button" onClick={() => removerItem(i)} style={f.btnX} aria-label="Remover">×</button>
              </div>
            ))}
            <div style={f.totalLinha}>
              <span>Total das peças</span>
              <strong>{formatarEuro(totalItens)}</strong>
            </div>
          </div>
        )}
      </section>

      {/* 4. Notas */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Notas</div>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={f.textarea} />
      </section>

      {erro && <div style={f.erro}>{erro}</div>}

      <div style={f.acoes}>
        <button onClick={submeter} disabled={aGuardar} style={f.btnPrimario}>
          {aGuardar ? 'A criar...' : 'Criar Receção'}
        </button>
      </div>
    </main>
  )
}

// ─── Dropdown de documentos (envio/reparação) com debounce ───────────────────
function RefDropdown({ valor, refId, onEscolher }: {
  valor: string
  refId: string | null
  onEscolher: (rp: RefDocOpc) => void
}) {
  const [resultados, setResultados] = useState<RefDocOpc[]>([])
  useEffect(() => {
    if (refId) { setResultados([]); return }
    const t = setTimeout(async () => setResultados(await pesquisarDocumentos(valor)), 250)
    return () => clearTimeout(t)
  }, [valor, refId])
  if (refId || resultados.length === 0) return null
  return (
    <div style={f.dropdown}>
      {resultados.map((rp) => (
        <button key={rp.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(rp) }} style={f.opcao}>
          {rp.label}
        </button>
      ))}
    </div>
  )
}

// ─── Dropdown de equipamentos (stock) com debounce ───────────────────────────
function EquipDropdown({ valor, equipId, onEscolher }: {
  valor: string
  equipId: string | null
  onEscolher: (eq: EquipOpc) => void
}) {
  const [resultados, setResultados] = useState<EquipOpc[]>([])
  useEffect(() => {
    if (equipId) { setResultados([]); return }
    const t = setTimeout(async () => setResultados(await pesquisarEquipamentos(valor)), 250)
    return () => clearTimeout(t)
  }, [valor, equipId])
  if (equipId || resultados.length === 0) return null
  return (
    <div style={f.dropdown}>
      {resultados.map((eq) => (
        <button key={eq.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(eq) }} style={f.opcao}>
          {eq.modelo || '—'}{eq.serial_number ? ` · S/N ${eq.serial_number}` : ''}
        </button>
      ))}
    </div>
  )
}

// ─── Autocomplete genérico (igual ao do Envio) ───────────────────────────────
function Autocomplete<T>({
  valor, placeholder, buscar, onChangeTexto, onEscolher, render,
  chaveTexto, onTextoNovo, textoNovoRotulo, limparAoEscolher,
}: {
  valor: string
  placeholder?: string
  buscar: (q: string) => Promise<T[]>
  onChangeTexto: (v: string) => void
  onEscolher: (item: T) => void
  render: (item: T) => string
  chaveTexto?: (item: T) => string
  onTextoNovo?: (texto: string) => void
  textoNovoRotulo?: (texto: string) => string
  limparAoEscolher?: boolean
}) {
  const [texto, setTexto] = useState(valor)
  const [resultados, setResultados] = useState<T[]>([])
  const [aberto, setAberto] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTexto(valor) }, [valor])

  useEffect(() => {
    const t = setTimeout(async () => setResultados(await buscar(texto)), 250)
    return () => clearTimeout(t)
  }, [texto, buscar])

  const textoTrim = texto.trim()
  const correspExata = resultados.some(
    (r) => (chaveTexto ? chaveTexto(r) : render(r)).trim().toLowerCase() === textoTrim.toLowerCase()
  )
  const rotuloCriar = onTextoNovo && textoTrim && !correspExata
    ? (textoNovoRotulo ? textoNovoRotulo(textoTrim) : `Usar «${textoTrim}»`)
    : null

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={texto}
        placeholder={placeholder}
        onChange={(e) => { setTexto(e.target.value); onChangeTexto(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        style={f.input}
      />
      {aberto && (resultados.length > 0 || rotuloCriar) && (
        <div style={f.dropdown}>
          {rotuloCriar && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onTextoNovo!(textoTrim); setAberto(false) }} style={f.opcaoCriar}>
              {rotuloCriar}
            </button>
          )}
          {resultados.map((item, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onEscolher(item)
                setAberto(false)
                if (limparAoEscolher) setTexto('')
              }}
              style={f.opcao}
            >
              {render(item)}
            </button>
          ))}
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
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', boxSizing: 'border-box' },
  inputMini: { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, font: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', minHeight: 70, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, font: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
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
}
