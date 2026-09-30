// Processos de Equipamentos (parceria, ex.: Laserix) — vista POR EQUIPAMENTO.
// Estende o módulo cc_* (não duplica): agrega por consignação o valor devido
// (custo + 50% do lucro, já calculado em cc_vendas), o pago, o em falta, o ritmo
// de pagamento e as previsões. Só leitura — RLS has_financeiro_access().

import { supabase } from './supabase'
import { incidenciasAbertasPorConsignacao } from './ccDossie'

export type EstadoProcesso = 'enviado' | 'em_pagamento' | 'liquidado' | 'com_incidencia' | 'devolvido'

export const ESTADOS_PROCESSO: { valor: EstadoProcesso; label: string; cor: string; bg: string }[] = [
  { valor: 'enviado', label: 'Enviado', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'em_pagamento', label: 'Em pagamento', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'liquidado', label: 'Liquidado', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'com_incidencia', label: 'Com incidência', cor: '#B91C1C', bg: '#FEE2E2' },
  { valor: 'devolvido', label: 'Devolvido', cor: '#6B7280', bg: '#F3F4F6' },
]
export function estadoProcessoInfo(v: string) {
  return ESTADOS_PROCESSO.find((e) => e.valor === v) ?? ESTADOS_PROCESSO[0]
}

export type Processo = {
  consignacaoId: string
  equipamentoId: string | null
  marca: string | null
  modelo: string | null
  numeroSerie: string | null
  ano: string | null
  dataEnvio: string | null
  estadoConsignacao: string
  moeda: string
  // Conta (na moeda da venda; devido/pago vêm da venda + movimentos)
  vendaId: string | null
  dataVenda: string | null
  valorDevido: number      // custo + 50% × lucro (cc_vendas.valor_devido)
  pago: number             // Σ recebido ligado a esta venda
  emFalta: number
  pctPago: number          // 0..100
  nPagamentos: number
  primeiroPagamento: string | null
  ultimoPagamento: string | null
  proximoPagamento: string | null   // do plano, senão pelo ritmo
  proximoPorRitmo: boolean           // true = estimado (sem plano formal)
  finalizacaoEstimada: string | null // estimativa (em falta ÷ ritmo)
  temIncidenciaAberta: boolean
  estado: EstadoProcesso
}

type ConsRow = {
  id: string; equipamento_id: string | null; numero_serie: string | null
  custo_declarado: number; moeda_custo: string; data_envio: string | null; estado: string
  equipamentos: { marca: string | null; modelo: string | null; ano: string | null; serial_number: string | null } | null
}
type VendaRow = { id: string; consignacao_id: string; data_venda: string | null; valor_devido: number | null; moeda_venda: string | null; estado: string }
type MovRow = { origem_id: string | null; data: string; valor: number | null }
type PrestRow = { data_vencimento: string; estado: string; plano: { equipamento_id: string | null } | null }

// Mediana dos intervalos (dias) entre pagamentos consecutivos — ritmo robusto.
function ritmoDias(datas: string[]): number | null {
  const ord = [...datas].filter(Boolean).sort()
  if (ord.length < 2) return null
  const difs: number[] = []
  for (let i = 1; i < ord.length; i++) {
    const d = (Date.parse(ord[i]) - Date.parse(ord[i - 1])) / 86400000
    if (d > 0) difs.push(d)
  }
  if (difs.length === 0) return null
  difs.sort((a, b) => a - b)
  const m = Math.floor(difs.length / 2)
  return difs.length % 2 ? difs[m] : (difs[m - 1] + difs[m]) / 2
}

function addDias(iso: string, dias: number): string {
  const d = new Date(Date.parse(iso) + dias * 86400000)
  return d.toISOString().slice(0, 10)
}

