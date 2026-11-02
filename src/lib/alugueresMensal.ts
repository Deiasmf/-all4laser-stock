// Projeção dos alugueres por mês (usada pela lista de alugueres).
//
// Um aluguer NORMAL aparece só no mês da entrega. Um aluguer MENSAL
// (recorrente, `mensal = true`) aparece em todos os meses, do mês de entrega
// até ao fim (`data_fim_prevista`, ou +12 meses se aberto) — é esta a forma
// certa de registar um mensal: UM registo, em vez de uma linha por mês.

type AluguerMensalBase = {
  mensal?: boolean | null
  data_entrega?: string | null
  data_recolha?: string | null
  data_fim_prevista?: string | null
}

// Soma `n` meses a um 'YYYY-MM'.
export function mesMais(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m += n
  y += Math.floor((m - 1) / 12)
  m = ((m - 1) % 12 + 12) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

// Lista de meses 'YYYY-MM' entre de..ate (inclusive).
export function mesesEntre(de: string, ate: string): string[] {
  if (!de || !ate || de > ate) return de && (!ate || de === ate) ? [de] : []
  const out: string[] = []
  let cur = de
  for (let i = 0; i < 120 && cur <= ate; i++) { out.push(cur); cur = mesMais(cur, 1) }
  return out
}

// Meses em que um aluguer deve aparecer, dentro da seleção.
// - Normal: só o mês de entrega.
// - Mensal: do mês de entrega até ao fim (data_fim_prevista, ou +12 meses se
//   aberto), nunca além do mês de recolha se já recolhido.
//   Uma data de recolha ANTERIOR à entrega é um erro de registo (aconteceu nos
//   mensais criados à mão, com "recolha" = data de criação) e é ignorada —
//   senão o aluguer desaparecia de todos os meses, incluindo o da entrega.
export function mesesDoAluguer(a: AluguerMensalBase, selecao: string[]): string[] {
  const inicio = (a.data_entrega ?? '').slice(0, 7)
  if (!inicio) return []
  if (!a.mensal) return selecao.includes(inicio) ? [inicio] : []
  let fim = (a.data_fim_prevista ?? '').slice(0, 7) || mesMais(inicio, 12)
  const recolha = (a.data_recolha ?? '').slice(0, 7)
  if (recolha && recolha >= inicio && recolha < fim) fim = recolha
  if (fim < inicio) fim = inicio
  return selecao.filter((em) => em >= inicio && em <= fim)
}
