// Tipos do módulo Despesas de Alugueres (cliente + servidor). Puro, sem
// dependências de servidor, para poder ser usado no ecrã de confirmação.

export type Confianca = 'alta' | 'media' | 'baixa'

// Campos que a IA lê do talão/fatura.
export type CampoDespesa = 'fornecedor' | 'data_despesa' | 'valor' | 'iva' | 'num_documento'
export const CAMPOS_DESPESA: CampoDespesa[] = ['fornecedor', 'data_despesa', 'valor', 'iva', 'num_documento']

// Resultado bruto da extração (o que a IA leu do documento).
export type DespesaExtraida = {
  fornecedor: string | null
  data_despesa: string | null   // ISO yyyy-mm-dd
  valor: number | null
  iva: number | null
  num_documento: string | null
  confianca: Partial<Record<CampoDespesa, Confianca>>
}

// Resposta do endpoint de extração para o ecrã de confirmação.
export type RespostaExtracaoDespesa = {
  ok: boolean
  parcial: boolean               // extração falhou / baixa confiança nos campos críticos
  erro: string | null
  extraido: DespesaExtraida
  confianca: Partial<Record<CampoDespesa, Confianca>>
  avisos: string[]
}

// ─── Linhas da base de dados ─────────────────────────────────────────────────

export type EstadoDespesa = 'registada' | 'conferida'
export type TipoFundo = 'entrada' | 'entrega'

export type DespesaTipo = {
  id: string
  nome: string
  estado: 'aprovado' | 'pendente'
  fundido_em: string | null
  criado_por: string | null
  criado_por_nome: string | null
  ordem: number
  created_at: string
}

export type Despesa = {
  id: string
  colaborador_id: string
  colaborador_nome: string | null
  tipo_id: string | null
  fornecedor: string | null
  data_despesa: string
  valor: number
  iva: number | null
  num_documento: string | null
  cliente_id: string | null
  aluguer_ref: string | null
  nota: string | null
  estado: EstadoDespesa
  mes_apuramento: string
  registado_apos_fecho: boolean
  conferida_por: string | null
  conferida_por_nome: string | null
  conferida_em: string | null
  created_at: string
  updated_at: string
}

export type DespesaFoto = { id: string; despesa_id: string; caminho: string; ordem: number; created_at: string }

export type Fundo = {
  id: string
  colaborador_id: string
  colaborador_nome: string | null
  tipo: TipoFundo
  valor: number
  data: string
  cliente_id: string | null
  aluguer_ref: string | null
  nota: string | null
  mes_apuramento: string
  registado_apos_fecho: boolean
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
}

// Campos editáveis no formulário de despesa (o resto é gerido pela BD/triggers).
export type DespesaInput = {
  tipo_id: string | null
  fornecedor: string | null
  data_despesa: string
  valor: number
  iva: number | null
  num_documento: string | null
  cliente_id: string | null
  aluguer_ref: string | null
  nota: string | null
}

export type FundoInput = {
  tipo: TipoFundo
  valor: number
  data: string
  cliente_id: string | null
  aluguer_ref: string | null
  nota: string | null
}

// Extrato mensal de fundos de um colaborador.
export type ExtratoMes = {
  recebido: number    // entradas (recebeu do cliente)
  despesas: number    // total de despesas do mês
  entregue: number    // entregas em caixa
  apuramento: number  // recebido − despesas − entregue (0 = contas certas)
}

// Aluguer ativo para o dropdown (cliente + rótulo livre).
export type AluguerAtivoOpc = { cliente_id: string | null; cliente_nome: string; label: string }

// Apuramento de um colaborador num mês (linha do mapa).
export type ApuramentoColaborador = {
  colaborador_id: string
  colaborador_nome: string
  recebido: number
  porTipo: Record<string, number>   // nome do tipo → total de despesas
  despesas: number
  entregue: number
  apuramento: number                // recebido − despesas − entregue (0 = contas certas)
}
