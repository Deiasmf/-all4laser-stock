import { supabase } from './supabase'
import { semAcentos } from './categorizacaoFinanceira'
import { listarMovimentos, alocarFaturas, entidadeIdDe, type MovimentoCC } from './contasCorrentes'

// ─────────────────────────────────────────────────────────────────────────────
// CONCILIAÇÃO BANCÁRIA — Fase B: motor de match (créditos → faturas em dívida).
//
// Para cada crédito por conciliar procuramos candidatos entre as faturas em
// dívida (o "por liquidar" real vem do alocarFaturas, que já combina o
// valor_liquidado manual com os créditos FIFO). Camadas de confiança:
//   a) valor exato de 1 fatura + cliente batido no descritivo/observação → ALTA
//   b) valor exato de 1 única fatura (sem nome)                          → MÉDIA
//      (várias faturas com esse valor → AMBÍGUO: apresentar para escolha)
//   c) valor = soma de 2–5 faturas do MESMO cliente identificado          → MÉDIA
//   d) valor < fatura de cliente identificado                             → PARCIAL
//   e) (Fase C) interpretação por IA de descritivos difíceis — a pedido.
//
// NADA concilia sozinho: tudo é sugestão; a confirmação é humana.
// ─────────────────────────────────────────────────────────────────────────────

const EPS = 0.01

export type Confianca = 'alta' | 'media' | 'baixa' | 'ambiguo' | 'nenhuma'

export type FaturaDivida = {
  id: string
  cliente_id: string
  cliente_nome: string
  documento_ref: string | null
  data_documento: string
  data_vencimento: string | null
  valor: number
  porLiquidar: number
}

export type Alocacao = { fatura: FaturaDivida; valor: number }

export type Sugestao = {
  confianca: Confianca
  motivo: string
  alocacoes: Alocacao[]         // proposta pronta a confirmar
  candidatas: FaturaDivida[]    // alternativas para escolha manual
  clienteNome: string | null    // cliente inferido do descritivo
  clienteIds: string[]          // ids de clientes inferidos
}

// ── Normalização de nomes ────────────────────────────────────────────────────
// Tokens NÃO distintivos: formas societárias + palavras de negócio genéricas.
// Um match não pode assentar só nestes (senão "Import Export" casa com tudo).
const TOKENS_SOCIETARIOS = new Set([
  // formas societárias / ligações
  'LDA', 'LD', 'UNIPESSOAL', 'UNIP', 'SA', 'SOCIEDADE', 'EIRELI', 'SL', 'SLU', 'GMBH',
  'LTD', 'LIMITED', 'INC', 'BV', 'AB', 'EE', 'SAS', 'SARL', 'SRL', 'OY', 'AS', 'CO',
  'COMPANY', 'GROUP', 'HOLDING', 'THE', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'AND', 'FOR',
  // termos de negócio genéricos (não distinguem uma entidade)
  'IMPORT', 'EXPORT', 'IMPORTING', 'IMP', 'EXP', 'TRADING', 'TRADE', 'GENERAL',
  'MEDICAL', 'MEDICINE', 'BIOMEDICINE', 'MED', 'CLINICA', 'CLINICAS', 'CLINIC', 'CLINIQUE',
  'LASER', 'LASERS', 'SKIN', 'BEAUTY', 'ESTETICA', 'AESTHETIC', 'AESTHETICS', 'ESTHETIC',
  'CENTER', 'CENTRE', 'CENTRO', 'SAUDE', 'HEALTH', 'SERVICE', 'SERVICES', 'SERVICOS',
  'SOLUTIONS', 'EQUIPMENT', 'EQUIPAMENTOS', 'INTERNATIONAL', 'TECH', 'TECHNOLOGY',
])

