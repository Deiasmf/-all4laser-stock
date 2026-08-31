import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS INTERNACIONAIS (multi-equipamento)
//
// Um aluguer é um laser + um Zimmer (Cryo 6) com UM preço mensal pelo conjunto.
// Um contrato agrupa N equipamentos (seriais) e tem faturação mensal ao nível do
// contrato (uma fatura por mês, com pago/não pago). Tabelas:
//   alugueres_contratos · alugueres_contrato_equipamentos · alugueres_contrato_faturacao
// ─────────────────────────────────────────────────────────────────────────────

export type ContratoEquip = {
  id?: string
  equipamento_id: string | null
  serial_number: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
}

export type ContratoFat = {
  id: string | null
  contrato_id: string
  mes: string // 'YYYY-MM'
  valor_a_faturar: number | null
  nao_faturar: boolean
  pago: boolean
  validado: boolean
  fatura_url: string | null
  fatura_caminho: string | null
  fatura_nome: string | null
  fatura_enviada_em: string | null
  fatura_enviada_para: string | null
}

export type ContratoIntl = {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  valor_mensal: number | null
  data_inicio: string | null
  data_fim: string | null
  observacoes: string | null
  created_at: string
  equipamentos: ContratoEquip[]
  faturacao: ContratoFat[]
}

export type ContratoInput = {
  id?: string | null
  cliente_id: string | null
  cliente_nome: string | null
  valor_mensal: number | null
  data_inicio: string // 'YYYY-MM-DD'
  data_fim: string
  observacoes: string | null
  equipamentos: ContratoEquip[]
}

export type Autor = { id: string | null; nome: string | null }

// ── Helpers de meses ────────────────────────────────────────────────────────
export function adicionarMeses(iso: string, k: number): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setMonth(dt.getMonth() + k)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function mesesInclusive(inicioISO: string, fimISO: string): number {
  const [y1, m1] = inicioISO.slice(0, 7).split('-').map(Number)
  const [y2, m2] = fimISO.slice(0, 7).split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

// Lista de meses 'YYYY-MM' de um contrato (início→fim inclusive).
export function mesesDoContrato(inicioISO: string, fimISO: string): string[] {
  const n = Math.max(0, mesesInclusive(inicioISO, fimISO))
  return Array.from({ length: n }, (_, k) => adicionarMeses(inicioISO, k).slice(0, 7))
}

// ── Carregar todos os contratos internacionais ──────────────────────────────
export async function carregarContratosIntl(): Promise<ContratoIntl[]> {
  const [rC, rE, rF] = await Promise.all([
    supabase.from('alugueres_contratos').select('*').eq('nacional', false).order('created_at', { ascending: false }).limit(5000),
    supabase.from('alugueres_contrato_equipamentos').select('*').limit(10000),
    supabase.from('alugueres_contrato_faturacao').select('*').limit(10000),
  ])
  const contratos = (rC.data as Omit<ContratoIntl, 'equipamentos' | 'faturacao'>[]) ?? []
  const equipPorC = new Map<string, ContratoEquip[]>()
  for (const e of (rE.data as (ContratoEquip & { contrato_id: string })[]) ?? []) {
    const arr = equipPorC.get(e.contrato_id) ?? []
    arr.push(e); equipPorC.set(e.contrato_id, arr)
  }
  const fatPorC = new Map<string, ContratoFat[]>()
  for (const f of (rF.data as ContratoFat[]) ?? []) {
    const arr = fatPorC.get(f.contrato_id) ?? []
    arr.push(f); fatPorC.set(f.contrato_id, arr)
  }
  return contratos.map((ct) => ({
    ...ct,
    equipamentos: (equipPorC.get(ct.id) ?? []).sort((a, b) => (a.modelo ?? '').localeCompare(b.modelo ?? '')),
    faturacao: (fatPorC.get(ct.id) ?? []).sort((a, b) => a.mes.localeCompare(b.mes)),
  }))
}

// ── Criar / editar contrato (+ equipamentos + faturação mensal) ─────────────
export async function guardarContratoIntl(input: ContratoInput, autor: Autor): Promise<{ error: { message: string } | null }> {
  const dados = {
    cliente_id: input.cliente_id,
    cliente_nome: input.cliente_nome,
    valor_mensal: input.valor_mensal,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    observacoes: input.observacoes,
    nacional: false,
    updated_at: new Date().toISOString(),
  }

  let contratoId = input.id ?? null
  if (contratoId) {
    const { error } = await supabase.from('alugueres_contratos').update(dados).eq('id', contratoId)
    if (error) return { error }
    // Substitui os equipamentos.
    await supabase.from('alugueres_contrato_equipamentos').delete().eq('contrato_id', contratoId)
  } else {
    const { data, error } = await supabase.from('alugueres_contratos')
      .insert({ ...dados, criado_por: autor.id, criado_por_nome: autor.nome })
      .select('id').single()
    if (error) return { error }
    contratoId = (data as { id: string }).id
  }

  // Equipamentos do contrato.
  if (input.equipamentos.length) {
    const { error: eE } = await supabase.from('alugueres_contrato_equipamentos').insert(
      input.equipamentos.map((e) => ({
        contrato_id: contratoId, equipamento_id: e.equipamento_id,
        serial_number: e.serial_number, marca: e.marca, modelo: e.modelo, ano: e.ano,
      }))
    )
    if (eE) return { error: eE }
  }

  // Faturação mensal: cria os meses em falta, remove os que já não pertencem ao
  // intervalo — preserva pago/fatura dos meses que se mantêm.
  const novos = mesesDoContrato(input.data_inicio, input.data_fim)
  const { data: exist } = await supabase.from('alugueres_contrato_faturacao')
    .select('id, mes').eq('contrato_id', contratoId)
  const existentes = new Set(((exist as { id: string; mes: string }[]) ?? []).map((r) => r.mes))
  const aRemover = ((exist as { id: string; mes: string }[]) ?? []).filter((r) => !novos.includes(r.mes)).map((r) => r.id)
  if (aRemover.length) await supabase.from('alugueres_contrato_faturacao').delete().in('id', aRemover)
  const aInserir = novos.filter((m) => !existentes.has(m))
  if (aInserir.length) {
    const { error: eF } = await supabase.from('alugueres_contrato_faturacao').insert(
      aInserir.map((mes) => ({
        contrato_id: contratoId, mes,
        valor_a_faturar: input.valor_mensal, // prefill com o valor do contrato
        nao_faturar: false, pago: false, validado: false,
      }))
    )
    if (eF) return { error: eF }
  }
  return { error: null }
}

export async function apagarContratoIntl(id: string): Promise<{ error: { message: string } | null }> {
  // equipamentos e faturação caem por ON DELETE CASCADE.
  const { error } = await supabase.from('alugueres_contratos').delete().eq('id', id)
  return { error }
}

// ── Atualizar a faturação de um mês (upsert por contrato+mês) ────────────────
export async function atualizarFaturacaoContrato(
  contratoId: string, mes: string, patch: Partial<ContratoFat>
): Promise<{ data: ContratoFat | null; error: { message: string } | null }> {
  const { data, error } = await supabase.from('alugueres_contrato_faturacao')
    .upsert({ contrato_id: contratoId, mes, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'contrato_id,mes' })
    .select().single()
  return { data: (data as ContratoFat) ?? null, error }
}
