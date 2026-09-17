// Funções auxiliares partilhadas pelas páginas de Alugueres

export function formatarEuro(v: number): string {
  return (v || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

// Mês atual no formato YYYY-MM
export function mesAtual(): string {
  return new Date().toISOString().slice(0, 7)
}

// Nome legível de um mês (ex.: "junho de 2026")
export function nomeMes(ym: string): string {
  const [a, m] = ym.split('-').map(Number)
  if (!a || !m) return ym
  return new Date(a, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

// Últimos n meses (YYYY-MM), do mais antigo para o mais recente
export function ultimosMeses(n: number): string[] {
  const arr: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1)
    arr.push(dd.toISOString().slice(0, 7))
  }
  return arr
}

// Soma uma propriedade numérica de uma lista
export function somar<T>(lista: T[], fn: (x: T) => number | null | undefined): number {
  return lista.reduce((acc, x) => acc + (fn(x) || 0), 0)
}

// Converte texto de valor escrito à portuguesa num número.
// Aceita vírgula decimal (1500,50), ponto de milhares (1.500,50) e símbolo €.
// Devolve null se o texto não representar um número válido.
export function parseNumeroPt(texto: string): number | null {
  let s = texto.trim().replace(/[€\s]/g, '')
  if (!s) return null
  // Se houver vírgula, é o separador decimal; os pontos são de milhares.
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(s)
  return isNaN(n) ? null : n
}

// ── Grupos de preço ────────────────────────────────────────────────────────────
// Os modelos estão escritos de várias formas (stock, calendários, catálogo de
// aluguer), mas os preços (`precos_aluguer`) e o mapeamento dos calendários
// (`calendarios_aluguer`) vivem em torno destas chaves. Um único sítio para a
// lista e para a normalização — senão a Agenda, a Previsão e os Preços deixam de
// falar a mesma língua.
export const GRUPOS_PRECO: { grupo: string; label: string }[] = [
  { grupo: 'gentlepro', label: 'GentlePro' },
  { grupo: 'gentlemaxpro', label: 'GentleMax Pro' },
  { grupo: 'gentlemaxproplus', label: 'GentleMax Pro Plus' },
  { grupo: 'sopranoice', label: 'Soprano ICE' },
  { grupo: 'sopranoplatinum', label: 'Soprano Platinum' },
]

export function labelGrupo(grupo: string): string {
  return GRUPOS_PRECO.find((g) => g.grupo === grupo)?.label ?? grupo
}

// Associa o nome do modelo (escrito de várias formas no stock) a um grupo de preço.
// Ignora maiúsculas, espaços e símbolos.
export function grupoPreco(modelo: string): string | null {
  const n = modelo.toLowerCase().replace(/[^a-z]/g, '')
  if (!n) return null
  if (n.includes('maxpro')) return n.includes('plus') ? 'gentlemaxproplus' : 'gentlemaxpro'
  if (n.includes('gentlepro') && !n.includes('prou')) return 'gentlepro' // exclui Pro-U
  if (n.includes('soprano')) {
    if (n.includes('platinum')) return 'sopranoplatinum'
    if (n.includes('ice')) return 'sopranoice'
  }
  return null
}
