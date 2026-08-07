// Extração de dados a partir de documentos (PDF ou imagem) com a Claude API.
// Núcleo genérico (chamarExtracao) reutilizável — serve o Tracking (carta de
// porte) e, no futuro, outros documentos (ex.: leads). Só corre no servidor
// (precisa de ANTHROPIC_API_KEY). Modelo com visão que aceita PDF e imagens.
import Anthropic from '@anthropic-ai/sdk'
import type { CartaPorteExtraida, CampoCarta, Confianca } from '@/types/cartaPorte'
import { CAMPOS_CARTA } from '@/types/cartaPorte'

export const MODELO_DOC = 'claude-sonnet-4-6'

// Ficheiro a extrair: conteúdo em base64 (sem prefixo data:) + tipo MIME.
export type FicheiroDoc = { base64: string; contentType: string; nome: string }

// Tipos MIME aceites e respetivo bloco de conteúdo da API.
const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const PDF = 'application/pdf'

export function tipoSuportado(contentType: string): boolean {
  const t = (contentType || '').toLowerCase()
  return t === PDF || IMAGENS.has(t)
}

let _client: Anthropic | null = null
function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY.')
  return (_client ??= new Anthropic())
}

// Bloco de conteúdo (documento PDF ou imagem) a partir do ficheiro.
function blocoDocumento(f: FicheiroDoc): Anthropic.ContentBlockParam {
  const mt = (f.contentType || '').toLowerCase()
  if (mt === PDF) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
  }
  if (IMAGENS.has(mt)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: mt as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: f.base64 },
    }
  }
  throw new Error(`Tipo de ficheiro não suportado: ${f.contentType}`)
}

// ─── Núcleo genérico ─────────────────────────────────────────────────────────
// Envia o documento + instrução à IA com tool-use forçado e devolve o objeto
// bruto (input do tool). Reutilizável para qualquer esquema de extração.
export async function chamarExtracao(
  ficheiro: FicheiroDoc,
  opts: { sistema: string; tool: Anthropic.Tool; instrucao: string; maxTokens?: number },
): Promise<Record<string, unknown>> {
  const resp = await cliente().messages.create({
    model: MODELO_DOC,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.sistema,
    tools: [opts.tool],
    tool_choice: { type: 'tool', name: opts.tool.name },
    messages: [
      {
        role: 'user',
        content: [blocoDocumento(ficheiro), { type: 'text', text: opts.instrucao }],
      },
    ],
  })
  const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  return (bloco?.input ?? {}) as Record<string, unknown>
}

// ─── Extração específica: carta de porte / AWB ───────────────────────────────
// (Os tipos CartaPorteExtraida/CampoCarta e o array CAMPOS_CARTA vivem em
//  '@/types/cartaPorte' para poderem ser usados também no cliente.)

const nulavel = (descricao: string) => ({ type: ['string', 'null'], description: descricao })
const nivel = { type: ['string', 'null'], enum: ['alta', 'media', 'baixa', null] as const }

const TOOL_CARTA: Anthropic.Tool = {
  name: 'registar_carta_porte',
  description: 'Regista os dados extraídos da carta de porte / guia de transporte / AWB.',
  input_schema: {
    type: 'object',
    properties: {
      transportadora: nulavel('Transportadora ou companhia aérea, como aparece (ex.: "DHL Express", "TAP Air Cargo").'),
      tipo_transporte: {
        type: ['string', 'null'],
        enum: ['expresso', 'carga_aerea', 'outro', null],
        description: 'expresso (courier UPS/FedEx/DHL/Nacex/CTT), carga_aerea (AWB de companhia aérea), ou outro.',
      },
      tracking_number: nulavel('Número de seguimento do courier (não a AWB).'),
      awb: nulavel('Air Waybill no formato XXX-XXXXXXXX (só carga aérea).'),
      remetente_nome: nulavel('Nome do remetente (quem envia).'),
      remetente_morada: nulavel('Morada do remetente.'),
      remetente_pais: nulavel('País do remetente.'),
      destinatario_nome: nulavel('Nome do destinatário (quem recebe).'),
      destinatario_morada: nulavel('Morada do destinatário.'),
      destinatario_pais: nulavel('País do destinatário.'),
      num_volumes: { type: ['integer', 'null'], description: 'Número de volumes/pacotes.' },
      peso_kg: { type: ['number', 'null'], description: 'Peso total em kg.' },
      dimensoes: nulavel('Dimensões, como indicadas (ex.: "40x30x20 cm").'),
      data_expedicao: nulavel('Data de expedição em formato ISO yyyy-mm-dd, se presente.'),
      servico: nulavel('Serviço/tipo como no documento (ex.: "Express", "Económico", "Aéreo").'),
      confianca: {
        type: 'object',
        description: 'Nível de confiança de cada campo: alta, media ou baixa.',
        properties: Object.fromEntries(CAMPOS_CARTA.map((c) => [c, nivel])),
      },
    },
    required: [...CAMPOS_CARTA, 'confianca'],
  },
}

