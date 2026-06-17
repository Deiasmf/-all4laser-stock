'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listarClientes, pesquisarEquipamentosStock,
  type ClienteOpc, type EquipStockOpc,
} from '@/lib/notasEncomenda'
import { PAISES } from '@/lib/paises'
import { CATEGORIAS_MATERIAL, categoriasParaMarca } from '@/lib/material-notas-encomenda'
import { CAPAS_OPCOES, type NotaEncomenda, type NotaMaterial, type NotaInput, type MaterialEscolhido, type CapasOpcao } from '@/types/notaEncomenda'

type Acao = { label: string; emitir: boolean; destaque?: boolean }

type Props = {
  inicial?: NotaEncomenda | null
  materiaisIniciais?: NotaMaterial[]
  acoes: Acao[]
  aGuardar: boolean
  erro: string | null
  onSubmit: (input: NotaInput, materiais: MaterialEscolhido[], emitir: boolean) => void
}

const hoje = () => new Date().toISOString().slice(0, 10)
const chave = (cat: string, item: string) => `${cat}__${item}`

// Reparte o material já gravado (modo edição) entre checkboxes e texto livre.
function repartirMateriais(mats?: NotaMaterial[]): { sel: Set<string>; livres: string[] } {
  const sel = new Set<string>()
  const livres: string[] = []
  for (const m of mats ?? []) {
    if (!m.item) continue
    if (m.categoria === 'Outros acessórios') livres.push(m.item)
    else sel.add(chave(m.categoria ?? '', m.item))
  }
  return { sel, livres }
}

