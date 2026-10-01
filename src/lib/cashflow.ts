// Mapa de Cashflow — previsão mensal de tesouraria (secção Financeiro).
// Agrega AO VIVO as entradas/saídas dos módulos existentes (Laserix, alugueres,
// faturas, despesas de alugueres) e junta as fontes próprias (planos manuais,
// despesas fixas, pontuais). Princípio dos quadros derivados: nada se edita na
// célula; corrige-se na fonte. Acesso só admin/financeiro (RLS has_financeiro_access).

import { supabase } from './supabase'
import { carregarFaturasEmDivida } from './matchBancario'
import { listarContas } from './cc'
import { listarProcessos } from './ccProcessos'

export { formatarMoeda, formatarData, hojeISO } from './cc'

export type Mes = string // 'YYYY-MM'
export type Grupo = 'entrada' | 'saida'

export type FonteLinha = {
  chave: string
  label: string
  grupo: Grupo
  porMes: Record<Mes, number>
  total: number
  provavel?: boolean   // entrada não confirmada (distinção visual + toggle)
  estimado?: boolean   // valor estimado (faturas sem vencimento, média de despesas)
}

export type AvisoQualidade = { chave: string; mensagem: string; href?: string }

export type MapaCashflow = {
  meses: Mes[]
  entradas: FonteLinha[]
  saidas: FonteLinha[]
  totalEntradas: Record<Mes, number>
  totalSaidas: Record<Mes, number>
  saldoMes: Record<Mes, number>
  saldoAcumulado: Record<Mes, number>
  saldoInicial: number
  avisos: AvisoQualidade[]
}

export type CashflowConfig = {
  saldo_inicial: number
  data_saldo_inicial: string | null
  horizonte_meses: number
  prazo_fatura_dias: number
}

