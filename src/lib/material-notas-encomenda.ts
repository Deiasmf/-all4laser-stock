// Catálogo de material que acompanha um equipamento numa Nota de Encomenda.
//
// Estrutura plana de itens. Cada item tem uma categoria e, opcionalmente, uma
// subcategoria (apenas para agrupar visualmente no formulário — NÃO é gravada:
// a BD guarda categoria + item). A lógica de visibilidade é por marca do
// equipamento: mostram-se sempre os itens "Comuns" e, para a marca escolhida,
// as categorias correspondentes.

export type MaterialItem = {
  categoria: string
  subcategoria?: string
  item: string
}

export const MATERIAIS: MaterialItem[] = [
  // ─── Comuns (sempre visíveis, independentemente da marca) ─────────────────
  { categoria: 'Comuns', item: 'Pedal' },
  { categoria: 'Comuns', item: 'Chaves' },
  { categoria: 'Comuns', item: '1 x Óculos de técnica' },
  { categoria: 'Comuns', item: '1 x Óculos rosto' },
  { categoria: 'Comuns', item: 'Manual de Operador' },

  // ─── Candela ──────────────────────────────────────────────────────────────
  { categoria: 'Candela', subcategoria: 'Criogénio', item: 'Criogénio' },

  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'DCD' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'ACC' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Suporte de Fibra' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Suporte Lateral' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Fibra 12/15/18 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Fibra 20/22/24 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Fibra GLX 12-26 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Candela Delivery System 6/8/10/12/15/18 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Candela Delivery System 20/22/24 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Candela Delivery System 1.5/3' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Candela Delivery System GLX' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Delivery System GLX - GMPP - 12-26 mm' },
  { categoria: 'Candela', subcategoria: 'Fibra e Delivery System', item: 'Delivery System GMPP - 1.5/3 mm' },

  { categoria: 'Candela', subcategoria: 'EndCaps', item: 'Candela EndCap 1.5/3' },
  { categoria: 'Candela', subcategoria: 'EndCaps', item: 'Candela EndCap 6/8/10' },
  { categoria: 'Candela', subcategoria: 'EndCaps', item: 'Candela EndCap 12/15/18' },
  { categoria: 'Candela', subcategoria: 'EndCaps', item: 'Candela EndCap 20/22/24' },
  { categoria: 'Candela', subcategoria: 'EndCaps', item: 'Candela EndCap 26 mm' },

  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '1 Caixa de Spots 12/15/18' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '1 Caixa de Spots 20/22/24' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '1 Caixa de Spots 26 mm' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '1 Caixa de Spots 1.5/3' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '10 Lentes Gpro/Gmax Pro' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: '25 Lentes Gpro/Gmax Pro' },
  { categoria: 'Candela', subcategoria: 'Spots e Lentes', item: 'Suporte lente (2 unidades)' },

  // ─── Cynosure Elite+ ────────────────────────────────────────────────────────
  { categoria: 'Cynosure Elite+', item: 'Cynosure Fibra c/ Delivery System' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 3 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 5 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 7 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 10 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 12 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 15 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 18 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 20 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 22 mm' },
  { categoria: 'Cynosure Elite+', item: 'Elite+ Distanciador - 24 mm' },
  { categoria: 'Cynosure Elite+', item: 'Lentes Cynosure Elite+' },
  { categoria: 'Cynosure Elite+', item: 'Funil de água' },
  { categoria: 'Cynosure Elite+', item: 'Adaptador de Zimmer para Cynosure Elite+' },

  // ─── Zimmer (acessório: mostrar para Candela ou Cynosure) ───────────────────
  { categoria: 'Zimmer', item: 'Lingueta Gpro/Gmax para adaptar ao Zimmer' },
  { categoria: 'Zimmer', item: 'Mangueira Zimmer 5' },
  { categoria: 'Zimmer', item: 'Mangueira Zimmer 6' },
  { categoria: 'Zimmer', item: 'Adaptador 3D Cryo 5' },
  { categoria: 'Zimmer', item: 'Adaptador 3D Cryo 6' },

  // ─── Alma Lasers ────────────────────────────────────────────────────────────
  { categoria: 'Alma Lasers', item: 'Peça de mão Diodo 1 cm' },
  { categoria: 'Alma Lasers', item: 'Peça de mão Diodo 2 cm' },
  { categoria: 'Alma Lasers', item: 'Peça de Mão Soprano ICE Alex' },
  { categoria: 'Alma Lasers', item: 'Peça de Mão Soprano ICE Diodo' },
  { categoria: 'Alma Lasers', item: 'Peça de Mão Harmony - Dye VL' },
  { categoria: 'Alma Lasers', item: 'Peça de Mão Harmony - Clearlift' },
  { categoria: 'Alma Lasers', item: 'Peça de Mão Harmony - ClearSkin' },
]

// Categorias sempre visíveis, qualquer que seja a marca.
const CATEGORIAS_COMUNS = ['Comuns']

// Que categorias mostrar para cada marca do equipamento. A marca do equipamento
// "corresponde" quando o seu nome contém (sem distinção de maiúsculas) a chave.
const CATEGORIAS_POR_MARCA: { chave: string; categorias: string[] }[] = [
  { chave: 'Candela', categorias: ['Candela', 'Zimmer'] },
  { chave: 'Cynosure', categorias: ['Cynosure Elite+', 'Zimmer'] },
  { chave: 'Alma Lasers', categorias: ['Alma Lasers'] },
]

// Ordem canónica de apresentação das categorias.
export const ORDEM_CATEGORIAS = ['Comuns', 'Candela', 'Cynosure Elite+', 'Zimmer', 'Alma Lasers']

// Todas as categorias, pela ordem canónica (para o modo "mostrar todas").
export function todasCategorias(): string[] {
  return ORDEM_CATEGORIAS
}

// Categorias a mostrar para a marca de um equipamento (inclui sempre as comuns).
export function categoriasParaMarca(marcaEquip: string | null | undefined): string[] {
  const m = (marcaEquip ?? '').trim().toLowerCase()
  const cats = new Set<string>(CATEGORIAS_COMUNS)
  if (m) {
    for (const { chave, categorias } of CATEGORIAS_POR_MARCA) {
      if (m.includes(chave.toLowerCase())) categorias.forEach((c) => cats.add(c))
    }
  }
  return ORDEM_CATEGORIAS.filter((c) => cats.has(c))
}

// Itens de uma categoria (mantém a ordem de definição).
export function itensDaCategoria(categoria: string): MaterialItem[] {
  return MATERIAIS.filter((x) => x.categoria === categoria)
}

export type SubGrupo = { subcategoria?: string; itens: MaterialItem[] }

// Itens de uma categoria agrupados por subcategoria (mantém a ordem de definição;
// itens sem subcategoria ficam num grupo sem cabeçalho).
export function subgruposDaCategoria(categoria: string): SubGrupo[] {
  const grupos: SubGrupo[] = []
  for (const it of MATERIAIS) {
    if (it.categoria !== categoria) continue
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.subcategoria === it.subcategoria) ultimo.itens.push(it)
    else grupos.push({ subcategoria: it.subcategoria, itens: [it] })
  }
  return grupos
}