export default function NotaEncomendaForm({ inicial, materiaisIniciais, acoes, aGuardar, erro, onSubmit }: Props) {
  // Pedido
  const [dataPedido, setDataPedido] = useState(inicial?.data_pedido ?? hoje())

  // Cliente (lista completa carregada uma vez, para escolher/navegar)
  const [clientes, setClientes] = useState<ClienteOpc[]>([])
  const [clienteId, setClienteId] = useState<string | null>(inicial?.cliente_id ?? null)
  const [clienteNome, setClienteNome] = useState(inicial?.cliente_nome ?? '')
  const [paisDestino, setPaisDestino] = useState(inicial?.pais_destino ?? '')

  // Equipamento
  const [equipamentoId, setEquipamentoId] = useState<string | null>(inicial?.equipamento_id ?? null)
  const [equipamentoModelo, setEquipamentoModelo] = useState(inicial?.equipamento_modelo ?? '')
  const [equipamentoSn, setEquipamentoSn] = useState(inicial?.equipamento_sn ?? '')
  const [equipamentoAno, setEquipamentoAno] = useState(inicial?.equipamento_ano ?? '')
  const [marca, setMarca] = useState<string | null>(null)

  // Detalhes
  const [detalhes, setDetalhes] = useState(inicial?.detalhes_tecnicos ?? '')

  // Material (estado inicial reposto a partir do que já está gravado, em modo edição)
  const [inicialMat] = useState(() => repartirMateriais(materiaisIniciais))
  const [selecionados, setSelecionados] = useState<Set<string>>(inicialMat.sel)
  const [outros, setOutros] = useState<string[]>(inicialMat.livres)
  const [novoOutro, setNovoOutro] = useState('')

  // Capas e observações
  const [capas, setCapas] = useState<CapasOpcao | ''>(inicial?.capas ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')

  // Mostrar todas as categorias de material (não só as da marca do equipamento)
  const [mostrarTodasCats, setMostrarTodasCats] = useState(false)

  const [erroLocal, setErroLocal] = useState<string | null>(null)

  // Carrega a lista de clientes uma vez
  useEffect(() => {
    let activo = true
    listarClientes().then((cs) => { if (activo) setClientes(cs) })
    return () => { activo = false }
  }, [])

  // Pesquisa de clientes em memória (mostra todos ao focar; filtra ao escrever)
  const buscarCliente = useCallback(
    async (q: string): Promise<ClienteOpc[]> => {
      const t = q.trim().toLowerCase()
      const base = t ? clientes.filter((c) => c.nome.toLowerCase().includes(t)) : clientes
      return base.slice(0, 50)
    },
    [clientes]
  )

  // Pesquisa de países a partir da lista curada
  const buscarPais = useCallback(async (q: string): Promise<string[]> => {
    const t = q.trim().toLowerCase()
    const base = t ? PAISES.filter((p) => p.toLowerCase().includes(t)) : PAISES
    return base.slice(0, 50)
  }, [])

  function escolherCliente(c: ClienteOpc) {
    setClienteId(c.id)
    setClienteNome(c.nome)
    if (c.pais) setPaisDestino(c.pais)
  }

  function escolherEquipamento(e: EquipStockOpc) {
    setEquipamentoId(e.id)
    setEquipamentoModelo(e.modelo ?? '')
    setEquipamentoSn(e.serial_number ?? '')
    setEquipamentoAno(e.ano ?? '')
    setMarca(e.marca ?? null)
  }

  // Categorias a mostrar: todas (se o toggle estiver ligado) ou as da marca +
  // as que já têm itens selecionados (edição).
  const categoriasVisiveis = useMemo(() => {
    if (mostrarTodasCats) return CATEGORIAS_MATERIAL
    const daMarca = new Set(categoriasParaMarca(marca).map((c) => c.categoria))
    return CATEGORIAS_MATERIAL.filter((c) => {
      if (daMarca.has(c.categoria)) return true
      return c.itens.some((it) => selecionados.has(chave(c.categoria, it)))
    })
  }, [mostrarTodasCats, marca, selecionados])

  function alternarItem(cat: string, item: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      const k = chave(cat, item)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function adicionarOutro() {
    const v = novoOutro.trim()
    if (!v) return
    setOutros((prev) => (prev.includes(v) ? prev : [...prev, v]))
    setNovoOutro('')
  }

  function reunirMateriais(): MaterialEscolhido[] {
    const itens: MaterialEscolhido[] = []
    for (const cat of categoriasVisiveis) {
      for (const it of cat.itens) {
        if (selecionados.has(chave(cat.categoria, it))) itens.push({ categoria: cat.categoria, item: it })
      }
    }
    for (const o of outros) itens.push({ categoria: 'Outros acessórios', item: o })
    return itens
  }

  function submeter(emitir: boolean) {
    setErroLocal(null)
    if (!dataPedido) { setErroLocal('Indica a data do pedido.'); return }
    if (emitir && !equipamentoId) {
      setErroLocal('Para emitir, escolhe um equipamento em stock.')
      return
    }
    const input: NotaInput = {
      data_pedido: dataPedido,
      cliente_id: clienteId,
      cliente_nome: clienteNome.trim() || null,
      pais_destino: paisDestino.trim() || null,
      equipamento_id: equipamentoId,
      equipamento_modelo: equipamentoModelo.trim() || null,
      equipamento_sn: equipamentoSn.trim() || null,
      equipamento_ano: equipamentoAno.trim() || null,
      detalhes_tecnicos: detalhes.trim() || null,
      capas: capas || null,
      observacoes: observacoes.trim() || null,
      estado: inicial?.estado ?? 'emitida',
    }
    onSubmit(input, reunirMateriais(), emitir)
  }

  return (
    <div style={f.form}>
      {/* 1. Data do pedido */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Data do pedido</div>
        <Campo rotulo="Data do pedido *">
          <input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} style={f.input} />
        </Campo>
      </section>

      {/* 2. Cliente */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Cliente</div>
        <div style={f.grid2}>
          <Campo rotulo="Nome do cliente">
            <Autocomplete
              valor={clienteNome}
              placeholder="Escolher da lista ou escrever..."
              buscar={buscarCliente}
              onChangeTexto={(v) => { setClienteNome(v); setClienteId(null) }}
              onEscolher={escolherCliente}
              render={(c) => `${c.nome}${c.pais ? ` · ${c.pais}` : ''}`}
            />
          </Campo>
          <Campo rotulo="País de destino">
            <Autocomplete
              valor={paisDestino}
              placeholder="Escolher da lista ou escrever..."
              buscar={buscarPais}
              onChangeTexto={(v) => setPaisDestino(v)}
              onEscolher={(p) => setPaisDestino(p)}
              render={(p) => p}
            />
          </Campo>
        </div>
      </section>

      {/* 3. Equipamento */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Equipamento</div>
        <Campo rotulo="Pesquisar no stock (serial ou modelo)">
          <Autocomplete
            valor={equipamentoSn}
            placeholder="Serial number ou modelo (só equipamentos em stock)..."
            buscar={pesquisarEquipamentosStock}
            onChangeTexto={(v) => { setEquipamentoSn(v); setEquipamentoId(null) }}
            onEscolher={escolherEquipamento}
            render={(e) => `${e.serial_number ?? 's/ serial'} · ${e.modelo ?? 's/ modelo'}${e.marca ? ` · ${e.marca}` : ''}${e.ano ? ` · ${e.ano}` : ''}`}
          />
        </Campo>
        <div style={f.grid3}>
          <Campo rotulo="Modelo">
            <input value={equipamentoModelo} onChange={(e) => setEquipamentoModelo(e.target.value)} style={f.input} />
          </Campo>
          <Campo rotulo="Serial number">
            <input value={equipamentoSn} onChange={(e) => setEquipamentoSn(e.target.value)} style={f.input} />
          </Campo>
          <Campo rotulo="Ano">
            <input value={equipamentoAno} onChange={(e) => setEquipamentoAno(e.target.value)} style={f.input} />
          </Campo>
        </div>
      </section>

      {/* 4. Detalhes técnicos */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Detalhes técnicos</div>
        <Campo rotulo="Detalhes técnicos">
          <textarea value={detalhes} onChange={(e) => setDetalhes(e.target.value)} style={f.textarea} placeholder="Configuração, parâmetros, requisitos específicos..." />
        </Campo>
      </section>

      {/* 5. Material que acompanha */}
      <section style={f.seccao}>
        <div style={f.seccaoTituloLinha}>
          <span style={f.seccaoTitulo}>Material que acompanha</span>
          <label style={f.checkLabel}>
            <input type="checkbox" checked={mostrarTodasCats} onChange={(e) => setMostrarTodasCats(e.target.checked)} />
            Mostrar todas as categorias
          </label>
        </div>
        {!equipamentoId && !mostrarTodasCats && (
          <p style={f.ajuda}>Escolhe um equipamento para ver o material da marca, ou liga &quot;Mostrar todas as categorias&quot; para adicionar material de qualquer marca. O material comum e os outros acessórios estão sempre disponíveis.</p>
        )}
        {categoriasVisiveis.map((cat) => (
          <div key={cat.categoria} style={f.catBloco}>
            <div style={f.catTitulo}>{cat.categoria}</div>
            {cat.livre ? (
              <div style={f.outrosWrap}>
                <div style={f.chips}>
                  {outros.map((o) => (
                    <span key={o} style={f.chip}>
                      {o}
                      <button type="button" onClick={() => setOutros((prev) => prev.filter((x) => x !== o))} style={f.chipX} aria-label={`Remover ${o}`}>×</button>
                    </span>
                  ))}
                  {outros.length === 0 && <span style={f.ajuda}>Sem acessórios adicionais.</span>}
                </div>
                <div style={f.outrosLinha}>
                  <input
                    value={novoOutro}
                    onChange={(e) => setNovoOutro(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarOutro() } }}
                    placeholder="Adicionar acessório..."
                    style={{ ...f.input, flex: 1 }}
                  />
                  <button type="button" onClick={adicionarOutro} style={f.btnAdd}>Adicionar</button>
                </div>
              </div>
            ) : (
              <div style={f.checkGrid}>
                {cat.itens.map((it) => {
                  const k = chave(cat.categoria, it)
                  return (
                    <label key={it} style={f.checkItem}>
                      <input type="checkbox" checked={selecionados.has(k)} onChange={() => alternarItem(cat.categoria, it)} />
                      <span>{it}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 6. Capas */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Capas</div>
        <div style={f.radios}>
          {CAPAS_OPCOES.map((opc) => (
            <label key={opc} style={f.radioItem}>
              <input type="radio" name="capas" checked={capas === opc} onChange={() => setCapas(opc)} />
              <span>{opc}</span>
            </label>
          ))}
          {capas && (
            <button type="button" onClick={() => setCapas('')} style={f.limparRadio}>limpar</button>
          )}
        </div>
      </section>

      {/* 7. Observações */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Observações</div>
        <Campo rotulo="Observações">
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} style={f.textarea} />
        </Campo>
      </section>

      {(erroLocal || erro) && <div style={f.erro}>{erroLocal || erro}</div>}

      <div style={f.acoes}>
        {acoes.map((a) => (
          <button
            key={a.label}
            onClick={() => submeter(a.emitir)}
            disabled={aGuardar}
            style={a.destaque ? f.btnPrimario : f.btnSecundario}
          >
            {aGuardar ? 'A guardar...' : a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Autocomplete genérico (texto livre + sugestões) ────────────────────────
function Autocomplete<T>({
  valor, placeholder, buscar, onChangeTexto, onEscolher, render,
}: {
  valor: string
  placeholder?: string
  buscar: (q: string) => Promise<T[]>
  onChangeTexto: (v: string) => void
  onEscolher: (item: T) => void
  render: (item: T) => string
}) {
  const [resultados, setResultados] = useState<T[]>([])
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const q = valor
    const t = setTimeout(async () => {
      const r = await buscar(q)
      setResultados(r)
    }, 250)
    return () => clearTimeout(t)
  }, [valor, buscar])

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={valor}
        placeholder={placeholder}
        onChange={(e) => { onChangeTexto(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        style={f.input}
      />
      {aberto && resultados.length > 0 && (
        <div style={f.dropdown}>
          {resultados.map((item, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onEscolher(item); setAberto(false) }}
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
  return (
    <label style={f.campo}>
      <span style={f.rotulo}>{rotulo}</span>
      {children}
    </label>
  )
}

const f: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  seccao: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  seccaoTitulo: { fontSize: 14, fontWeight: 700, color: 'var(--primary)' },
  seccaoTituloLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600, cursor: 'pointer' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
  textarea: { width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  ajuda: { fontSize: 13, color: 'var(--muted)', margin: 0 },
  catBloco: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 },
  catTitulo: { fontSize: 13, fontWeight: 700, color: 'var(--foreground)', borderBottom: '1px solid var(--border)', paddingBottom: 4 },
  checkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6 },
  checkItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--foreground)', cursor: 'pointer' },
  outrosWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 6px 4px 12px', fontSize: 13 },
  chipX: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--muted)' },
  outrosLinha: { display: 'flex', gap: 8 },
  btnAdd: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0 16px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  radios: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' },
  radioItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--foreground)', cursor: 'pointer' },
  limparRadio: { background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden' },
  opcao: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  acoes: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  btnSecundario: { background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '12px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 15 },
}
