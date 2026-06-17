// Mapa de material que acompanha cada equipamento numa Nota de Encomenda.
//
// Lógica: quando o utilizador escolhe um equipamento, mostram-se os checkboxes
// relevantes para a MARCA desse equipamento, mais os itens "Comuns" (sempre) e
// "Outros acessórios" (sempre, em texto livre). A categoria Zimmer é um
// acessório que aparece para equipamentos Candela ou Cynosure.

export type CategoriaMaterial = {
  categoria: string
  // Marcas que ativam esta categoria. undefined = sempre visível.
  marcas?: string[]
  itens: string[]
  // true = secção de texto livre (sem itens pré-definidos), o utilizador escreve.
  livre?: boolean
}

export const CATEGORIAS_MATERIAL: CategoriaMaterial[] = [
  {
    categoria: 'Comuns',
    // sem marcas → sempre visível
    itens: ['Pedal', 'Óculos de técnica (2 un.)', 'Óculos rosto (1 un.)', 'Manual de Operador'],
  },
  {
    categoria: 'Candela',
    marcas: ['Candela'],
    itens: [
      'Criogénio',
      'Suporte de Fibra',
      'Fibra 18 mm',
      'Fibra 24 mm',
      'Candela Delivery System 1.5/3',
      'Candela Delivery System 6/8/10/12/15/18 mm',
      'Candela Delivery System 20/22/24 mm',
      'Delivery System MGL - 12/15/18 mm',
      '25 Lentes Gpro/Gmax',
      'Suporte lente (2 unidades)',
      '1 caixa de spots 12/15/18',
      '1 Caixa de Spots 20/22/24',
      '1 Caixa de Spots Vascular',
      '25 Lentes',
      '50 Lentes',
      'Candela EndCap 6/8/10',
      'Candela EndCap 12/15/18',
      'Candela EndCap 20/22/24',
      'Candela EndCap 1.5',
      'Candela EndCap 3',
    ],
  },
  {
    categoria: 'Cynosure Elite+',
    marcas: ['Cynosure'],
    itens: [
      'Cynosure Fibra c/ Delivery System',
      'Elite+ Distanciador - 3 mm',
      'Elite+ Distanciador - 5 mm',
      'Elite+ Distanciador - 7 mm',
      'Elite+ Distanciador - 10 mm',
      'Elite+ Distanciador - 12 mm',
      'Elite+ Distanciador - 15 mm',
      'Elite+ Distanciador - 18 mm',
      'Lentes Cynosure Elite+',
    ],
  },
  {
    categoria: 'Zimmer',
    // Acessório: mostrar para equipamentos Candela ou Cynosure
    marcas: ['Candela', 'Cynosure'],
    itens: [
      'Lingueta Gpro/Gmax para adaptar ao Zimmer',
      'Mangueira Zimmer 5',
      'Mangueira Zimmer 6',
      'Adaptador 3D Cryo 5',
      'Adaptador 3D Cryo 6',
    ],
  },
  {
    categoria: 'Alma Lasers',
    marcas: ['Alma Lasers'],
    itens: [
      'Peça de mão Diodo 1 cm',
      'Peça de mão Diodo 2 cm',
      'Peça de Mão Soprano ICE Alex',
      'Peça de Mão Soprano ICE Diodo',
      'Peça de Mão Harmony - Dye VL',
      'Peça de Mão Harmony - Clearlift',
      'Peça de Mão Harmony - ClearSkin',
    ],
  },
  {
    categoria: 'Outros acessórios',
    // sem marcas → sempre visível; texto livre
    itens: [],
    livre: true,
  },
]

// Uma marca corresponde a uma categoria quando o nome da marca do equipamento
// contém (sem distinção de maiúsculas) a marca-alvo. Ex.: marca "Cynosure" do
// equipamento ativa as categorias com 'Cynosure'.
function marcaCorresponde(marcaEquip: string | null | undefined, alvo: string): boolean {
  const m = (marcaEquip ?? '').trim().toLowerCase()
  if (!m) return false
  return m.includes(alvo.toLowerCase())
}

// Devolve as categorias a mostrar para a marca de um equipamento.
// Inclui sempre as categorias sem marcas (Comuns, Outros acessórios).
export function categoriasParaMarca(marcaEquip: string | null | undefined): CategoriaMaterial[] {
  return CATEGORIAS_MATERIAL.filter(
    (c) => !c.marcas || c.marcas.some((alvo) => marcaCorresponde(marcaEquip, alvo))
  )
}
