'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import AlugueresNav from '@/components/AlugueresNav'
import { parseNumeroPt } from '@/lib/alugueres'
import {
  TIPOS_ALUGUER,
  TIPOS_INTERNACIONAL,
  METODOS_PAGAMENTO,
  type Cliente,
  type Aluguer,
} from '@/types/aluguer'

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

// Soma k meses a uma data 'YYYY-MM-DD', mantendo o dia (ajusta se o mês for mais curto)
function adicionarMeses(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const alvo = new Date(y, m - 1 + k, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  const dt = new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimoDia))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function ehNacional(pais: string) {
  return pais.trim().toLowerCase() === 'portugal'
}

// Associa o nome do modelo (escrito de várias formas no stock) a um grupo de preço.
// Ignora maiúsculas, espaços e símbolos.
function grupoPreco(modelo: string): string | null {
  const n = modelo.toLowerCase().replace(/[^a-z]/g, '')
  if (!n) return null
  if (n.includes('maxpro')) return n.includes('plus') ? 'gentlemaxproplus' : 'gentlemaxpro'
  if (n.includes('gentlepro') && !n.includes('prou')) return 'gentlepro' // exclui Pro-U
  if (n.includes('soprano')) {
    if (n.includes('platinum')) return 'sopranoplatinum'
    if (n.includes('ice')) return 'sopranoice'
  }
  return null
}

type EquipResumo = {
  id: string
  marca: string | null
  modelo: string | null
  ano: string | null
  serial_number: string | null
}

export default function AlugueresPage() {
  const { session, perfil } = useAuth()
  const [modo, setModo] = useState<'entrega' | 'recolha'>('entrega')

  return (
    <main style={s.page}>
      <div style={s.cabecalho}>
        <h1 style={s.titulo}>Alugueres</h1>
        <Link href="/" style={s.voltar}>← Stock</Link>
      </div>

      <AlugueresNav />

      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(modo === 'entrega' ? s.tabAtiva : {}) }}
          onClick={() => setModo('entrega')}
        >
          Registar entrega
        </button>
        <button
          style={{ ...s.tab, ...(modo === 'recolha' ? s.tabAtiva : {}) }}
          onClick={() => setModo('recolha')}
        >
          Registar recolha
        </button>
      </div>

      {modo === 'entrega' ? (
        <FormEntrega uid={session?.user.id ?? null} nome={perfil?.nome ?? null} />
      ) : (
        <FormRecolha />
      )}
    </main>
  )
}

