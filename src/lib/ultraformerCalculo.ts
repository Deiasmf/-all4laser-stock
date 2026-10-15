import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// ULTRAFORMER III — motor de cálculo do valor a faturar (pay-per-use).
//
// Modelo (decidido com a Andreia):
//  • Preço POR PULSO degressivo pelos DIAS DE ALUGUER ACUMULADOS DO CLIENTE NO
//    MÊS corrente (não por reserva): dias 1-2, dia 3, dia 4+ (ver tarifário).
//  • MÍNIMO DIÁRIO consumível, por RESERVA: 150 € no 1.º dia da reserva (inclui
//    transporte) e 100 € por cada dia consecutivo da mesma reserva. Fatura-se,
//    por dia, o MAIOR entre o consumo do dia e o mínimo desse dia.
//  • Imputação multi-dia = REPARTIÇÃO UNIFORME: só há contadores na entrega e na
//    recolha, por isso os pulsos totais são divididos igualmente pelos dias de
//    aluguer da reserva; cada dia é valorizado ao seu escalão (pela posição no
//    mês) e comparado com o mínimo (pela posição na reserva). Para alugueres de
//    1 dia (open days) o cálculo é exato.
//
// A função `calcularValorUltraformer` é PURA (recebe o tarifário) para ser
// testável; os loaders falam com a BD.
// ─────────────────────────────────────────────────────────────────────────────

export type TarifarioEscalao = {
  ordem: number
  dia_min: number
  dia_max: number | null // null = sem limite ("4+")
  preco_rosto: number
  preco_corpo: number
}

export type Tarifario = {
  id: string
  vigente_desde: string
  minimo_dia1: number
  minimo_dia_seguinte: number
  escaloes: TarifarioEscalao[]
}

export type InputCalculo = {
  pulsosRosto: number
  pulsosCorpo: number
  diasAluguer: number // nº de dias de aluguer desta reserva
  diasMesAntes: number // dias de aluguer do cliente já acumulados no mês ANTES desta reserva
}

export type DiaDetalhe = {
  dia: number // posição na reserva (1..diasAluguer)
  diaMes: number // posição acumulada no mês (para o escalão)
  escalaoOrdem: number
  precoRosto: number
  precoCorpo: number
  pulsosRosto: number
  pulsosCorpo: number
  consumo: number // € do consumo do dia
  minimo: number // € mínimo do dia
  faturado: number // € faturado nesse dia = max(consumo, minimo)
  minimoAplicado: boolean
}

export type ResultadoCalculo = {
  pulsosRosto: number
  pulsosCorpo: number
  pulsosGeral: number
  diasAluguer: number
  diasMesAntes: number
  dias: DiaDetalhe[]
  valorConsumo: number // soma dos consumos (sem mínimos)
  diasComMinimo: number // nº de dias em que prevaleceu o mínimo
  valorTotal: number // total a faturar
  tarifario: {
    id: string
    minimo_dia1: number
    minimo_dia_seguinte: number
    escaloes: TarifarioEscalao[]
  }
}

function cent(n: number): number {
  return Math.round(n * 100) / 100
}

// Escalão aplicável a um dia acumulado do mês (diaMes). Usa o último escalão como
// catch-all (o "4+" tem dia_max null).
function escalaoParaDiaMes(escaloes: TarifarioEscalao[], diaMes: number): TarifarioEscalao {
  const ord = [...escaloes].sort((a, b) => a.dia_min - b.dia_min)
  for (const e of ord) {
    const dentro = diaMes >= e.dia_min && (e.dia_max == null || diaMes <= e.dia_max)
    if (dentro) return e
  }
  return ord[ord.length - 1] ?? escaloes[0]
}

// Função PURA: dado o consumo da reserva e o tarifário, devolve o detalhe e o total.
export function calcularValorUltraformer(input: InputCalculo, tarifario: Tarifario): ResultadoCalculo {
  const pulsosRosto = Math.max(0, Math.round(input.pulsosRosto || 0))
  const pulsosCorpo = Math.max(0, Math.round(input.pulsosCorpo || 0))
  const diasAluguer = Math.max(1, Math.round(input.diasAluguer || 1))
  const diasMesAntes = Math.max(0, Math.round(input.diasMesAntes || 0))

  const rostoPorDia = pulsosRosto / diasAluguer
  const corpoPorDia = pulsosCorpo / diasAluguer

  const dias: DiaDetalhe[] = []
  let valorConsumo = 0
  let valorTotal = 0
  let diasComMinimo = 0

  for (let i = 1; i <= diasAluguer; i++) {
    const diaMes = diasMesAntes + i
    const esc = escalaoParaDiaMes(tarifario.escaloes, diaMes)
    const consumo = cent(rostoPorDia * esc.preco_rosto + corpoPorDia * esc.preco_corpo)
    const minimo = i === 1 ? tarifario.minimo_dia1 : tarifario.minimo_dia_seguinte
    const minimoAplicado = minimo > consumo
    const faturado = cent(Math.max(consumo, minimo))

    dias.push({
      dia: i,
      diaMes,
      escalaoOrdem: esc.ordem,
      precoRosto: esc.preco_rosto,
      precoCorpo: esc.preco_corpo,
      pulsosRosto: cent(rostoPorDia),
      pulsosCorpo: cent(corpoPorDia),
      consumo,
      minimo,
      faturado,
      minimoAplicado,
    })

    valorConsumo += consumo
    valorTotal += faturado
    if (minimoAplicado) diasComMinimo++
  }

  return {
    pulsosRosto,
    pulsosCorpo,
    pulsosGeral: pulsosRosto + pulsosCorpo,
    diasAluguer,
    diasMesAntes,
    dias,
    valorConsumo: cent(valorConsumo),
    diasComMinimo,
    valorTotal: cent(valorTotal),
    tarifario: {
      id: tarifario.id,
      minimo_dia1: tarifario.minimo_dia1,
      minimo_dia_seguinte: tarifario.minimo_dia_seguinte,
      escaloes: tarifario.escaloes,
    },
  }
}