// ─── Helpers de mês ────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }
export function mesDe(dataISO: string | null | undefined): Mes | null {
  if (!dataISO) return null
  const d = new Date(dataISO)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export function mesAtual(): Mes {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
export function rotuloMes(m: Mes): string {
  const [a, mm] = m.split('-').map(Number)
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[mm - 1]} ${String(a).slice(2)}`
}
function listaMeses(inicio: Mes, n: number): Mes[] {
  const [a, m] = inicio.split('-').map(Number)
  const out: Mes[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(a, m - 1 + i, 1)
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  return out
}
function mesAdd(m: Mes, meses: number): Mes {
  const [a, mm] = m.split('-').map(Number)
  const d = new Date(a, mm - 1 + meses, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
function somaPorMes(linhas: FonteLinha[], meses: Mes[]): Record<Mes, number> {
  const r: Record<Mes, number> = {}
  for (const mes of meses) r[mes] = linhas.reduce((s, l) => s + (l.porMes[mes] ?? 0), 0)
  return r
}
function novaLinha(chave: string, label: string, grupo: Grupo, meses: Mes[], extra?: Partial<FonteLinha>): FonteLinha {
  const porMes: Record<Mes, number> = {}
  for (const m of meses) porMes[m] = 0
  return { chave, label, grupo, porMes, total: 0, ...extra }
}
function fechar(l: FonteLinha): FonteLinha { l.total = Object.values(l.porMes).reduce((s, v) => s + v, 0); return l }

// ─── Configuração ──────────────────────────────────────────────────────────────
export async function obterConfig(): Promise<CashflowConfig> {
  const { data } = await supabase.from('cashflow_config').select('*').eq('id', 1).single()
  return (data as CashflowConfig) ?? { saldo_inicial: 0, data_saldo_inicial: null, horizonte_meses: 6, prazo_fatura_dias: 30 }
}
export async function guardarConfig(patch: Partial<CashflowConfig>, autorNome: string | null) {
  return supabase.from('cashflow_config').update({ ...patch, updated_by_nome: autorNome }).eq('id', 1)
}

// ─── Motor: construir o mapa ────────────────────────────────────────────────────
export type OpcoesMapa = { incluirProvaveis?: boolean; incluirFaturas?: boolean }
export async function construirMapa(opts: OpcoesMapa = {}): Promise<MapaCashflow> {
  const incluirProvaveis = opts.incluirProvaveis ?? true
  const incluirFaturas = opts.incluirFaturas ?? false
  const cfg = await obterConfig()
  const meses = listaMeses(mesAtual(), cfg.horizonte_meses)
  const dentro = (m: Mes | null): m is Mes => !!m && meses.includes(m)
  const avisos: AvisoQualidade[] = []

  const contas = await listarContas()
  const [processosPorConta, prestCC, situacao, planosPrest, faturas, recorrentes, cats, pontuais, despVar] = await Promise.all([
    Promise.all(contas.map((ct) => listarProcessos(ct.id))),
    supabase.from('cc_prestacoes').select('data_vencimento, valor, estado, plano:cc_planos_pagamento(conta_id)').in('estado', ['pendente', 'atrasada', 'parcial']),
    supabase.from('aluguer_situacao').select('valor_mensal, data_inicio, data_fim_prevista, equipamentos(status)'),
    supabase.from('cashflow_payment_plan_prest').select('data_prevista, valor, valor_recebido, estado, cashflow_payment_plans(descricao, cliente_nome, estado)').neq('estado', 'recebido'),
    incluirFaturas ? carregarFaturasEmDivida() : Promise.resolve([]),
    supabase.from('cashflow_recurring_expenses').select('*').eq('ativo', true),
    supabase.from('cashflow_expense_categories').select('id, nome, ordem'),
    supabase.from('cashflow_manual_entries').select('*').eq('estado', 'previsto'),
    despesasVariaveisMedia3m(),
  ])

  const entradas: FonteLinha[] = []
  const saidas: FonteLinha[] = []

  // 1) Laserix / parceria — em falta FASEADO (em EUR): para cada processo, uma
  //    mensalidade típica (média dos pagamentos) a partir do próximo pagamento,
  //    até consumir o em falta. Converte da moeda da venda (ex.: AED) para EUR.
  //    + prestações pendentes dos planos cc (datas reais, já em EUR).
  const lLaserix = novaLinha('laserix', 'Laserix (processos)', 'entrada', meses)
  let semHistN = 0
  let semHistEur = 0
  contas.forEach((ct, idx) => {
    for (const p of processosPorConta[idx]) {
      if (p.emFalta <= 0.01) continue
      const taxa = p.moeda === 'EUR' ? 1 : (p.taxaCusto || ct.taxa_contratual || 1)
      const emFaltaEur = p.emFalta / taxa
      // Processos sem pagamentos iniciados: não se sabe quando pagam → não entram
      // no mapa; ficam num aviso de qualidade (decisão do utilizador).
      if (p.nPagamentos === 0) { semHistN++; semHistEur += emFaltaEur; continue }
      const medioEur = (p.pago / p.nPagamentos) / taxa
      const nFalta = medioEur > 0 ? Math.max(1, Math.ceil(emFaltaEur / medioEur)) : 1
      let ini = mesDe(p.proximoPagamento) ?? meses[0]
      if (ini < meses[0]) ini = meses[0]
      let restante = emFaltaEur
      for (let i = 0; i < nFalta && restante > 0.01; i++) {
        const m = mesAdd(ini, i)
        const parcela = Math.min(medioEur, restante)
        if (dentro(m)) lLaserix.porMes[m] += parcela
        restante -= parcela
      }
    }
  })
  for (const pr of (prestCC.data ?? []) as unknown as { data_vencimento: string; valor: number | null }[]) {
    let m = mesDe(pr.data_vencimento)
    if (m && m < meses[0]) m = meses[0]   // vencidas → mês corrente
    if (dentro(m)) lLaserix.porMes[m] += pr.valor ?? 0
  }
  entradas.push(fechar(lLaserix))

  // 2) Alugueres (nacionais / internacionais) — projetados enquanto ativos
  const lNac = novaLinha('alug_nac', 'Alugueres Nacionais', 'entrada', meses)
  const lInt = novaLinha('alug_int', 'Alugueres Internacionais', 'entrada', meses)
  let semValorNac = 0, semValorInt = 0
  for (const s of (situacao.data ?? []) as unknown as AluguerSit[]) {
    const status = s.equipamentos?.status
    const alvo = status === 'Aluguer internacional' ? lInt : status === 'Aluguer nacional' ? lNac : null
    if (!alvo) continue
    if (s.valor_mensal == null) {
      if (status === 'Aluguer internacional') semValorInt++; else semValorNac++
      continue
    }
    const inicio = mesDe(s.data_inicio)
    const fim = mesDe(s.data_fim_prevista)
    for (const m of meses) {
      if (inicio && m < inicio) continue
      if (fim && m > fim) continue
      alvo.porMes[m] += s.valor_mensal
    }
  }
  entradas.push(fechar(lNac), fechar(lInt))
  if (semValorNac) avisos.push({ chave: 'nac_sem_valor', mensagem: `${semValorNac} aluguer(es) nacionais sem valor mensal — não entram na previsão.`, href: '/alugueres/situacao' })
  if (semValorInt) avisos.push({ chave: 'int_sem_valor', mensagem: `${semValorInt} aluguer(es) internacionais sem valor mensal — não entram na previsão.`, href: '/alugueres/situacao' })

  // 3) Planos manuais (Weldon…)
  const lPlanos = novaLinha('planos', 'Planos (manuais)', 'entrada', meses)
  for (const p of (planosPrest.data ?? []) as unknown as PlanoPrestRow[]) {
    if (p.cashflow_payment_plans?.estado && p.cashflow_payment_plans.estado !== 'ativo') continue
    const m = mesDe(p.data_prevista); if (!dentro(m)) continue
    lPlanos.porMes[m] += Math.max(0, (p.valor ?? 0) - (p.valor_recebido ?? 0))
  }
  entradas.push(fechar(lPlanos))

  // 4) Faturas pendentes (opcional) — mês = emissão + prazo; vencidas no mês corrente
  if (incluirFaturas) {
    const lFaturas = novaLinha('faturas', 'Faturas pendentes', 'entrada', meses, { estimado: true })
    for (const f of faturas) {
      const base = f.data_vencimento ?? f.data_documento
      let m = mesDe(base ? addDias(base, f.data_vencimento ? 0 : cfg.prazo_fatura_dias) : null)
      if (m && m < meses[0]) m = meses[0]               // vencidas → mês corrente
      if (dentro(m)) lFaturas.porMes[m] += f.porLiquidar
    }
    entradas.push(fechar(lFaturas))
  }

  // 5) Pontuais (entrada)
  const lPontEnt = novaLinha('pont_ent', 'Pontuais', 'entrada', meses)
  for (const e of (pontuais.data ?? []) as ManualRow[]) {
    if (e.tipo !== 'entrada') continue
    if (!incluirProvaveis && e.confianca === 'provavel') continue
    const m = mesDe(e.data_prevista); if (dentro(m)) lPontEnt.porMes[m] += e.valor
    if (e.confianca === 'provavel') lPontEnt.provavel = true
  }
  entradas.push(fechar(lPontEnt))

  // 6) Despesas fixas por categoria
  const catNome = new Map<string, string>()
  const catOrdem = new Map<string, number>()
  for (const c of (cats.data ?? []) as { id: string; nome: string; ordem: number }[]) { catNome.set(c.id, c.nome); catOrdem.set(c.id, c.ordem) }
  const porCat = new Map<string, FonteLinha>()
  for (const d of (recorrentes.data ?? []) as RecurringRow[]) {
    const nome = d.categoria_id ? (catNome.get(d.categoria_id) ?? 'Outras') : 'Outras'
    const chave = 'desp_' + (d.categoria_id ?? 'outras')
    let linha = porCat.get(chave)
    if (!linha) { linha = novaLinha(chave, nome, 'saida', meses); porCat.set(chave, linha) }
    const ini = mesDe(d.data_inicio); const fim = mesDe(d.data_fim)
    for (const m of meses) {
      if (ini && m < ini) continue
      if (fim && m > fim) continue
      if (!ocorreNoMes(d.periodicidade, ini ?? meses[0], m)) continue
      linha.porMes[m] += d.valor
    }
  }
  for (const l of porCat.values()) saidas.push(fechar(l))

  // 7) Despesas variáveis de alugueres (média 3 meses, estimativa)
  if (despVar > 0) {
    const lVar = novaLinha('desp_var', 'Despesas de alugueres (estimativa)', 'saida', meses, { estimado: true })
    for (const m of meses) lVar.porMes[m] = despVar
    saidas.push(fechar(lVar))
  }

  // 8) Pontuais (saída)
  const lPontSai = novaLinha('pont_sai', 'Pontuais', 'saida', meses)
  for (const e of (pontuais.data ?? []) as ManualRow[]) {
    if (e.tipo !== 'saida') continue
    const m = mesDe(e.data_prevista); if (dentro(m)) lPontSai.porMes[m] += e.valor
  }
  saidas.push(fechar(lPontSai))

  // Ordena saídas por ordem de categoria (fixas primeiro), depois estimativa/pontuais
  saidas.sort((a, b) => (catOrdem.get(a.chave.replace('desp_', '')) ?? 99) - (catOrdem.get(b.chave.replace('desp_', '')) ?? 99))

  // Totais e saldo acumulado
  const totalEntradas = somaPorMes(entradas, meses)
  const totalSaidas = somaPorMes(saidas, meses)
  const saldoMes: Record<Mes, number> = {}
  const saldoAcumulado: Record<Mes, number> = {}
  let acum = cfg.saldo_inicial
  for (const m of meses) {
    saldoMes[m] = (totalEntradas[m] ?? 0) - (totalSaidas[m] ?? 0)
    acum += saldoMes[m]
    saldoAcumulado[m] = acum
  }

  // Avisos de qualidade adicionais
  if (!incluirFaturas) {
    avisos.push({ chave: 'faturas_excluidas', mensagem: 'Faturas pendentes excluídas por defeito (sem vencimento/liquidação fiáveis). Ativa o toggle para as incluir.', href: '/financeiro/contas-correntes' })
  } else if (!faturas.some((f) => f.data_vencimento)) {
    avisos.push({ chave: 'faturas_sem_venc', mensagem: 'As faturas pendentes não têm data de vencimento — colocadas por prazo estimado (editável em Definições).', href: '/financeiro/contas-correntes' })
  }
  if (despVar === 0) avisos.push({ chave: 'sem_desp_var', mensagem: 'Sem histórico de despesas de alugueres nos últimos 3 meses — estimativa a 0.' })
  if (semHistN > 0) avisos.push({ chave: 'proc_sem_hist', mensagem: `${semHistN} processo(s) Laserix sem pagamentos iniciados — ${Math.round(semHistEur).toLocaleString('pt-PT')} € por receber, não calendarizado (fora do mapa).` })

  return { meses, entradas, saidas, totalEntradas, totalSaidas, saldoMes, saldoAcumulado, saldoInicial: cfg.saldo_inicial, avisos }
}

function addDias(iso: string, dias: number): string {
  return new Date(new Date(iso).getTime() + dias * 86400000).toISOString().slice(0, 10)
}
// Periodicidade de uma despesa fixa ocorre neste mês?
function ocorreNoMes(periodicidade: string, inicio: Mes, m: Mes): boolean {
  if (periodicidade === 'mensal') return true
  const diff = mesesEntre(inicio, m)
  if (periodicidade === 'trimestral') return diff % 3 === 0
  if (periodicidade === 'anual') return diff % 12 === 0
  return true
}
function mesesEntre(a: Mes, b: Mes): number {
  const [aa, am] = a.split('-').map(Number); const [ba, bm] = b.split('-').map(Number)
  return (ba - aa) * 12 + (bm - am)
}

// Média das despesas de alugueres dos últimos 3 meses (estimativa de saída).
async function despesasVariaveisMedia3m(): Promise<number> {
  const limite = mesAdd(mesAtual(), -3) + '-01'
  const { data } = await supabase.from('despesas_alugueres').select('valor, data_despesa').gte('data_despesa', limite).lt('data_despesa', mesAtual() + '-01')
  const total = (data ?? []).reduce((s, d: { valor: number | null }) => s + (d.valor ?? 0), 0)
  return Math.round((total / 3) * 100) / 100
}

// ─── Tipos internos das queries ────────────────────────────────────────────────
type AluguerSit = { valor_mensal: number | null; data_inicio: string | null; data_fim_prevista: string | null; equipamentos: { status: string | null } | null }
type PlanoPrestRow = { data_prevista: string; valor: number | null; valor_recebido: number | null; estado: string; cashflow_payment_plans: { estado: string | null } | null }
type RecurringRow = { categoria_id: string | null; valor: number; periodicidade: string; data_inicio: string; data_fim: string | null }
type ManualRow = { tipo: string; valor: number; data_prevista: string; confianca: string }

// ─── CRUD: Despesas fixas ────────────────────────────────────────────────────────
export type Categoria = { id: string; nome: string; ordem: number; ativo: boolean }
export async function listarCategorias(): Promise<Categoria[]> {
  const { data } = await supabase.from('cashflow_expense_categories').select('*').eq('ativo', true).order('ordem')
  return (data ?? []) as Categoria[]
}
export type RecurringExpense = {
  id: string; descricao: string; categoria_id: string | null; valor: number; moeda: string
  periodicidade: 'mensal' | 'trimestral' | 'anual'; dia_mes: number | null
  data_inicio: string; data_fim: string | null; ativo: boolean; notas: string | null
}
export async function listarDespesasFixas(): Promise<RecurringExpense[]> {
  const { data } = await supabase.from('cashflow_recurring_expenses').select('*').order('ativo', { ascending: false }).order('descricao')
  return (data ?? []) as RecurringExpense[]
}
export async function guardarDespesaFixa(e: Partial<RecurringExpense> & { id?: string }, autorNome: string | null) {
  if (e.id) return supabase.from('cashflow_recurring_expenses').update(e).eq('id', e.id)
  return supabase.from('cashflow_recurring_expenses').insert({ ...e, criado_por_nome: autorNome })
}
export async function eliminarDespesaFixa(id: string) {
  return supabase.from('cashflow_recurring_expenses').delete().eq('id', id)
}

// ─── CRUD: Pontuais ──────────────────────────────────────────────────────────────
export type ManualEntry = {
  id: string; tipo: 'entrada' | 'saida'; descricao: string; entidade_nome: string | null
  categoria: string | null; valor: number; moeda: string; data_prevista: string
  confianca: 'confirmada' | 'provavel'; estado: 'previsto' | 'realizado'; data_realizado: string | null; notas: string | null
}
export async function listarPontuais(): Promise<ManualEntry[]> {
  const { data } = await supabase.from('cashflow_manual_entries').select('*').order('data_prevista', { ascending: true })
  return (data ?? []) as ManualEntry[]
}
export async function guardarPontual(e: Partial<ManualEntry> & { id?: string }, autorNome: string | null) {
  if (e.id) return supabase.from('cashflow_manual_entries').update(e).eq('id', e.id)
  return supabase.from('cashflow_manual_entries').insert({ ...e, criado_por_nome: autorNome })
}
export async function eliminarPontual(id: string) {
  return supabase.from('cashflow_manual_entries').delete().eq('id', id)
}
export async function marcarPontualRealizado(id: string, realizado: boolean) {
  return supabase.from('cashflow_manual_entries').update({
    estado: realizado ? 'realizado' : 'previsto',
    data_realizado: realizado ? new Date().toISOString().slice(0, 10) : null,
  }).eq('id', id)
}

// ─── CRUD: Planos manuais ────────────────────────────────────────────────────────
export type PaymentPlan = {
  id: string; cliente_id: string | null; cliente_nome: string | null; descricao: string | null
  periodicidade: 'mensal' | 'trimestral' | 'datas_especificas'; valor_prestacao: number | null; moeda: string
  data_inicio: string | null; n_prestacoes: number | null; data_fim: string | null; estado: string; notas: string | null
}
export type PlanoPrest = { id: string; plan_id: string; numero: number; data_prevista: string; valor: number; estado: string; valor_recebido: number; data_recebimento: string | null }
export async function listarPlanos(): Promise<(PaymentPlan & { prestacoes: PlanoPrest[] })[]> {
  const { data } = await supabase.from('cashflow_payment_plans').select('*, cashflow_payment_plan_prest(*)').order('created_at', { ascending: false })
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const prest = ((row.cashflow_payment_plan_prest ?? []) as PlanoPrest[]).sort((a, b) => a.numero - b.numero)
    return { ...(row as unknown as PaymentPlan), prestacoes: prest }
  })
}
export async function criarPlano(p: Partial<PaymentPlan>, autorNome: string | null) {
  return supabase.from('cashflow_payment_plans').insert({ ...p, criado_por_nome: autorNome }).select().single()
}
export async function eliminarPlano(id: string) {
  return supabase.from('cashflow_payment_plans').delete().eq('id', id)
}
// Gera as prestações mensais/trimestrais de um plano (valor fixo × nº prestações).
export async function gerarPrestacoesPlano(plan: PaymentPlan): Promise<{ error: { message: string } | null }> {
  if (!plan.data_inicio || !plan.valor_prestacao || !plan.n_prestacoes) {
    return { error: { message: 'Indica data de início, valor da prestação e nº de prestações.' } }
  }
  const passo = plan.periodicidade === 'trimestral' ? 3 : 1
  const linhas = Array.from({ length: plan.n_prestacoes }, (_, i) => {
    const d = new Date(plan.data_inicio!)
    d.setMonth(d.getMonth() + i * passo)
    return {
      plan_id: plan.id, numero: i + 1, data_prevista: d.toISOString().slice(0, 10),
      valor: plan.valor_prestacao!, moeda: plan.moeda, estado: 'previsto',
    }
  })
  await supabase.from('cashflow_payment_plan_prest').delete().eq('plan_id', plan.id)
  const { error } = await supabase.from('cashflow_payment_plan_prest').insert(linhas)
  return { error: error ? { message: error.message } : null }
}
export async function marcarPrestPlanoRecebida(prestId: string, recebida: boolean, valor: number) {
  return supabase.from('cashflow_payment_plan_prest').update({
    estado: recebida ? 'recebido' : 'previsto',
    valor_recebido: recebida ? valor : 0,
    data_recebimento: recebida ? new Date().toISOString().slice(0, 10) : null,
  }).eq('id', prestId)
}