// ---------------------------------------------------------------- ENTREGA
function FormEntrega({ uid, nome }: { uid: string | null; nome: string | null }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cliente, setCliente] = useState('')
  const [pais, setPais] = useState('Portugal')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')

  const [serial, setSerial] = useState('')
  const [sugestoes, setSugestoes] = useState<EquipResumo[]>([])
  const [equipamentoId, setEquipamentoId] = useState<string | null>(null)
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [ano, setAno] = useState('')

  const [tipo, setTipo] = useState<string>('')
  const [valor, setValor] = useState('')
  const [metodo, setMetodo] = useState<string>('')
  const [dataEntrega, setDataEntrega] = useState(hoje())
  const [meses, setMeses] = useState('1')

  // Tabela de preços: chave `${grupo}|${tipo}` -> valor
  const [precos, setPrecos] = useState<Map<string, number>>(new Map())

  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('clientes')
      .select('*')
      .order('nome')
      .then(({ data }) => setClientes((data as Cliente[]) ?? []))
    supabase
      .from('precos_aluguer')
      .select('modelo_grupo, mercado, tipo_aluguer, valor')
      .then(({ data }) => {
        const m = new Map<string, number>()
        for (const r of (data ?? []) as { modelo_grupo: string; mercado: string; tipo_aluguer: string; valor: number }[]) {
          m.set(`${r.modelo_grupo}|${r.mercado}|${r.tipo_aluguer}`, Number(r.valor))
        }
        setPrecos(m)
      })
  }, [])

  // Cliente existente correspondente ao texto escrito
  const clienteExistente = clientes.find(
    (c) => c.nome.trim().toLowerCase() === cliente.trim().toLowerCase()
  )

  // Mercado do aluguer = pelo país do cliente (Portugal = nacional)
  const nacionalAtual = clienteExistente ? clienteExistente.nacional : ehNacional(pais)
  const mercado = nacionalAtual ? 'nacional' : 'internacional'
  const tiposDisponiveis: readonly string[] = nacionalAtual ? TIPOS_ALUGUER : TIPOS_INTERNACIONAL

  // Se mudar de mercado, o tipo escolhido pode deixar de existir → limpar
  // (ajuste de estado durante o render — ver https://react.dev/learn/you-might-not-need-an-effect)
  if (tipo && !tiposDisponiveis.includes(tipo)) setTipo('')

  // Valor sugerido pela tabela (modelo + mercado + tipo)
  const grupo = grupoPreco(modelo)
  const sugestao = grupo && tipo ? precos.get(`${grupo}|${mercado}|${tipo}`) : undefined

  // Preenche o valor com a sugestão quando ainda está vazio (só quando a sugestão muda)
  const [sugestaoAplicada, setSugestaoAplicada] = useState(sugestao)
  if (sugestao !== sugestaoAplicada) {
    setSugestaoAplicada(sugestao)
    if (sugestao !== undefined && valor.trim() === '') setValor(String(sugestao))
  }

  // Ao escolher o tipo, aplica a sugestão (pode ser ajustada depois)
  function escolherTipo(novo: string) {
    setTipo(novo)
    const sug = grupo ? precos.get(`${grupo}|${mercado}|${novo}`) : undefined
    if (sug !== undefined) setValor(String(sug))
  }

  // Pesquisa de serial no stock (preenche marca/modelo/ano)
  useEffect(() => {
    const q = serial.trim()
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setSugestoes([])
        return
      }
      const { data } = await supabase
        .from('equipamentos')
        .select('id, marca, modelo, ano, serial_number')
        .ilike('serial_number', `%${q}%`)
        .limit(8)
      const lista = (data as EquipResumo[]) ?? []
      setSugestoes(lista)
      const exato = lista.find(
        (e) => (e.serial_number ?? '').trim().toLowerCase() === q.toLowerCase()
      )
      if (exato) {
        setEquipamentoId(exato.id)
        setMarca(exato.marca ?? '')
        setModelo(exato.modelo ?? '')
        setAno(exato.ano ?? '')
      } else {
        setEquipamentoId(null)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [serial])

  async function guardar() {
    setErro(null)
    if (!cliente.trim()) return setErro('Indica o cliente.')
    if (!serial.trim()) return setErro('Indica o serial number.')
    if (!tipo) return setErro('Escolhe o tipo de aluguer.')
    const valorNum = parseNumeroPt(valor)
    if (valorNum === null) return setErro('Indica um valor válido.')
    if (!metodo) return setErro('Escolhe o método de pagamento.')

    setAGuardar(true)

    // 1) resolver / criar cliente
    let clienteId = clienteExistente?.id ?? null
    let nacional = clienteExistente?.nacional ?? ehNacional(pais)
    const clienteNome = clienteExistente?.nome ?? cliente.trim()

    if (!clienteId) {
      const { data: novo, error: e1 } = await supabase
        .from('clientes')
        .insert({ nome: cliente.trim(), pais: pais.trim() || 'Portugal', nacional: ehNacional(pais), email: clienteEmail.trim() || null, telefone: clienteTelefone.trim() || null })
        .select()
        .single()
      if (e1) {
        setAGuardar(false)
        return setErro('Erro a criar o cliente: ' + e1.message)
      }
      clienteId = (novo as Cliente).id
      nacional = (novo as Cliente).nacional
    }

    // 2) criar o(s) aluguer(es). Para vários meses, cria uma entrada por mês,
    // cada uma com a entrega no mesmo dia (08/06, 08/07, 08/08, ...).
    const nMeses = Math.max(1, Math.min(36, Math.round(Number(meses) || 1)))
    const entregaBase = dataEntrega || hoje()
    const linhas = Array.from({ length: nMeses }, (_, k) => ({
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      equipamento_id: equipamentoId,
      serial_number: serial.trim(),
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      ano: ano.trim() || null,
      tipo_aluguer: tipo,
      valor: valorNum,
      metodo_pagamento: metodo,
      nacional,
      data_entrega: adicionarMeses(entregaBase, k),
      data_recolha: null,
      criado_por: uid,
      criado_por_nome: nome,
    }))
    const { error: e2 } = await supabase.from('alugueres').insert(linhas)

    setAGuardar(false)
    if (e2) return setErro('Erro a registar o aluguer: ' + e2.message)

    setOkMsg(
      nMeses > 1
        ? `Entrega registada para ${clienteNome} (${serial.trim()}) — ${nMeses} meses criados.`
        : `Entrega registada para ${clienteNome} (${serial.trim()}).`
    )
    // limpar para o próximo registo
    setCliente('')
    setPais('Portugal')
    setClienteEmail('')
    setClienteTelefone('')
    setSerial('')
    setEquipamentoId(null)
    setMarca('')
    setModelo('')
    setAno('')
    setTipo('')
    setValor('')
    setMetodo('')
    setDataEntrega(hoje())
    setMeses('1')
    // recarregar clientes (pode ter sido criado um novo)
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClientes((data as Cliente[]) ?? []))
  }

  return (
    <div style={s.form}>
      {okMsg && <div style={s.ok}>{okMsg}</div>}
      {erro && <div style={s.erro}>{erro}</div>}

      <label style={s.label}>Cliente</label>
      <input
        style={s.input}
        list="lista-clientes"
        placeholder="Nome do cliente"
        value={cliente}
        onChange={(e) => setCliente(e.target.value)}
      />
      <datalist id="lista-clientes">
        {clientes.map((c) => (
          <option key={c.id} value={c.nome} />
        ))}
      </datalist>
      {clienteExistente ? (
        <div style={s.nota}>
          {clienteExistente.pais} · {clienteExistente.nacional ? 'Nacional' : 'Internacional'}
        </div>
      ) : cliente.trim() ? (
        <>
          <label style={s.label}>País (cliente novo)</label>
          <input
            style={s.input}
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            placeholder="Portugal"
          />
          <div style={s.nota}>{ehNacional(pais) ? 'Nacional' : 'Internacional'}</div>
          <label style={s.label}>Email (cliente novo)</label>
          <input style={s.input} type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} placeholder="email@cliente.com" />
          <label style={s.label}>Telefone (cliente novo)</label>
          <input style={s.input} type="tel" value={clienteTelefone} onChange={(e) => setClienteTelefone(e.target.value)} placeholder="+351 ..." />
        </>
      ) : null}

      <label style={s.label}>Serial number</label>
      <input
        style={s.input}
        list="lista-serials"
        placeholder="Serial do equipamento"
        value={serial}
        onChange={(e) => setSerial(e.target.value)}
      />
      <datalist id="lista-serials">
        {sugestoes.map((e) => (
          <option key={e.id} value={e.serial_number ?? ''}>
            {[e.modelo, e.marca].filter(Boolean).join(' ')}
          </option>
        ))}
      </datalist>
      {equipamentoId && <div style={s.nota}>✓ Encontrado no stock</div>}

      <div style={s.linha3}>
        <div>
          <label style={s.label}>Marca</label>
          <input style={s.input} value={marca} onChange={(e) => setMarca(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Modelo</label>
          <input style={s.input} value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Ano</label>
          <input style={s.input} value={ano} onChange={(e) => setAno(e.target.value)} />
        </div>
      </div>

      <label style={s.label}>
        Tipo de aluguer {!nacionalAtual && <span style={s.nota}>(internacional — contrato)</span>}
      </label>
      <select style={s.input} value={tipo} onChange={(e) => escolherTipo(e.target.value)}>
        <option value="">— escolher —</option>
        {tiposDisponiveis.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <div style={s.linha2}>
        <div>
          <label style={s.label}>Valor (€)</label>
          <input
            style={s.input}
            type="number"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          {sugestao !== undefined && (
            <div style={s.nota}>Preço de tabela: {sugestao}€ (podes ajustar)</div>
          )}
        </div>
        <div>
          <label style={s.label}>Método de pagamento</label>
          <select style={s.input} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="">— escolher —</option>
            {METODOS_PAGAMENTO.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={s.linha2}>
        <div>
          <label style={s.label}>Data de entrega</label>
          <input style={s.input} type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
        </div>
        <div>
          <label style={s.label}>Número de meses</label>
          <input
            style={s.input}
            type="number"
            min={1}
            max={36}
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
          />
          {Number(meses) > 1 && (
            <div style={s.nota}>Cria {Math.round(Number(meses))} entradas (uma por mês, no mesmo dia).</div>
          )}
        </div>
      </div>

      <button style={{ ...s.botao, opacity: aGuardar ? 0.6 : 1 }} disabled={aGuardar} onClick={guardar}>
        {aGuardar ? 'A guardar...' : 'Registar entrega'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- RECOLHA
function FormRecolha() {
  const [abertos, setAbertos] = useState<Aluguer[]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [dataRecolha, setDataRecolha] = useState(hoje())
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  async function carregar() {
    const { data } = await supabase
      .from('alugueres')
      .select('*')
      .is('data_recolha', null)
      .order('data_entrega', { ascending: true })
    setAbertos((data as Aluguer[]) ?? [])
  }

  useEffect(() => {
    // Carregamento inicial — setAbertos só corre após o await, dentro de carregar()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  async function guardar() {
    if (!selecionado) return setErro('Escolhe o aluguer a fechar.')
    setErro(null)
    setAGuardar(true)
    const { error } = await supabase
      .from('alugueres')
      .update({ data_recolha: dataRecolha || hoje(), updated_at: new Date().toISOString() })
      .eq('id', selecionado)
    setAGuardar(false)
    if (error) return setErro('Erro a registar a recolha: ' + error.message)
    setOkMsg('Recolha registada.')
    setSelecionado(null)
    setDataRecolha(hoje())
    carregar()
  }

  return (
    <div style={s.form}>
      {okMsg && <div style={s.ok}>{okMsg}</div>}
      {erro && <div style={s.erro}>{erro}</div>}

      <label style={s.label}>Alugueres em curso (por devolver)</label>
      {abertos.length === 0 ? (
        <div style={s.nota}>Não há alugueres em aberto.</div>
      ) : (
        <div style={s.listaAbertos}>
          {abertos.map((a) => (
            <button
              key={a.id}
              style={{ ...s.itemAberto, ...(selecionado === a.id ? s.itemSelecionado : {}) }}
              onClick={() => setSelecionado(a.id)}
            >
              <strong>{a.cliente_nome ?? '—'}</strong>
              <span style={s.itemDetalhe}>
                {[a.modelo, a.serial_number].filter(Boolean).join(' · ')} · entrega {a.data_entrega}
              </span>
            </button>
          ))}
        </div>
      )}

      {selecionado && (
        <>
          <label style={s.label}>Data de recolha</label>
          <input style={s.input} type="date" value={dataRecolha} onChange={(e) => setDataRecolha(e.target.value)} />
          <button style={{ ...s.botao, opacity: aGuardar ? 0.6 : 1 }} disabled={aGuardar} onClick={guardar}>
            {aGuardar ? 'A guardar...' : 'Registar recolha'}
          </button>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 680, margin: '0 auto', padding: 20 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  titulo: { fontSize: 22, fontWeight: 700, color: 'var(--primary)' },
  voltar: { color: 'var(--muted)', textDecoration: 'none' },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tab: { flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)' },
  tabAtiva: { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' },
  form: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontWeight: 600, fontSize: 14, marginTop: 12, marginBottom: 4 },
  input: { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  linha2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  linha3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  nota: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  botao: { marginTop: 20, padding: 14, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  ok: { background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: 12, marginBottom: 8, color: '#2e7d32' },
  erro: { background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 8, padding: 12, marginBottom: 8, color: '#c62828' },
  listaAbertos: { display: 'flex', flexDirection: 'column', gap: 6 },
  itemAberto: { textAlign: 'left', padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 },
  itemSelecionado: { borderColor: 'var(--primary)', background: 'var(--accent-bg)' },
  itemDetalhe: { fontSize: 13, color: 'var(--muted)' },
}
