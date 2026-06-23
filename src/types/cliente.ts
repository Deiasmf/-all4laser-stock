// Ficha de cliente do CRM (Comercial). Espelha a tabela `clientes`.

export type TipoCliente = 'Clínica' | 'Médico' | 'Distribuidor' | 'Outro'

export const TIPO_CLIENTE_OPCOES: TipoCliente[] = ['Clínica', 'Médico', 'Distribuidor', 'Outro']

export type Cliente = {
  id: string
  nome: string
  pais: string
  nacional: boolean
  email: string | null
  telefone: string | null
  contacto_nome: string | null
  nif: string | null
  morada: string | null
  cidade: string | null
  codigo_postal: string | null
  tipo: TipoCliente | null
  observacoes: string | null
  created_at: string
  atualizado_em: string | null
}

// Campos editáveis na ficha (tudo menos id/created_at/atualizado_em).
export type ClienteInput = {
  nome: string
  pais: string
  email: string | null
  telefone: string | null
  contacto_nome: string | null
  nif: string | null
  morada: string | null
  cidade: string | null
  codigo_postal: string | null
  tipo: TipoCliente | null
  observacoes: string | null
}

// Linhas do histórico (alugueres, reservas, notas de encomenda, contratos).
export type HistoricoItem = {
  tipo: 'aluguer' | 'reserva' | 'nota' | 'contrato'
  id: string
  titulo: string        // ex.: modelo ou nº da nota
  detalhe: string       // estado / datas
  data: string | null   // data principal (para ordenar)
  href: string | null   // link para abrir o registo, quando existe
}