export function normNome(s: string): string {
  return semAcentos(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokensSignificativos(s: string): string[] {
  return normNome(s).split(' ').filter((t) => t.length >= 3 && !TOKENS_SOCIETARIOS.has(t))
}

export type ClienteIdx = { id: string; nome: string; nomeNorm: string; tokens: string[]; nif: string | null }

export async function carregarClientesIndex(): Promise<ClienteIdx[]> {
  const { data } = await supabase.from('clientes').select('id, nome, nif')
  return ((data as { id: string; nome: string | null; nif: string | null }[]) ?? [])
    .filter((c) => c.nome)
    .map((c) => ({
      id: c.id, nome: c.nome as string, nomeNorm: normNome(c.nome as string),
      tokens: tokensSignificativos(c.nome as string),
      nif: (c.nif ?? '').replace(/\D/g, '') || null,
    }))
}

// ── Faturas em dívida (por liquidar > 0) ─────────────────────────────────────
export async function carregarFaturasEmDivida(): Promise<FaturaDivida[]> {
  const movs = await listarMovimentos('cliente')
  const porCliente = new Map<string, MovimentoCC[]>()
  for (const m of movs) {
    const id = entidadeIdDe(m)
    if (!id) continue
    const arr = porCliente.get(id)
    if (arr) arr.push(m); else porCliente.set(id, [m])
  }
  const out: FaturaDivida[] = []
  for (const [clienteId, ms] of porCliente) {
    const aloc = alocarFaturas(ms)
    for (const m of ms) {
      if (m.tipo_documento !== 'fatura') continue
      const a = aloc.get(m.id)
      if (!a || a.porLiquidar <= EPS) continue
      out.push({
        id: m.id, cliente_id: clienteId, cliente_nome: m.entidade_nome ?? '—',
        documento_ref: m.documento_ref, data_documento: m.data_documento,
        data_vencimento: m.data_vencimento, valor: m.valor_debito, porLiquidar: a.porLiquidar,
      })
    }
  }
  // Mais antigas primeiro (FIFO / parcial escolhe a mais antiga).
  return out.sort((a, b) => (a.data_documento < b.data_documento ? -1 : a.data_documento > b.data_documento ? 1 : 0))
}

// ── Inferência do cliente a partir do descritivo / observação ────────────────
// EUR: "TRF CR SEPA+ 0009454 DE <NOME>" → nome após "DE " (mas não "P/", que é saída).
// USD: "TRF CRED NÃO SEPA+ RECEBIDA 08194132 <NOME>" → nome após a referência.
export function nomeDoDescritivo(desc: string): string | null {
  const d = desc.replace(/\s+/g, ' ').trim()
  const recebida = d.match(/RECEBIDA\s+\d+\s+(.+)$/i)
  if (recebida) return recebida[1].trim()
  const de = d.match(/\bDE\s+(.+)$/i)
  if (de) return de[1].trim()
  return null
}

// Refs de documento presentes numa observação (ex.: "A4L FT 4 71/618" → "71/618").
function refsNaObservacao(obs: string | null): string[] {
  if (!obs) return []
  const refs = obs.match(/\d+[/-]\d+/g) ?? []
  return refs.map((r) => r.replace(/\s+/g, ''))
}
function refCompativel(docRef: string | null, obsRefs: string[]): boolean {
  if (!docRef || obsRefs.length === 0) return false
  const dr = docRef.replace(/\s+/g, '')
  return obsRefs.some((r) => dr.endsWith(r) || dr.includes(r))
}

// Clientes cujo nome bate o texto inferido (todos os tokens significativos do
// candidato estão no nome do cliente, ou vice-versa) — ou NIF presente no texto.
export function clientesQueBatem(desc: string, obs: string | null, clientes: ClienteIdx[]): ClienteIdx[] {
  const alvoNome = nomeDoDescritivo(desc)
  const textoNif = (desc + ' ' + (obs ?? '')).replace(/\D/g, ' ')
  const nifs = textoNif.split(' ').filter((n) => n.length === 9)
  const porNif = nifs.length ? clientes.filter((c) => c.nif && nifs.includes(c.nif)) : []
  if (porNif.length) return porNif
  if (!alvoNome) return []
  return clientesPorNome(alvoNome, clientes)
}

// Casa um nome (ex.: extraído ou sugerido pela IA) com os clientes por tokens.
export function clientesPorNome(alvoNome: string | null, clientes: ClienteIdx[]): ClienteIdx[] {
  if (!alvoNome) return []
  const alvoTokens = tokensSignificativos(alvoNome)
  if (alvoTokens.length === 0) return []
  // Pontua cada cliente pela sobreposição de tokens distintivos.
  const pontuados = clientes
    .map((c) => {
      if (c.tokens.length === 0) return { c, score: 0 }
      const inter = alvoTokens.filter((t) => c.tokens.includes(t))
      const subconjunto = inter.length >= 1 && (inter.length === alvoTokens.length || inter.length === c.tokens.length)
      const ok = inter.length >= 2 || subconjunto
      return { c, score: ok ? inter.length : 0 }
    })
    .filter((x) => x.score > 0)
  if (pontuados.length === 0) return []
  // Fica só com a melhor camada de sobreposição (evita falsos múltiplos por 1 token).
  const max = Math.max(...pontuados.map((x) => x.score))
  return pontuados.filter((x) => x.score === max).map((x) => x.c)
}

// ── Combinações de faturas que somam ≈ alvo (2..maxN) ────────────────────────
export function combinacaoSoma(faturas: FaturaDivida[], alvo: number, maxN = 5): FaturaDivida[] | null {
  const arr = faturas.slice().sort((a, b) => a.porLiquidar - b.porLiquidar)
  const n = arr.length
  let achado: FaturaDivida[] | null = null
  function dfs(inicio: number, escolhidas: FaturaDivida[], soma: number) {
    if (achado) return
    if (escolhidas.length >= 2 && Math.abs(soma - alvo) <= EPS) { achado = escolhidas.slice(); return }
    if (escolhidas.length >= maxN || soma - alvo > EPS) return
    for (let i = inicio; i < n; i++) {
      if (soma + arr[i].porLiquidar - alvo > EPS && escolhidas.length + 1 < 2) { /* continua */ }
      dfs(i + 1, [...escolhidas, arr[i]], soma + arr[i].porLiquidar)
      if (achado) return
    }
  }
  dfs(0, [], 0)
  return achado
}

// ── Sugestão para um movimento de crédito ────────────────────────────────────
export type MovParaMatch = { valor: number; descritivo: string; observacoes?: string | null; sentido: 'credito' | 'debito' }

export function sugerir(mov: MovParaMatch, faturas: FaturaDivida[], clientes: ClienteIdx[]): Sugestao {
  const vazio: Sugestao = { confianca: 'nenhuma', motivo: 'Sem correspondência automática.', alocacoes: [], candidatas: [], clienteNome: null, clienteIds: [] }
  if (mov.sentido !== 'credito') return vazio

  const alvo = mov.valor
  const clientesBatem = clientesQueBatem(mov.descritivo, mov.observacoes ?? null, clientes)
  const clienteIds = clientesBatem.map((c) => c.id)
  const clienteNome = nomeDoDescritivo(mov.descritivo)
  const obsRefs = refsNaObservacao(mov.observacoes ?? null)

  const exatas = faturas.filter((f) => Math.abs(f.porLiquidar - alvo) <= EPS)
  const doCliente = clienteIds.length ? faturas.filter((f) => clienteIds.includes(f.cliente_id)) : []

  // Bónus: ref da fatura escrita na observação + valor exato → confiança alta.
  const porRef = exatas.filter((f) => refCompativel(f.documento_ref, obsRefs))
  if (porRef.length === 1) {
    return { confianca: 'alta', motivo: 'Valor exato e a referência da fatura consta na observação.', alocacoes: [{ fatura: porRef[0], valor: alvo }], candidatas: [], clienteNome, clienteIds }
  }

  // (a) valor exato + cliente batido no descritivo.
  const exatasCliente = exatas.filter((f) => clienteIds.includes(f.cliente_id))
  if (exatasCliente.length === 1) {
    return { confianca: 'alta', motivo: `Valor exato da fatura em dívida e o nome "${clienteNome ?? exatasCliente[0].cliente_nome}" bate com o cliente.`, alocacoes: [{ fatura: exatasCliente[0], valor: alvo }], candidatas: [], clienteNome, clienteIds }
  }
  if (exatasCliente.length > 1) {
    return { confianca: 'media', motivo: 'Várias faturas do mesmo cliente com este valor — escolhe qual.', alocacoes: [], candidatas: exatasCliente, clienteNome, clienteIds }
  }

  // (b) valor exato de uma única fatura (sem nome).
  if (exatas.length === 1) {
    return { confianca: 'media', motivo: 'Valor igual ao de uma fatura em dívida (sem confirmação de nome).', alocacoes: [{ fatura: exatas[0], valor: alvo }], candidatas: [], clienteNome, clienteIds }
  }
  if (exatas.length > 1) {
    return { confianca: 'ambiguo', motivo: `${exatas.length} faturas em dívida com este valor — escolhe qual (não concilio sozinho).`, alocacoes: [], candidatas: exatas, clienteNome, clienteIds }
  }

  // (c) soma de 2–5 faturas do mesmo cliente.
  if (doCliente.length >= 2) {
    const combo = combinacaoSoma(doCliente, alvo)
    if (combo) {
      return { confianca: 'media', motivo: `Valor igual à soma de ${combo.length} faturas de ${clienteNome ?? doCliente[0].cliente_nome}.`, alocacoes: combo.map((f) => ({ fatura: f, valor: f.porLiquidar })), candidatas: [], clienteNome, clienteIds }
    }
  }

  // (d) pagamento parcial de uma fatura do cliente (valor menor que o em dívida).
  if (doCliente.length >= 1) {
    const maiores = doCliente.filter((f) => f.porLiquidar - alvo > EPS)
    if (maiores.length >= 1) {
      const escolha = maiores[0] // mais antiga (a lista vem ordenada)
      return { confianca: 'baixa', motivo: `Possível pagamento parcial de ${escolha.documento_ref ?? 'fatura'} (em dívida ${escolha.porLiquidar.toFixed(2)}).`, alocacoes: [{ fatura: escolha, valor: alvo }], candidatas: doCliente, clienteNome, clienteIds }
    }
    // cliente identificado mas sem fatura que encaixe → deixa candidatas para escolha manual
    return { confianca: 'baixa', motivo: `Cliente ${clienteNome ?? doCliente[0].cliente_nome} identificado, mas nenhum valor encaixa — escolhe à mão.`, alocacoes: [], candidatas: doCliente, clienteNome, clienteIds }
  }

  return { ...vazio, clienteNome }
}

// Sugestões para um conjunto de movimentos (carrega faturas e clientes 1×).
export async function sugerirParaMovimentos(movs: MovParaMatch[]): Promise<Sugestao[]> {
  const [faturas, clientes] = await Promise.all([carregarFaturasEmDivida(), carregarClientesIndex()])
  return movs.map((m) => sugerir(m, faturas, clientes))
}
