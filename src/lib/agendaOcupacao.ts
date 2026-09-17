// Ocupação de frota derivada das marcações nas agendas Google (Alugueres → Agenda).
//
// Puro de propósito (sem rede nem Supabase): a rota
// /api/alugueres/disponibilidade/agenda lê os eventos e delega aqui a conversão
// em dias ocupados, e os testes exercitam as mesmas funções.
//
// Cada marcação conta como **uma unidade ocupada** do grupo a que o calendário
// está associado. É o que faz sentido no uso real (um calendário por máquina),
// e duas marcações sobrepostas no mesmo calendário contam duas — conservador,
// preferindo bloquear a prometer um laser que não existe.

export type MarcacaoAgenda = { titulo: string; inicio: string; fim: string; diaInteiro: boolean }

export type MarcacaoOcupada = {
  calendario: string
  modelo_grupo: string
  titulo: string
  inicio: string // 'YYYY-MM-DD' — primeiro dia ocupado
  fim: string    // 'YYYY-MM-DD' — último dia ocupado (inclusive)
}

// Subtrai 1 dia a uma data 'YYYY-MM-DD'.
function diaAnterior(data: string): string {
  const [y, m, d] = data.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1))
  return dt.toISOString().slice(0, 10)
}

// Primeiro e último dia (inclusive) que uma marcação ocupa.
// Os eventos de dia inteiro do Google têm fim **exclusivo** (1 dia = 12→13);
// os eventos com hora trazem a data no próprio fuso do evento, que é o que conta
// para saber em que dias o equipamento está fora.
export function diasDaMarcacao(m: MarcacaoAgenda): { inicio: string; fim: string } {
  const inicio = m.inicio.slice(0, 10)
  if (!m.diaInteiro) return { inicio, fim: m.fim.slice(0, 10) }
  const fim = diaAnterior(m.fim.slice(0, 10))
  return { inicio, fim: fim < inicio ? inicio : fim }
}

// A marcação sobrepõe-se ao intervalo pedido [inicio, fim] (ambos inclusive)?
export function marcacaoOcupa(m: MarcacaoAgenda, inicio: string, fim: string): boolean {
  const d = diasDaMarcacao(m)
  return d.inicio <= fim && d.fim >= inicio
}

// Conta, por grupo de modelo, as marcações que ocupam o intervalo pedido.
export function ocupacaoPorGrupo(
  entradas: { calendario: string; modelo_grupo: string; marcacoes: MarcacaoAgenda[] }[],
  inicio: string,
  fim: string,
): { porGrupo: Record<string, number>; marcacoes: MarcacaoOcupada[] } {
  const porGrupo: Record<string, number> = {}
  const marcacoes: MarcacaoOcupada[] = []
  for (const e of entradas) {
    for (const m of e.marcacoes) {
      if (!marcacaoOcupa(m, inicio, fim)) continue
      porGrupo[e.modelo_grupo] = (porGrupo[e.modelo_grupo] ?? 0) + 1
      const d = diasDaMarcacao(m)
      marcacoes.push({
        calendario: e.calendario,
        modelo_grupo: e.modelo_grupo,
        titulo: m.titulo || '(sem título)',
        inicio: d.inicio,
        fim: d.fim,
      })
    }
  }
  marcacoes.sort((a, b) => a.inicio.localeCompare(b.inicio))
  return { porGrupo, marcacoes }
}
