// Extração AI do PLANO de publicações → rascunhos de marketing_posts.
// Só corre no servidor (precisa de ANTHROPIC_API_KEY). Aceita texto colado ou
// um documento (PDF/imagem). Nunca cria nada — devolve candidatos para revisão.
import Anthropic from '@anthropic-ai/sdk'

export const MODELO_PLANO = 'claude-sonnet-4-6'

export type FicheiroDoc = { base64: string; contentType: string; nome: string }

// Um post detetado (pré-normalizado para o cliente rever/editar).
export type PostDetetado = {
  titulo_interno: string
  data_prevista: string | null            // YYYY-MM-DD
  canais: string[]                        // subconjunto de CANAIS_VALIDOS
  texto_pt: string | null
  texto_en: string | null
  hashtags: string[]
}

const CANAIS_VALIDOS = ['instagram', 'facebook', 'linkedin', 'site']
const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const PDF = 'application/pdf'

export function tipoSuportado(contentType: string): boolean {
  const t = (contentType || '').toLowerCase()
  return t === PDF || IMAGENS.has(t)
}

const TOOL: Anthropic.Tool = {
  name: 'registar_publicacoes',
  description: 'Regista a lista de publicações de redes sociais detetadas no plano.',
  input_schema: {
    type: 'object',
    properties: {
      publicacoes: {
        type: 'array',
        description: 'Uma entrada por publicação planeada. Se o plano não tiver publicações, devolve lista vazia.',
        items: {
          type: 'object',
          properties: {
            titulo_interno: { type: 'string', description: 'Título curto interno que identifique a publicação (tema/assunto).' },
            data_prevista: { type: ['string', 'null'], description: 'Data prevista de publicação em ISO yyyy-mm-dd, ou null se não indicada.' },
            canais: {
              type: 'array',
              description: 'Canais-alvo. Só estes valores: instagram, facebook, linkedin, site. "site" = site/blog.',
              items: { type: 'string', enum: CANAIS_VALIDOS },
            },
            texto_pt: { type: ['string', 'null'], description: 'Texto/legenda da publicação em Português, se existir. Senão null.' },
            texto_en: { type: ['string', 'null'], description: 'Texto/legenda em Inglês, se existir. Senão null.' },
            hashtags: { type: 'array', description: 'Hashtags sem o símbolo #.', items: { type: 'string' } },
          },
          required: ['titulo_interno', 'data_prevista', 'canais', 'texto_pt', 'texto_en', 'hashtags'],
        },
      },
    },
    required: ['publicacoes'],
  },
}

const SISTEMA = `És um assistente que lê um PLANO DE MARKETING da All4laser (equipamentos de
medicina estética, Portugal) e extrai as PUBLICAÇÕES de redes sociais nele planeadas.
Para cada publicação, identificas o tema (título interno), a data prevista, os canais
(Instagram, Facebook, LinkedIn, Site/Blog), o texto em Português e/ou Inglês quando
existir, e as hashtags. NÃO inventes conteúdo: se um campo não estiver no plano, devolve
null (ou lista vazia para canais/hashtags). Extrai EXATAMENTE o que está escrito. Se o
mesmo conteúdo for para vários canais, junta os canais numa só publicação.`

const INSTRUCAO = 'Extrai todas as publicações planeadas deste plano e regista-as.'

let _client: Anthropic | null = null
function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY.')
  return (_client ??= new Anthropic())
}

function blocoDocumento(f: FicheiroDoc): Anthropic.ContentBlockParam {
  const mt = (f.contentType || '').toLowerCase()
  if (mt === PDF) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
  if (IMAGENS.has(mt)) {
    return { type: 'image', source: { type: 'base64', media_type: mt as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: f.base64 } }
  }
  throw new Error(`Tipo de ficheiro não suportado: ${f.contentType}`)
}

// ── Normalização dos candidatos ──────────────────────────────────────────────
const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}
const listaTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []

function normalizarData(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function normalizar(raw: Record<string, unknown>): PostDetetado | null {
  const titulo = texto(raw.titulo_interno)
  if (!titulo) return null
  const canais = listaTexto(raw.canais).map((c) => c.toLowerCase()).filter((c) => CANAIS_VALIDOS.includes(c))
  const hashtags = listaTexto(raw.hashtags).map((h) => h.replace(/^#+/, '').trim()).filter(Boolean)
  return {
    titulo_interno: titulo,
    data_prevista: normalizarData(raw.data_prevista),
    canais: Array.from(new Set(canais)),
    texto_pt: texto(raw.texto_pt),
    texto_en: texto(raw.texto_en),
    hashtags: Array.from(new Set(hashtags)),
  }
}

// Extrai publicações a partir de texto colado OU de um documento.
export async function extrairPublicacoes(
  entrada: { texto?: string; ficheiro?: FicheiroDoc },
): Promise<PostDetetado[]> {
  const conteudo: Anthropic.ContentBlockParam[] = []
  if (entrada.ficheiro) conteudo.push(blocoDocumento(entrada.ficheiro))
  if (entrada.texto && entrada.texto.trim()) conteudo.push({ type: 'text', text: `PLANO:\n\n${entrada.texto.trim()}` })
  conteudo.push({ type: 'text', text: INSTRUCAO })

  const resp = await cliente().messages.create({
    model: MODELO_PLANO,
    max_tokens: 8000,
    system: SISTEMA,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: conteudo }],
  })
  const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const dados = (bloco?.input ?? {}) as { publicacoes?: unknown }
  const lista = Array.isArray(dados.publicacoes) ? dados.publicacoes : []
  return lista.map((x) => normalizar((x ?? {}) as Record<string, unknown>)).filter(Boolean) as PostDetetado[]
}
