import { supabase } from './supabase'
import { formatarEuro, formatarData, compararEmissaoDesc } from './contasCorrentes'
import { extrairDespesas, type TipoDespesa } from './categorizacaoFinanceira'

export { formatarEuro, formatarData }

// ─────────────────────────────────────────────────────────────────────────────
// COMISSÕES DO SERVIÇO TÉCNICO
//
// As faturas de cliente classificadas como "serviço técnico" são canalizadas
// para aqui por trigger da BD (sync_comissao_tecnica). Na área técnica atribui-se
// o técnico (e a folha de obra), retiram-se as despesas — deslocações,
// alimentação e estadia — e a comissão sai por aplicação da taxa do técnico
// sobre o valor elegível:
//
//     base     = valor da fatura − despesas
//     comissão = base × percentagem
//
// A percentagem fica gravada na linha (snapshot): mudar a taxa não reescreve o
// que já foi apurado.
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoComissao = 'por_apurar' | 'apurada' | 'paga'

export const ESTADOS_COMISSAO: { valor: EstadoComissao; label: string; cor: string; bg: string }[] = [
  { valor: 'por_apurar', label: 'Por apurar', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'apurada', label: 'Apurada', cor: '#1E40AF', bg: '#DBEAFE' },
  { valor: 'paga', label: 'Paga', cor: '#065F46', bg: '#D1FAE5' },
]
export function estadoComissaoInfo(v: string) {
  return ESTADOS_COMISSAO.find((e) => e.valor === v) ?? ESTADOS_COMISSAO[0]
}

export type DespesaComissao = {
  id: string
  comissao_id: string
  tipo: TipoDespesa
  descricao: string | null
  valor: number
  origem: 'manual' | 'auto'
  criado_por_nome: string | null
  created_at: string
}

export type Comissao = {
  id: string
  movimento_id: string | null
  cliente_id: string | null
  cliente_nome: string | null
  documento_ref: string | null
  data_documento: string | null
  valor_documento: number
  descricao: string | null
  tecnico_id: string | null
  tecnico_nome: string | null
  folha_obra_id: string | null
  folha_numero: string | null
  percentagem: number | null
  estado: EstadoComissao
  notas: string | null
  origem_anulada: boolean
  apurada_em: string | null
  apurada_por_nome: string | null
  paga_em: string | null
  created_at: string
  updated_at: string
}

export type ComissaoCalc = Comissao & {
  despesas: DespesaComissao[]
  totalDespesas: number
  base: number          // valor elegível (fatura − despesas)
  valorComissao: number // base × percentagem
}

// ─── Cálculo (puro) ──────────────────────────────────────────────────────────

const arred = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function calcularComissao(
  valorDocumento: number,
  despesas: { valor: number }[],
  percentagem: number | null
): { totalDespesas: number; base: number; valorComissao: number } {
  const totalDespesas = arred(despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0))
  const base = arred(Math.max(0, (Number(valorDocumento) || 0) - totalDespesas))
  const valorComissao = percentagem == null ? 0 : arred(base * (percentagem / 100))
  return { totalDespesas, base, valorComissao }
}

