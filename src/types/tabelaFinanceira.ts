// Tipos do módulo Financeiro → Folhas de Cálculo (tabelas criadas na app).

export type ColunaTabela = { id: string; nome: string }

// Uma linha é um mapa coluna_id → valor (texto livre).
export type LinhaTabela = Record<string, string>

export type TabelaFinanceira = {
  id: string
  nome: string
  colunas: ColunaTabela[]
  linhas: LinhaTabela[]
  notas: string | null
  ficheiro_url: string | null
  ficheiro_caminho: string | null
  ficheiro_nome: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

// Gera um id curto e único para colunas novas.
export function novoIdColuna(existentes: ColunaTabela[]): string {
  let n = existentes.length + 1
  const ids = new Set(existentes.map((c) => c.id))
  let id = `c${n}`
  while (ids.has(id)) { n++; id = `c${n}` }
  return id
}

// Estrutura inicial de uma tabela nova: 3 colunas × 3 linhas vazias.
export function estruturaInicial(): { colunas: ColunaTabela[]; linhas: LinhaTabela[] } {
  const colunas: ColunaTabela[] = [
    { id: 'c1', nome: 'Descrição' },
    { id: 'c2', nome: 'Quantidade' },
    { id: 'c3', nome: 'Valor' },
  ]
  const linhas: LinhaTabela[] = [{}, {}, {}]
  return { colunas, linhas }
}

export function formatarData(d: string | null | undefined) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT')
}
