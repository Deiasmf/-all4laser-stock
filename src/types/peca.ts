export type Peca = {
  id: string
  nome: string
  marca: string | null
  grupo: string | null
  serial_number: string | null
  status: string | null
  status_reparacao: string | null   // 'aguarda_reparacao' quando entra por um processo/receção a aguardar reparação
  referencia: string | null
  preco_venda: number | null
  quantidade: number
  quantidade_reparacao: number       // unidades fora, em reparação num fornecedor (disponível = quantidade - quantidade_reparacao)
  notas: string | null
  localizacao: string | null
  stock_minimo_alerta1: number | null
  stock_minimo_alerta2: number | null
  created_at: string
  updated_at: string
}

// Estados possíveis de uma peça (usado no seletor e no filtro do stock de peças)
export const STATUS_PECA = ['Stock', 'Em Reparação', 'Avariado'] as const

// Linha de material (peça) usada numa folha de obra
export type FolhaMaterial = {
  id: string
  folha_id: string
  peca_id: string | null
  descricao: string | null
  quantidade: number
  created_at: string
}

// Material com os dados da peça associada (para listar)
export type FolhaMaterialComPeca = FolhaMaterial & {
  peca: Pick<Peca, 'nome' | 'marca' | 'grupo' | 'quantidade'> | null
}