export function comComCalculo(c: Comissao, despesas: DespesaComissao[]): ComissaoCalc {
  return { ...c, despesas, ...calcularComissao(c.valor_documento, despesas, c.percentagem) }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export type FiltrosComissao = {
  estado: '' | EstadoComissao
  tecnico_id: string
  de: string
  ate: string
  texto: string
  incluirAnuladas: boolean
}

export const FILTROS_COMISSAO_VAZIOS: FiltrosComissao = {
  estado: '', tecnico_id: '', de: '', ate: '', texto: '', incluirAnuladas: false,
}

export async function listarComissoes(f: FiltrosComissao = FILTROS_COMISSAO_VAZIOS): Promise<ComissaoCalc[]> {
  let q = supabase
    .from('tecnico_comissoes')
    .select('*, tecnico_comissoes_despesas(*)')
    .order('data_documento', { ascending: false })
    .order('created_at', { ascending: false })
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.tecnico_id) q = q.eq('tecnico_id', f.tecnico_id)
  if (f.de) q = q.gte('data_documento', f.de)
  if (f.ate) q = q.lte('data_documento', f.ate)
  if (!f.incluirAnuladas) q = q.eq('origem_anulada', false)

  const { data } = await q.limit(1000)
  type Linha = Comissao & { tecnico_comissoes_despesas: DespesaComissao[] | null }
  let linhas = ((data as Linha[]) ?? []).map((l) =>
    comComCalculo(l, (l.tecnico_comissoes_despesas ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)))
  )
  const termo = f.texto.trim().toLowerCase()
  if (termo) {
    linhas = linhas.filter((c) =>
      `${c.cliente_nome ?? ''} ${c.documento_ref ?? ''} ${c.tecnico_nome ?? ''} ${c.descricao ?? ''}`
        .toLowerCase().includes(termo)
    )
  }
  // Ordem por defeito: emissão mais recente primeiro, com o nº como desempate
  // numérico dentro da série (igual às restantes listagens de faturas).
  return linhas.sort(compararEmissaoDesc)
}

export type ResumoComissoes = {
  n: number
  porApurar: number       // nº de linhas ainda por apurar
  faturado: number
  despesas: number
  base: number
  comissoes: number
  porPagar: number        // comissões apuradas mas ainda não pagas
}

export function resumoComissoes(cs: ComissaoCalc[]): ResumoComissoes {
  return {
    n: cs.length,
    porApurar: cs.filter((c) => c.estado === 'por_apurar').length,
    faturado: arred(cs.reduce((s, c) => s + c.valor_documento, 0)),
    despesas: arred(cs.reduce((s, c) => s + c.totalDespesas, 0)),
    base: arred(cs.reduce((s, c) => s + c.base, 0)),
    comissoes: arred(cs.reduce((s, c) => s + c.valorComissao, 0)),
    porPagar: arred(cs.filter((c) => c.estado === 'apurada').reduce((s, c) => s + c.valorComissao, 0)),
  }
}

// ─── Taxas por técnico ───────────────────────────────────────────────────────

export type TaxaTecnico = {
  tecnico_id: string
  tecnico_nome: string | null
  percentagem: number
  notas: string | null
  atualizado_em: string
  atualizado_por_nome: string | null
}

export async function listarTaxas(): Promise<TaxaTecnico[]> {
  const { data } = await supabase.from('tecnico_comissao_taxas').select('*').order('tecnico_nome')
  return (data as TaxaTecnico[]) ?? []
}

export async function guardarTaxa(
  tecnico: { id: string; nome: string | null },
  percentagem: number,
  porNome: string | null
) {
  return supabase.from('tecnico_comissao_taxas').upsert({
    tecnico_id: tecnico.id,
    tecnico_nome: tecnico.nome,
    percentagem: Math.min(100, Math.max(0, percentagem)),
    atualizado_em: new Date().toISOString(),
    atualizado_por_nome: porNome,
  })
}

// ─── Apuramento ──────────────────────────────────────────────────────────────

// Atribui o técnico e traz a taxa em vigor (snapshot). Uma percentagem já
// gravada na linha não é substituída sem ser pedido.
export async function atribuirTecnico(
  comissaoId: string,
  tecnico: { id: string; nome: string | null } | null,
  percentagem?: number | null
) {
  let pct = percentagem ?? null
  if (tecnico && pct == null) {
    const { data } = await supabase
      .from('tecnico_comissao_taxas')
      .select('percentagem')
      .eq('tecnico_id', tecnico.id)
      .maybeSingle()
    pct = (data as { percentagem: number } | null)?.percentagem ?? null
  }
  const patch: Record<string, unknown> = {
    tecnico_id: tecnico?.id ?? null,
    tecnico_nome: tecnico?.nome ?? null,
  }
  if (pct != null) patch.percentagem = pct
  return supabase.from('tecnico_comissoes').update(patch).eq('id', comissaoId)
}