// Lista os processos (um por consignação) de uma conta, com contas e previsões.
export async function listarProcessos(contaId: string): Promise<Processo[]> {
  const consRes = await supabase
    .from('cc_consignacoes')
    .select('id, equipamento_id, numero_serie, custo_declarado, moeda_custo, data_envio, estado, equipamentos(marca, modelo, ano, serial_number)')
    .eq('conta_id', contaId)
    .order('data_envio', { ascending: false })
  const cons = (consRes.data ?? []) as unknown as ConsRow[]
  const consIds = cons.map((c) => c.id)

  const [vendasRes, movRes, prestRes] = await Promise.all([
    consIds.length
      ? supabase.from('cc_vendas').select('id, consignacao_id, data_venda, valor_devido, moeda_venda, estado').in('consignacao_id', consIds)
      : Promise.resolve({ data: [] }),
    supabase.from('cc_movimentos').select('origem_id, data, valor').eq('conta_id', contaId).eq('tipo', 'recebido').eq('origem_tipo', 'venda'),
    supabase.from('cc_prestacoes').select('data_vencimento, estado, plano:cc_planos_pagamento(equipamento_id)').in('estado', ['pendente', 'atrasada', 'parcial']),
  ])

  const vendas = (vendasRes.data ?? []) as VendaRow[]
  const vendaPorCons = new Map<string, VendaRow>()
  for (const v of vendas) {
    // venda mais recente por consignação
    const cur = vendaPorCons.get(v.consignacao_id)
    if (!cur || (v.data_venda ?? '') > (cur.data_venda ?? '')) vendaPorCons.set(v.consignacao_id, v)
  }

  // Pagamentos (recebido) por venda.
  const pagosPorVenda = new Map<string, { total: number; datas: string[] }>()
  for (const m of (movRes.data ?? []) as MovRow[]) {
    if (!m.origem_id) continue
    const e = pagosPorVenda.get(m.origem_id) ?? { total: 0, datas: [] }
    e.total += m.valor ?? 0
    if (m.data) e.datas.push(m.data)
    pagosPorVenda.set(m.origem_id, e)
  }

  // Próximo vencimento de plano por equipamento (mais próximo pendente).
  const proxPlanoPorEquip = new Map<string, string>()
  for (const p of (prestRes.data ?? []) as unknown as PrestRow[]) {
    const eq = p.plano?.equipamento_id
    if (!eq || !p.data_vencimento) continue
    const cur = proxPlanoPorEquip.get(eq)
    if (!cur || p.data_vencimento < cur) proxPlanoPorEquip.set(eq, p.data_vencimento)
  }

  // Consignações com incidência aberta → estado "com incidência" (Fase 2).
  const incAbertas = await incidenciasAbertasPorConsignacao(consIds)

  const hoje = new Date().toISOString().slice(0, 10)

  return cons.map((c): Processo => {
    const v = vendaPorCons.get(c.id) ?? null
    const eq = c.equipamentos
    const devido = v?.valor_devido ?? 0
    const pg = v ? pagosPorVenda.get(v.id) : undefined
    const pago = pg?.total ?? 0
    const emFalta = Math.max(0, devido - pago)
    const pct = devido > 0 ? Math.min(100, Math.round((pago / devido) * 100)) : (v ? 0 : 0)
    const datas = (pg?.datas ?? []).slice().sort()
    const primeiro = datas[0] ?? null
    const ultimo = datas[datas.length - 1] ?? null

    // Próximo pagamento: plano (se houver) ou estimativa pelo ritmo.
    const proxPlano = c.equipamento_id ? proxPlanoPorEquip.get(c.equipamento_id) ?? null : null
    const ritmo = ritmoDias(datas)
    let proximo: string | null = proxPlano
    let porRitmo = false
    if (!proximo && emFalta > 0 && ultimo && ritmo) { proximo = addDias(ultimo > hoje ? ultimo : hoje, ritmo); porRitmo = true }

    // Finalização estimada: nº de pagamentos que faltam × ritmo, a partir do próximo.
    let finalizacao: string | null = null
    if (emFalta > 0 && ritmo && datas.length >= 2 && pago > 0) {
      const valorMedio = pago / datas.length
      if (valorMedio > 0) {
        const faltamN = Math.ceil(emFalta / valorMedio)
        const base = proximo ?? (ultimo ? addDias(ultimo, ritmo) : hoje)
        finalizacao = addDias(base, Math.max(0, faltamN - 1) * ritmo)
      }
    }

    // Estado do processo.
    let estado: EstadoProcesso
    if (incAbertas.has(c.id)) estado = 'com_incidencia'
    else if (c.estado === 'devolvido' || c.estado === 'cancelado') estado = 'devolvido'
    else if (!v) estado = 'enviado'
    else if (emFalta <= 0.01) estado = 'liquidado'
    else estado = 'em_pagamento'

    return {
      consignacaoId: c.id,
      equipamentoId: c.equipamento_id,
      marca: eq?.marca ?? null,
      modelo: eq?.modelo ?? null,
      numeroSerie: eq?.serial_number ?? c.numero_serie,
      ano: eq?.ano ?? null,
      dataEnvio: c.data_envio,
      estadoConsignacao: c.estado,
      moeda: v?.moeda_venda ?? c.moeda_custo ?? 'EUR',
      vendaId: v?.id ?? null,
      dataVenda: v?.data_venda ?? null,
      valorDevido: devido,
      pago,
      emFalta,
      pctPago: pct,
      nPagamentos: datas.length,
      primeiroPagamento: primeiro,
      ultimoPagamento: ultimo,
      proximoPagamento: proximo,
      proximoPorRitmo: porRitmo,
      finalizacaoEstimada: finalizacao,
      temIncidenciaAberta: incAbertas.has(c.id),
      estado,
    }
  })
}

export type TotaisProcessos = { devido: number; pago: number; emFalta: number; n: number }
export function totaisProcessos(ps: Processo[]): TotaisProcessos {
  return ps.reduce((t, p) => ({ devido: t.devido + p.valorDevido, pago: t.pago + p.pago, emFalta: t.emFalta + p.emFalta, n: t.n + 1 }), { devido: 0, pago: 0, emFalta: 0, n: 0 })
}
