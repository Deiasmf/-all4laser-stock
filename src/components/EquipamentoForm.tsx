'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useFormDraft, RascunhoAviso } from '@/lib/useFormDraft'
import {
  CAMPOS_OBRIGATORIOS,
  ROTULO_OBRIGATORIO,
  type Equipamento,
} from '@/types/equipamento'
import styles from './equipamentoForm.module.css'

// Os 8 status oficiais (CLAUDE.md). Juntam-se aos que já existem nos dados.
const STATUS_OFICIAIS = [
  'Em stock',
  'Aluguer nacional',
  'Aluguer internacional',
  'Reservado',
  'Enviado',
  'Prep-Logística',
  'Prep-Técnico',
  'Peças',
]

export type FormState = Record<string, string>

const BUCKET_FATURAS = 'faturas'

// Lista de campos editáveis (HP foi removido do formulário; acrescentado acessorios)
const CAMPOS_EDITAVEIS = [
  'modelo', 'marca', 'serial_number', 'ano', 'origem', 'destino',
  'data_entrada', 'data_saida', 'status', 'original_upgraded',
  'valor_compra', 'preco_venda', 'fatura_compra', 'fatura_compra_url',
  'fatura_compra_caminho', 'fatura_saida',
  'awb_dau', 'awb_dau_caminho', 'nota_encomenda', 'nota_encomenda_caminho',
  'rentabilizacao', 'acessorios',
  'relatorio_tecnico', 'relatorio_tecnico_caminho', 'observacoes',
] as const

function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[^\w.\-]/g, '_')
}

// Converte um Equipamento da BD para strings editáveis
export function equipamentoParaForm(e: Equipamento): FormState {
  const f: FormState = {}
  for (const c of CAMPOS_EDITAVEIS) {
    const v = e[c as keyof Equipamento]
    f[c] = v === null || v === undefined ? '' : String(v)
  }
  return f
}

// Formulário em branco (com defaults úteis para registar chegadas)
export function formVazio(): FormState {
  const f: FormState = {}
  for (const c of CAMPOS_EDITAVEIS) f[c] = ''
  f.status = 'Em stock'
  f.data_entrada = new Date().toISOString().slice(0, 10) // hoje (YYYY-MM-DD)
  return f
}

// Converte o formulário para o objeto a gravar na BD (vazios -> null, números)
export function formParaPayload(form: FormState): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = {}
  for (const [k, v] of Object.entries(form)) {
    const vazio = v.trim() === ''
    if (k === 'valor_compra' || k === 'preco_venda') {
      payload[k] = vazio ? null : Number(v)
    } else {
      payload[k] = vazio ? null : v
    }
  }
  return payload
}

// ---- Campos definidos FORA do formulário (para o cursor não saltar) ----
type CampoTextoProps = {
  label: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
  obrigatorio?: boolean
  tipo?: string
}

function CampoTexto({ label, valor, aoMudar, erro, obrigatorio, tipo = 'text' }: CampoTextoProps) {
  return (
    <div className={styles.campo}>
      <label className={styles.label}>
        {label} {obrigatorio && <span className={styles.obrigatorio}>*</span>}
      </label>
      <input
        className={`${styles.input} ${erro ? styles.inputErro : ''}`}
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
      {erro && <div className={styles.mensagemErro}>{erro}</div>}
    </div>
  )
}

type CampoListaProps = CampoTextoProps & { opcoes: string[]; listId: string }