export async function definirPercentagem(comissaoId: string, percentagem: number | null) {
  return supabase
    .from('tecnico_comissoes')
    .update({ percentagem: percentagem == null ? null : Math.min(100, Math.max(0, percentagem)) })
    .eq('id', comissaoId)
}

export async function ligarFolhaObra(
  comissaoId: string,
  folha: { id: string; numero: string | null } | null
) {
  return supabase
    .from('tecnico_comissoes')
    .update({ folha_obra_id: folha?.id ?? null, folha_numero: folha?.numero ?? null })
    .eq('id', comissaoId)
}

export async function definirEstado(
  comissaoId: string,
  estado: EstadoComissao,
  porNome: string | null
) {
  const patch: Record<string, unknown> = { estado }
  if (estado === 'apurada') {
    patch.apurada_em = new Date().toISOString()
    patch.apurada_por_nome = porNome
    patch.paga_em = null
  } else if (estado === 'paga') {
    patch.paga_em = new Date().toISOString().slice(0, 10)
  } else {
    patch.apurada_em = null
    patch.apurada_por_nome = null
    patch.paga_em = null
  }
  return supabase.from('tecnico_comissoes').update(patch).eq('id', comissaoId)
}

export async function guardarNotas(comissaoId: string, notas: string) {
  return supabase.from('tecnico_comissoes').update({ notas: notas.trim() || null }).eq('id', comissaoId)
}

// ─── Despesas ────────────────────────────────────────────────────────────────

export async function adicionarDespesa(
  comissaoId: string,
  d: { tipo: TipoDespesa; descricao: string | null; valor: number },
  por: { id: string | null; nome: string | null },
  origem: 'manual' | 'auto' = 'manual'
) {
  return supabase.from('tecnico_comissoes_despesas').insert({
    comissao_id: comissaoId,
    tipo: d.tipo,
    descricao: d.descricao?.trim() || null,
    valor: Math.max(0, d.valor),
    origem,
    criado_por: por.id,
    criado_por_nome: por.nome,
  })
}

export async function removerDespesa(id: string) {
  return supabase.from('tecnico_comissoes_despesas').delete().eq('id', id)
}

// Lê a descrição do documento e lança as despesas que consegue identificar.
// Só corre se ainda não houver despesas automáticas (não duplica lançamentos).
export async function detetarDespesasDoDocumento(
  c: ComissaoCalc,
  por: { id: string | null; nome: string | null }
): Promise<number> {
  if (c.despesas.some((d) => d.origem === 'auto')) return 0
  const detetadas = extrairDespesas(c.descricao)
  for (const d of detetadas) {
    await adicionarDespesa(c.id, { tipo: d.tipo, descricao: d.descricao, valor: d.valor }, por, 'auto')
  }
  return detetadas.length
}

// ─── Folhas de obra sugeridas (mesmo cliente, data próxima) ──────────────────

export type FolhaOpc = { id: string; numero: string; data_intervencao: string; tecnico_id: string | null; tecnico_nome: string | null }

export async function folhasSugeridas(c: Comissao): Promise<FolhaOpc[]> {
  if (!c.cliente_id) return []
  const { data } = await supabase
    .from('folhas_obra')
    .select('id, numero, data_intervencao, tecnico_id, tecnico_nome')
    .eq('cliente_id', c.cliente_id)
    .order('data_intervencao', { ascending: false })
    .limit(20)
  const folhas = (data as FolhaOpc[]) ?? []
  if (!c.data_documento) return folhas.slice(0, 8)
  const alvo = Date.parse(c.data_documento)
  return folhas
    .slice()
    .sort((a, b) =>
      Math.abs(Date.parse(a.data_intervencao) - alvo) - Math.abs(Date.parse(b.data_intervencao) - alvo)
    )
    .slice(0, 8)
}
