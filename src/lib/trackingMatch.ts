// Cruzamento puro dos dados extraídos de uma carta de porte com os dados da
// app: match de transportadora, deteção da direção (nós como remetente = envio;
// nós como destinatário = receção) e correspondência de entidades. Sem
// dependências de Supabase — testável isoladamente (ver trackingMatch.test.ts).
import type { Carrier } from '@/types/tracking'

// Normalização: minúsculas, sem acentos, espaços colapsados.
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Transportadora ──────────────────────────────────────────────────────────
// Alcunhas comuns → código do carrier na tabela (tolerância "DHL Express"→DHL).
const ALCUNHAS: { termos: string[]; codigo: string }[] = [
  { termos: ['dhl'], codigo: 'DHL' },
  { termos: ['ups', 'united parcel'], codigo: 'UPS' },
  { termos: ['fedex', 'federal express'], codigo: 'FEDEX' },
  { termos: ['nacex'], codigo: 'NACEX' },
  { termos: ['ctt', 'correios'], codigo: 'CTT' },
]

// Match tolerante da transportadora extraída contra a tabela carriers.
// Ordem: (1) igualdade de nome/código; (2) alcunhas conhecidas por código;
// (3) o nome extraído contém o nome/código do carrier (ou vice-versa).
export function matchCarrier(nome: string | null | undefined, carriers: Carrier[]): Carrier | null {
  const n = normalizar(nome)
  if (!n) return null
  const ativos = carriers.filter((c) => c.ativo !== false)

  // (1) igualdade exata de nome ou código
  for (const c of ativos) {
    if (normalizar(c.nome) === n || (c.codigo && normalizar(c.codigo) === n)) return c
  }

  // (2) alcunhas conhecidas → código
  for (const a of ALCUNHAS) {
    if (a.termos.some((t) => n.includes(t))) {
      const c = ativos.find((c) => normalizar(c.codigo) === normalizar(a.codigo))
      if (c) return c
    }
  }

  // (3) contenção de tokens (nome extraído ⊇ nome/código do carrier, ou vice-versa)
  for (const c of ativos) {
    const cn = normalizar(c.nome)
    const cc = normalizar(c.codigo)
    if (cn && (n.includes(cn) || cn.includes(n))) return c
    if (cc && cc.length >= 2 && n.split(' ').includes(cc)) return c
  }

  // (4) sobreposição de tokens distintivos (ex.: "TAP Air Cargo" → "TAP Air
  // Portugal"). Ignora palavras genéricas para não casar "Air France" com
  // "Air Canada". Escolhe o carrier com mais tokens distintivos em comum.
  const distintivos = (s: string) =>
    new Set(s.split(' ').filter((t) => t.length >= 3 && !GENERICOS.has(t)))
  const nd = distintivos(n)
  if (nd.size) {
    let melhor: { c: Carrier; overlap: number } | null = null
    for (const c of ativos) {
      const cd = distintivos(normalizar(c.nome))
      const overlap = [...cd].filter((t) => nd.has(t)).length
      if (overlap > 0 && (!melhor || overlap > melhor.overlap)) melhor = { c, overlap }
    }
    if (melhor) return melhor.c
  }
  return null
}

// Palavras genéricas que não distinguem uma transportadora de outra.
const GENERICOS = new Set([
  'air', 'cargo', 'express', 'airlines', 'airline', 'airways', 'company', 'transporte',
  'transportes', 'logistics', 'logistica', 'group', 'international', 'worldwide', 'sky',
])

// ─── Direção (envio vs receção) pela morada da All4laser ─────────────────────
// All4laser: Rua dos Caniços 31/33, Vialonga.
export const TERMOS_ALL4LASER = ['all4laser', 'all 4 laser', 'canicos', 'vialonga']

export function ehAll4laser(...campos: (string | null | undefined)[]): boolean {
  const t = normalizar(campos.filter(Boolean).join(' '))
  return TERMOS_ALL4LASER.some((termo) => t.includes(normalizar(termo)))
}

export type LadoEnvio = {
  nome?: string | null
  morada?: string | null
  pais?: string | null
}

// Nós como remetente → 'envio'; nós como destinatário → 'rececao'.
// Se ambos ou nenhum casarem, devolve null (indeterminado; o utilizador decide).
export function detetarDirecao(remetente: LadoEnvio, destinatario: LadoEnvio): 'envio' | 'rececao' | null {
  const rem = ehAll4laser(remetente.nome, remetente.morada, remetente.pais)
  const dest = ehAll4laser(destinatario.nome, destinatario.morada, destinatario.pais)
  if (rem && !dest) return 'envio'
  if (dest && !rem) return 'rececao'
  return null
}

// ─── Correspondência de entidades (clientes / fornecedores) ──────────────────
export type EntidadeRef = {
  id: string
  nome: string
  morada?: string | null
  tipo: 'cliente' | 'fornecedor'
}

export type EntidadeMatch = { entidade: EntidadeRef; score: number }

// Correspondência por nome (e reforço pela morada). Score 0..1; devolve o melhor
// acima de um limiar. Exige nomes suficientemente específicos para evitar falsos
// positivos (não casa em nomes com < 3 caracteres normalizados).
export function matchEntidade(
  nome: string | null | undefined,
  morada: string | null | undefined,
  entidades: EntidadeRef[],
  limiar = 0.6,
): EntidadeMatch | null {
  const n = normalizar(nome)
  if (n.length < 3) return null
  const nTokens = new Set(n.split(' ').filter((t) => t.length >= 2))
  const m = normalizar(morada)

  let melhor: EntidadeMatch | null = null
  for (const e of entidades) {
    const en = normalizar(e.nome)
    if (!en) continue
    let score = 0
    if (en === n) score = 1
    else if (en.includes(n) || n.includes(en)) score = 0.85
    else {
      // sobreposição de tokens (Jaccard simples)
      const eTokens = new Set(en.split(' ').filter((t) => t.length >= 2))
      const inter = [...nTokens].filter((t) => eTokens.has(t)).length
      const uniao = new Set([...nTokens, ...eTokens]).size
      score = uniao ? inter / uniao : 0
    }
    // reforço pela morada (não penaliza se não houver morada)
    if (score > 0 && m && e.morada) {
      const em = normalizar(e.morada)
      if (em && (em.includes(m) || m.includes(em))) score = Math.min(1, score + 0.1)
    }
    if (!melhor || score > melhor.score) melhor = { entidade: e, score }
  }
  return melhor && melhor.score >= limiar ? melhor : null
}