// Avisos de substituição de cartuchos: o manípulo descarrega com o uso; quando os
// pulsos RESTANTES chegam a 10 000 → preparar substituição; a 5 000 → substituir.
export const PULSOS_AVISO = 10000
export const PULSOS_CRITICO = 5000
export function avisoPulsos(restantes: number | null | undefined): { nivel: 'baixo' | 'critico'; texto: string } | null {
  if (restantes == null || Number.isNaN(restantes)) return null
  const fmt = restantes.toLocaleString('pt-PT')
  if (restantes <= PULSOS_CRITICO) return { nivel: 'critico', texto: `Substituir — ${fmt} pulsos restantes` }
  if (restantes <= PULSOS_AVISO) return { nivel: 'baixo', texto: `Preparar substituição — ${fmt} pulsos restantes` }
  return null
}

// Resumo legível para a recolha / pedido de fatura (ponto 9).
export function resumoCalculo(r: ResultadoCalculo): string {
  const eur = (n: number) => `${n.toFixed(2)} €`
  const min = r.diasComMinimo > 0 ? `mínimo aplicado em ${r.diasComMinimo} dia(s); ` : ''
  return `${r.pulsosRosto} pulsos rosto + ${r.pulsosCorpo} corpo = ${eur(r.valorConsumo)}; ${min}TOTAL A FATURAR = ${eur(r.valorTotal)}`
}

// ─── Loaders (BD) ────────────────────────────────────────────────────────────

// Tarifário em vigor (vigente_ate null, ativo), com os escalões.
export async function tarifarioVigente(): Promise<Tarifario | null> {
  const { data: t } = await supabase
    .from('ultraformer_tarifario')
    .select('id, vigente_desde, minimo_dia1, minimo_dia_seguinte')
    .eq('ativo', true)
    .is('vigente_ate', null)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!t) return null

  const { data: esc } = await supabase
    .from('ultraformer_tarifario_escaloes')
    .select('ordem, dia_min, dia_max, preco_rosto, preco_corpo')
    .eq('tarifario_id', (t as { id: string }).id)
    .order('ordem', { ascending: true })

  const row = t as { id: string; vigente_desde: string; minimo_dia1: number; minimo_dia_seguinte: number }
  return {
    id: row.id,
    vigente_desde: row.vigente_desde,
    minimo_dia1: Number(row.minimo_dia1),
    minimo_dia_seguinte: Number(row.minimo_dia_seguinte),
    escaloes: ((esc as TarifarioEscalao[]) ?? []).map((e) => ({
      ordem: e.ordem,
      dia_min: e.dia_min,
      dia_max: e.dia_max,
      preco_rosto: Number(e.preco_rosto),
      preco_corpo: Number(e.preco_corpo),
    })),
  }
}

// Dias de aluguer do Ultraformer já acumulados por este cliente no mês de
// `inicioISO` (YYYY-MM-DD), em reservas ANTERIORES à data desta (cronológico).
// Serve o escalão degressivo. Exclui opcionalmente o próprio registo.
export async function contarDiasMesAntes(
  clienteId: string | null,
  inicioISO: string,
  excluirRegistoId?: string,
): Promise<number> {
  if (!clienteId || !inicioISO) return 0
  const ini = inicioISO.slice(0, 10)
  const primeiroDoMes = `${ini.slice(0, 7)}-01`

  let q = supabase
    .from('ultraformer_registos')
    .select('id, dias_aluguer, data_entrega')
    .eq('cliente_id', clienteId)
    .gte('data_entrega', primeiroDoMes)
    .lt('data_entrega', ini) // só reservas anteriores a esta
  if (excluirRegistoId) q = q.neq('id', excluirRegistoId)

  const { data } = await q
  const linhas = (data as { dias_aluguer: number | null }[] | null) ?? []
  return linhas.reduce((s, l) => s + (l.dias_aluguer ?? 1), 0)
}
