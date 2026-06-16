export type Peca = {
  id: string
  nome: string
  marca: string | null
  grupo: string | null
  referencia: string | null
  quantidade: number
  notas: string | null
  created_at: string
  updated_at: string
}

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
