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
