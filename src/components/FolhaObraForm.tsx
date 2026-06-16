'use client'

import { useEffect, useState } from 'react'
import {
  listarTecnicos, pesquisarClientes, pesquisarEquipamentos,
  type TecnicoOpc, type ClienteOpc, type EquipOpc,
} from '@/lib/folhasObra'
import {
  TIPOS_SERVICO, ESTADO_FOLHA_OPCOES, ESTADO_FOLHA_CONFIG, ehCandelaAlex,
  type FolhaObra, type FolhaInput, type TipoServico, type EstadoFolha,
} from '@/types/folhaObra'

type Props = {
  inicial?: FolhaObra | null
  submitLabel: string
  aGuardar: boolean
  erro: string | null
  onSubmit: (input: FolhaInput) => void
}

const hoje = () => new Date().toISOString().slice(0, 10)
const numOuNull = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s))

export default function FolhaObraForm({ inicial, submitLabel, aGuardar, erro, onSubmit }: Props) {
  // Identificação
  const [dataIntervencao, setDataIntervencao] = useState(inicial?.data_intervencao ?? hoje())
  const [tipoServico, setTipoServico] = useState<TipoServico | ''>(inicial?.tipo_servico ?? '')
  const [estado, setEstado] = useState<EstadoFolha>(inicial?.estado ?? 'rascunho')

  // Técnico
  const [tecnicos, setTecnicos] = useState<TecnicoOpc[]>([])
  const [tecnicoId, setTecnicoId] = useState(inicial?.tecnico_id ?? '')

  // Cliente
  const [clienteId, setClienteId] = useState<string | null>(inicial?.cliente_id ?? null)
  const [clienteNome, setClienteNome] = useState(inicial?.cliente_nome ?? '')
  const [clientePais, setClientePais] = useState(inicial?.cliente_pais ?? '')

  // Equipamento
  const [equipamentoId, setEquipamentoId] = useState<string | null>(inicial?.equipamento_id ?? null)
  const [equipamentoModelo, setEquipamentoModelo] = useState(inicial?.equipamento_modelo ?? '')
  const [equipamentoSn, setEquipamentoSn] = useState(inicial?.equipamento_sn ?? '')
  const [equipamentoAno, setEquipamentoAno] = useState(inicial?.equipamento_ano ?? '')

  // Intervenção
  const [codigosErro, setCodigosErro] = useState(inicial?.codigos_erro ?? '')
  const [problema, setProblema] = useState(inicial?.problema_observado ?? '')
  const [trabalho, setTrabalho] = useState(inicial?.trabalho_realizado ?? '')

  // Candela Alex/Yag
  const [forcarAlex, setForcarAlex] = useState(
    inicial != null && (inicial.valor_cabeca_alex != null || inicial.valor_transmissao_alex != null)
  )
  const [valorCabeca, setValorCabeca] = useState(inicial?.valor_cabeca_alex?.toString() ?? '')
  const [valorTransmissao, setValorTransmissao] = useState(inicial?.valor_transmissao_alex?.toString() ?? '')

  // Material e notas
  const [material, setMaterial] = useState(inicial?.material_utilizado ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')

  const [erroLocal, setErroLocal] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    listarTecnicos().then((t) => { if (activo) setTecnicos(t) })
    return () => { activo = false }
  }, [])

  const mostrarAlex = forcarAlex || ehCandelaAlex(equipamentoModelo)

  function escolherCliente(c: ClienteOpc) {
    setClienteId(c.id)
    setClienteNome(c.nome)
    if (c.pais) setClientePais(c.pais)
  }

  function escolherEquipamento(e: EquipOpc) {
    setEquipamentoId(e.id)
    setEquipamentoModelo(e.modelo ?? '')
    setEquipamentoSn(e.serial_number ?? '')
    setEquipamentoAno(e.ano ?? '')
  }

  function submeter() {
    setErroLocal(null)
    if (!dataIntervencao) { setErroLocal('Indica a data da intervenção.'); return }
    const tecnico = tecnicos.find((t) => t.id === tecnicoId)
    const input: FolhaInput = {
      data_intervencao: dataIntervencao,
      cliente_id: clienteId,
      cliente_nome: clienteNome.trim() || null,
      cliente_pais: clientePais.trim() || null,
      tecnico_id: tecnicoId || null,
      tecnico_nome: tecnico ? (tecnico.nome ?? tecnico.email) : null,
      tipo_servico: tipoServico || null,
      equipamento_id: equipamentoId,
      equipamento_modelo: equipamentoModelo.trim() || null,
      equipamento_sn: equipamentoSn.trim() || null,
      equipamento_ano: equipamentoAno.trim() || null,
      codigos_erro: codigosErro.trim() || null,
      problema_observado: problema.trim() || null,
      trabalho_realizado: trabalho.trim() || null,
      valor_cabeca_alex: mostrarAlex ? numOuNull(valorCabeca) : null,
      valor_transmissao_alex: mostrarAlex ? numOuNull(valorTransmissao) : null,
      material_utilizado: material.trim() || null,
      observacoes: observacoes.trim() || null,
      estado,
    }
    onSubmit(input)
  }

  return (
    <div style={f.form}>
      {/* Identificação */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Identificação</div>
        <div style={f.grid2}>
          <Campo rotulo="Data da intervenção *">
            <input type="date" value={dataIntervencao} onChange={(e) => setDataIntervencao(e.target.value)} style={f.input} />
          </Campo>
          <Campo rotulo="Tipo de serviço">
            <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value as TipoServico | '')} style={f.input}>
              <option value="">—</option>
              {TIPOS_SERVICO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Técnico">
            <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} style={f.input}>
              <option value="">—</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome ?? t.email}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFolha)} style={f.input}>
              {ESTADO_FOLHA_OPCOES.map((e) => <option key={e} value={e}>{ESTADO_FOLHA_CONFIG[e].label}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      {/* Cliente */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Cliente</div>
        <div style={f.grid2}>
          <Campo rotulo="Nome do cliente">
            <Autocomplete
              valor={clienteNome}
              placeholder="Pesquisar ou escrever..."
              buscar={pesquisarClientes}
              onChangeTexto={(v) => { setClienteNome(v); setClienteId(null) }}
              onEscolher={escolherCliente}
              render={(c) => `${c.nome}${c.pais ? ` · ${c.pais}` : ''}`}
            />
          </Campo>
          <Campo rotulo="País">
            <input value={clientePais} onChange={(e) => setClientePais(e.target.value)} style={f.input} placeholder="Ex: Portugal" />
          </Campo>
        </div>
      </section>

      {/* Equipamento */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Equipamento</div>
        <Campo rotulo="Pesquisar no stock (serial ou modelo)">
          <Autocomplete
            valor={equipamentoSn}
            placeholder="Serial number ou modelo..."
            buscar={pesquisarEquipamentos}
            onChangeTexto={(v) => { setEquipamentoSn(v); setEquipamentoId(null) }}
            onEscolher={escolherEquipamento}
            render={(e) => `${e.serial_number ?? 's/ serial'} · ${e.modelo ?? 's/ modelo'}${e.ano ? ` · ${e.ano}` : ''}`}
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

      {/* Intervenção */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Intervenção</div>
        <Campo rotulo="Códigos de erro">
          <input value={codigosErro} onChange={(e) => setCodigosErro(e.target.value)} style={f.input} placeholder="Ex: E12, E45" />
        </Campo>
        <Campo rotulo="Problema observado">
          <textarea value={problema} onChange={(e) => setProblema(e.target.value)} style={f.textarea} />
        </Campo>
        <Campo rotulo="Trabalho realizado">
          <textarea value={trabalho} onChange={(e) => setTrabalho(e.target.value)} style={f.textarea} />
        </Campo>
      </section>

      {/* Valores Candela Alex/Yag (condicional) */}
      <section style={f.seccao}>
        <div style={f.seccaoTituloLinha}>
          <span style={f.seccaoTitulo}>Valores Candela Alex/Yag</span>
          <label style={f.checkLabel}>
            <input type="checkbox" checked={forcarAlex} onChange={(e) => setForcarAlex(e.target.checked)} />
            Aplicável
          </label>
        </div>
        {mostrarAlex ? (
          <div style={f.grid2}>
            <Campo rotulo="Valor da cabeça">
              <input type="number" value={valorCabeca} onChange={(e) => setValorCabeca(e.target.value)} style={f.input} />
            </Campo>
            <Campo rotulo="Valor da transmissão">
              <input type="number" value={valorTransmissao} onChange={(e) => setValorTransmissao(e.target.value)} style={f.input} />
            </Campo>
          </div>
        ) : (
          <p style={f.ajuda}>Só para equipamentos Candela Alex/Yag. Marca &quot;Aplicável&quot; (ou escolhe um modelo Alex/Yag) para preencher.</p>
        )}
      </section>

      {/* Material e observações */}
      <section style={f.seccao}>
        <div style={f.seccaoTitulo}>Material e observações</div>
        <Campo rotulo="Material utilizado">
          <textarea value={material} onChange={(e) => setMaterial(e.target.value)} style={f.textarea} placeholder="Peças/consumíveis usados..." />
        </Campo>
        <Campo rotulo="Observações">
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} style={f.textarea} />
        </Campo>
      </section>

      {(erroLocal || erro) && <div style={f.erro}>{erroLocal || erro}</div>}

      <div style={f.acoes}>
        <button onClick={submeter} disabled={aGuardar} style={f.btnPrimario}>
          {aGuardar ? 'A guardar...' : submitLabel}
        </button>
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
  seccaoTituloLinha: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 13, fontWeight: 600, color: 'var(--muted)' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit' },
  textarea: { width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', color: 'var(--foreground)', font: 'inherit', resize: 'vertical' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 },
  ajuda: { fontSize: 13, color: 'var(--muted)', margin: 0 },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden' },
  opcao: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', font: 'inherit', color: 'var(--foreground)' },
  erro: { background: '#fbecea', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontWeight: 600 },
  acoes: { display: 'flex', gap: 10 },
  btnPrimario: { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
}