const SISTEMA_CARTA = `És um assistente que extrai dados de cartas de porte, guias de transporte e AWBs
(Air Waybills) da All4laser, empresa de equipamentos de medicina estética em Portugal.
Lês o documento (PDF ou foto) e extrais os campos pedidos EXATAMENTE como aparecem, sem inventar.
Se um campo não existir ou não for legível, devolve null. Para a AWB usa o formato XXX-XXXXXXXX.
Distingue bem remetente (shipper/from) de destinatário (consignee/to). Indica a confiança de cada
campo: alta (claro e legível), media (parcial/ambíguo), baixa (ilegível ou deduzido).`

const INSTRUCAO_CARTA =
  'Extrai os dados desta carta de porte / guia de transporte / AWB e regista-os com o nível de confiança de cada campo.'

// Sentinelas que o modelo às vezes devolve em vez de null.
const SENTINELAS = new Set(['', 'unknown', '<unknown>', 'n/a', 'na', 'null', 'none', 'desconhecido', 's/ nome', 'sem nome', '-', '—'])
function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && !SENTINELAS.has(s.toLowerCase()) ? s : null
}
function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''))
    return Number.isFinite(n) && v.trim() !== '' ? n : null
  }
  return null
}
function inteiro(v: unknown): number | null {
  const n = numero(v)
  return n === null ? null : Math.round(n)
}

export async function extrairCartaPorte(ficheiro: FicheiroDoc): Promise<CartaPorteExtraida> {
  const dados = await chamarExtracao(ficheiro, {
    sistema: SISTEMA_CARTA,
    tool: TOOL_CARTA,
    instrucao: INSTRUCAO_CARTA,
  })

  const tipoRaw = texto(dados.tipo_transporte)
  const tipo = tipoRaw === 'expresso' || tipoRaw === 'carga_aerea' || tipoRaw === 'outro' ? tipoRaw : null

  // Confiança: só valores válidos, por campo.
  const confRaw = (dados.confianca ?? {}) as Record<string, unknown>
  const confianca: Partial<Record<CampoCarta, Confianca>> = {}
  for (const c of CAMPOS_CARTA) {
    const v = texto(confRaw[c])
    if (v === 'alta' || v === 'media' || v === 'baixa') confianca[c] = v
  }

  return {
    transportadora: texto(dados.transportadora),
    tipo_transporte: tipo,
    tracking_number: texto(dados.tracking_number),
    awb: texto(dados.awb),
    remetente_nome: texto(dados.remetente_nome),
    remetente_morada: texto(dados.remetente_morada),
    remetente_pais: texto(dados.remetente_pais),
    destinatario_nome: texto(dados.destinatario_nome),
    destinatario_morada: texto(dados.destinatario_morada),
    destinatario_pais: texto(dados.destinatario_pais),
    num_volumes: inteiro(dados.num_volumes),
    peso_kg: numero(dados.peso_kg),
    dimensoes: texto(dados.dimensoes),
    data_expedicao: texto(dados.data_expedicao),
    servico: texto(dados.servico),
    confianca,
  }
}