// Campo com sugestões (dropdown) mas que também aceita escrever valores novos
function CampoLista({ label, valor, aoMudar, opcoes, listId, erro, obrigatorio }: CampoListaProps) {
  return (
    <div className={styles.campo}>
      <label className={styles.label}>
        {label} {obrigatorio && <span className={styles.obrigatorio}>*</span>}
      </label>
      <input
        list={listId}
        className={`${styles.input} ${erro ? styles.inputErro : ''}`}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
      <datalist id={listId}>
        {opcoes.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {erro && <div className={styles.mensagemErro}>{erro}</div>}
    </div>
  )
}

// Anexo de ficheiro genérico (bucket privado `faturas`) — fatura, DAU, nota, relatório
function CampoFicheiro({
  label,
  caminho,
  aoMudar,
}: {
  label: string
  caminho: string
  aoMudar: (caminho: string) => void
}) {
  const [aCarregar, setACarregar] = useState(false)
  const [linkSeguro, setLinkSeguro] = useState<string | null>(null)

  // Gera link temporário seguro para ver o ficheiro (bucket privado)
  useEffect(() => {
    if (!caminho) return
    let activo = true
    supabase.storage
      .from(BUCKET_FATURAS)
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (activo) setLinkSeguro(data?.signedUrl ?? null)
      })
    return () => {
      activo = false
    }
  }, [caminho])

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const ficheiro = e.target.files?.[0]
    if (!ficheiro) return
    setACarregar(true)
    const novoCaminho = `${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_FATURAS).upload(novoCaminho, ficheiro)
    if (error) {
      alert('Erro a carregar o ficheiro: ' + error.message)
      setACarregar(false)
      return
    }
    aoMudar(novoCaminho)
    setACarregar(false)
  }

  async function remover() {
    if (caminho) await supabase.storage.from(BUCKET_FATURAS).remove([caminho])
    aoMudar('')
  }

  return (
    <div className={styles.campo}>
      <label className={styles.label}>{label}</label>
      {caminho ? (
        <div className={styles.anexoLinha}>
          <a href={linkSeguro ?? '#'} target="_blank" rel="noopener noreferrer" className={styles.anexoLink}>
            📄 Ver ficheiro
          </a>
          <button type="button" className={styles.anexoRemover} onClick={remover}>
            Remover
          </button>
        </div>
      ) : (
        <input
          type="file"
          accept="application/pdf,image/*"
          disabled={aCarregar}
          onChange={aoEscolher}
        />
      )}
      {aCarregar && <div className={styles.mensagemErro}>A carregar ficheiro...</div>}
    </div>
  )
}

type Props = {
  titulo: string
  textoBotao: string
  valoresIniciais: FormState
  urlCancelar: string
  // Recebe o payload pronto a gravar; devolve erro (string) ou null se OK
  aoGuardar: (payload: Record<string, string | number | null>) => Promise<string | null>
  // Quando definido, ativa o rascunho automático (usar só em modo "novo").
  rascunhoKey?: string
}

export default function EquipamentoForm({
  titulo,
  textoBotao,
  valoresIniciais,
  urlCancelar,
  aoGuardar,
  rascunhoKey,
}: Props) {
  const [form, setForm] = useState<FormState>(valoresIniciais)
  const [statusExistentes, setStatusExistentes] = useState<string[]>([])
  const [opcoes, setOpcoes] = useState<{
    marca: string[]; modelo: string[]; origem: string[]; destino: string[]; ano: string[]
  }>({ marca: [], modelo: [], origem: [], destino: [], ano: [] })
  // Modelos oficiais agrupados por marca (chave = nome da marca em minúsculas)
  const [modelosPorMarca, setModelosPorMarca] = useState<Map<string, string[]>>(new Map())
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({})

  // Carregar sugestões para os dropdowns (marcas/modelos oficiais + valores já existentes)
  useEffect(() => {
    async function carregar() {
      const { data: eqs } = await supabase
        .from('equipamentos')
        .select('marca, modelo, origem, destino, ano, status')
      const { data: marcasTab } = await supabase.from('marcas').select('nome')
      const { data: modelosTab } = await supabase
        .from('modelos')
        .select('nome, marcas(nome)')

      const distintos = (campo: 'marca' | 'modelo' | 'origem' | 'destino' | 'ano') =>
        Array.from(
          new Set((eqs ?? []).map((e) => e[campo] as string).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, 'pt'))

      const marcasOficiais = (marcasTab ?? []).map((m) => m.nome as string)
      const modelosOficiais = (modelosTab ?? []).map((m) => m.nome as string)

      // Agrupar modelos por marca
      const porMarca = new Map<string, string[]>()
      for (const m of modelosTab ?? []) {
        // a relação devolve um objeto { nome } (ou array, conforme versão) — tratar ambos
        const rel = (m as { marcas: { nome: string } | { nome: string }[] | null }).marcas
        const marcaNome = Array.isArray(rel) ? rel[0]?.nome : rel?.nome
        if (!marcaNome) continue
        const chave = marcaNome.toLowerCase()
        const lista = porMarca.get(chave) ?? []
        lista.push(m.nome as string)
        porMarca.set(chave, lista)
      }
      for (const [k, v] of porMarca) porMarca.set(k, v.sort((a, b) => a.localeCompare(b, 'pt')))
      setModelosPorMarca(porMarca)

      setOpcoes({
        marca: Array.from(new Set([...marcasOficiais, ...distintos('marca')])).sort((a, b) =>
          a.localeCompare(b, 'pt')
        ),
        modelo: Array.from(new Set([...modelosOficiais, ...distintos('modelo')])).sort((a, b) =>
          a.localeCompare(b, 'pt')
        ),
        origem: distintos('origem'),
        destino: distintos('destino'),
        ano: distintos('ano').sort((a, b) => b.localeCompare(a)), // anos por ordem decrescente
      })
      setStatusExistentes(
        Array.from(new Set((eqs ?? []).map((e) => e.status as string).filter(Boolean)))
      )
    }
    carregar()
  }, [])

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Rascunho automático (via rascunhoKey). Base = estado inicial (vazio em
  // "novo", valores da BD em edição) — não grava sem alterações e o "Descartar"
  // repõe o inicial.
  const baseline = useRef(form).current
  const { rascunhoRecuperado, descartar } = useFormDraft<FormState>(
    rascunhoKey ?? 'equipamento:novo', form, setForm,
    { enabled: !!rascunhoKey, emptyState: baseline }
  )

  function validar(f: FormState): Record<string, string> {
    const e: Record<string, string> = {}
    // Campos obrigatórios — fonte única de verdade em @/types/equipamento
    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (!(f[campo] ?? '').trim()) {
        e[campo] = `${ROTULO_OBRIGATORIO[campo]} é de preenchimento obrigatório.`
      }
    }
    // Valores não são obrigatórios, mas se preenchidos têm de ser números
    if (f.valor_compra.trim() && isNaN(Number(f.valor_compra)))
      e.valor_compra = 'Tem de ser um número.'
    if (f.preco_venda.trim() && isNaN(Number(f.preco_venda)))
      e.preco_venda = 'Tem de ser um número.'
    return e
  }

  async function guardar() {
    const erros = validar(form)
    setErrosCampos(erros)
    if (Object.keys(erros).length > 0) {
      setErro('Há campos por corrigir antes de guardar.')
      return
    }
    setAGuardar(true)
    setErro(null)
    const msgErro = await aoGuardar(formParaPayload(form))
    setAGuardar(false)
    if (msgErro) setErro(msgErro)
  }

  // Original/Upgraded só se aplica aos modelos Pro-U (Gentle Pro-U / Gentle Yag Pro-U)
  const mostrarUpgraded = form.modelo.toLowerCase().replace(/\s/g, '').includes('pro-u')
  const statusOpcoes = Array.from(
    new Set([...STATUS_OFICIAIS, ...statusExistentes, form.status].filter(Boolean))
  )

  // Modelos a sugerir: os da marca escolhida; se a marca não for reconhecida, mostra todos
  const modelosDaMarca = modelosPorMarca.get(form.marca.trim().toLowerCase())
  const opcoesModelo = modelosDaMarca && modelosDaMarca.length > 0 ? modelosDaMarca : opcoes.modelo

  return (
    <>
      <div className={styles.titulo}>{titulo}</div>

      {erro && <div className={styles.avisoTopo}>{erro}</div>}
      {rascunhoRecuperado && (
        <div style={{ marginBottom: 12 }}>
          <RascunhoAviso onDescartar={descartar} />
        </div>
      )}

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Identificação</div>
        <CampoLista label="Marca" listId="lista-marca" opcoes={opcoes.marca} valor={form.marca} aoMudar={(v) => set('marca', v)} erro={errosCampos.marca} />
        <CampoLista label="Modelo" listId="lista-modelo" opcoes={opcoesModelo} valor={form.modelo} aoMudar={(v) => set('modelo', v)} erro={errosCampos.modelo} obrigatorio />
        <CampoTexto label="Serial Number" valor={form.serial_number} aoMudar={(v) => set('serial_number', v)} erro={errosCampos.serial_number} obrigatorio />
        <CampoLista label="Ano" listId="lista-ano" opcoes={opcoes.ano} valor={form.ano} aoMudar={(v) => set('ano', v)} erro={errosCampos.ano} obrigatorio />

        <CampoLista
          label="Status"
          listId="lista-status"
          opcoes={statusOpcoes}
          valor={form.status}
          aoMudar={(v) => set('status', v)}
          erro={errosCampos.status}
          obrigatorio
        />

        <CampoTexto label="Acessórios" valor={form.acessorios} aoMudar={(v) => set('acessorios', v)} />

        {mostrarUpgraded && (
          <CampoTexto label="Original/Upgraded" valor={form.original_upgraded} aoMudar={(v) => set('original_upgraded', v)} />
        )}
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Movimento</div>
        <CampoLista label="Origem" listId="lista-origem" opcoes={opcoes.origem} valor={form.origem} aoMudar={(v) => set('origem', v)} />
        <CampoLista label="Destino" listId="lista-destino" opcoes={opcoes.destino} valor={form.destino} aoMudar={(v) => set('destino', v)} />
        <CampoTexto label="Data de entrada" tipo="date" valor={form.data_entrada} aoMudar={(v) => set('data_entrada', v)} erro={errosCampos.data_entrada} obrigatorio />
        <CampoTexto label="Data de saída" tipo="date" valor={form.data_saida} aoMudar={(v) => set('data_saida', v)} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Valores</div>
        <CampoTexto label="Valor de compra (€)" tipo="number" valor={form.valor_compra} aoMudar={(v) => set('valor_compra', v)} erro={errosCampos.valor_compra} />
        <CampoTexto label="Preço de venda (€)" tipo="number" valor={form.preco_venda} aoMudar={(v) => set('preco_venda', v)} erro={errosCampos.preco_venda} />
        <CampoTexto label="Rentabilização" valor={form.rentabilizacao} aoMudar={(v) => set('rentabilizacao', v)} />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Documentos</div>
        <CampoTexto label="Fatura de compra (nº/referência)" valor={form.fatura_compra} aoMudar={(v) => set('fatura_compra', v)} />
        <CampoFicheiro
          label="Ficheiro da fatura de compra (PDF ou foto)"
          caminho={form.fatura_compra_caminho}
          aoMudar={(c) => {
            set('fatura_compra_url', c)
            set('fatura_compra_caminho', c)
          }}
        />
        <CampoTexto label="Fatura de saída" valor={form.fatura_saida} aoMudar={(v) => set('fatura_saida', v)} />
        <CampoFicheiro
          label="AWB + DAU (PDF ou foto)"
          caminho={form.awb_dau_caminho}
          aoMudar={(c) => set('awb_dau_caminho', c)}
        />
        <CampoFicheiro
          label="Nota de encomenda (PDF ou foto)"
          caminho={form.nota_encomenda_caminho}
          aoMudar={(c) => set('nota_encomenda_caminho', c)}
        />
        <CampoFicheiro
          label="Relatório técnico (PDF ou foto)"
          caminho={form.relatorio_tecnico_caminho}
          aoMudar={(c) => set('relatorio_tecnico_caminho', c)}
        />
      </div>

      <div className={styles.seccao}>
        <div className={styles.seccaoTitulo}>Observações</div>
        <div className={styles.campo}>
          <label className={styles.label}>Observações</label>
          <textarea
            className={styles.textarea}
            value={form.observacoes}
            onChange={(e) => set('observacoes', e.target.value)}
          />
        </div>
      </div>

      <div className={styles.acoes}>
        <button className={styles.btnGuardar} onClick={guardar} disabled={aGuardar}>
          {aGuardar ? 'A guardar...' : textoBotao}
        </button>
        <a className={styles.btnCancelar} href={urlCancelar}>
          Cancelar
        </a>
      </div>
    </>
  )
}
