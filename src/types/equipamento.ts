export type Equipamento = {
  id: string
  modelo: string | null
  marca: string | null
  serial_number: string | null
  ano: string | null
  origem: string | null
  destino: string | null
  data_entrada: string | null
  data_saida: string | null
  status: string | null
  original_upgraded: string | null
  valor_compra: number | null
  preco_venda: number | null
  fatura_compra: string | null
  fatura_compra_url: string | null
  fatura_compra_caminho: string | null
  fatura_saida: string | null
  awb_dau: string | null
  awb_dau_caminho: string | null
  nota_encomenda: string | null
  nota_encomenda_caminho: string | null
  rentabilizacao: string | null
  hp: string | null
  acessorios: string | null
  relatorio_tecnico: string | null
  relatorio_tecnico_caminho: string | null
  observacoes: string | null
  criado_por: string | null
  criado_por_nome: string | null
  saida_por: string | null
  saida_por_nome: string | null
  created_at: string
  updated_at: string
}

// Campos obrigatórios — usados para mostrar avisos de informação em falta
export const CAMPOS_OBRIGATORIOS: (keyof Equipamento)[] = [
  'modelo',
  'serial_number',
  'ano',
  'data_entrada',
  'status',
]

// Nome legível de cada campo obrigatório
export const ROTULO_OBRIGATORIO: Record<string, string> = {
  modelo: 'Modelo',
  serial_number: 'Serial Number',
  ano: 'Ano',
  data_entrada: 'Data de entrada',
  status: 'Status',
}

// Devolve a lista de campos obrigatórios em falta num equipamento
export function camposEmFalta(e: Equipamento): string[] {
  return CAMPOS_OBRIGATORIOS.filter((campo) => {
    const v = e[campo]
    return v === null || v === undefined || v === ''
  })
}
