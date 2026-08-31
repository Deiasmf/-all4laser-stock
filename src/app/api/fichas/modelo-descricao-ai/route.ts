import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// Rascunho AI da descrição de um MODELO (para o utilizador rever e gravar — nunca
// publica automaticamente). Servidor: valida o staff e chama a Claude (Sonnet).
export const runtime = 'nodejs'
export const maxDuration = 60

const MODELO = 'claude-sonnet-4-6'

type Body = { marca?: string | null; modelo?: string | null }

const TOOL: Anthropic.Tool = {
  name: 'propor_descricao',
  description: 'Propõe uma descrição breve e factual do modelo de equipamento (PT e EN).',
  input_schema: {
    type: 'object',
    properties: {
      descricao_pt: { type: 'string', description: 'Descrição em Português (2-3 frases): tecnologia (tipo de laser/luz e comprimentos de onda só se forem do conhecimento geral e certos) e aplicações típicas.' },
      descricao_en: { type: 'string', description: 'A mesma descrição em Inglês.' },
    },
    required: ['descricao_pt', 'descricao_en'],
  },
}

const SISTEMA = `És um especialista em equipamentos de laser e luz para medicina estética.
Escreve uma descrição BREVE (2-3 frases) e FACTUAL de um modelo, cobrindo a tecnologia
(tipo de laser/luz e comprimentos de onda, apenas se do conhecimento geral e corretos)
e as aplicações típicas. NUNCA inventes especificações, contadores, preços ou dados que
não sejam de conhecimento comum sobre o modelo — se não tiveres a certeza, omite. Tom
profissional e comercial. Devolve PT e EN.`

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return Response.json({ ok: false, erro: 'Configuração em falta.' }, { status: 500 })

  // Autenticação + autorização (qualquer staff)
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (!['admin', 'financeiro', 'standard'].includes(role ?? '')) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let body: Body
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const marca = (body.marca ?? '').trim()
  const modelo = (body.modelo ?? '').trim()
  if (!modelo) return Response.json({ ok: false, erro: 'Indica o modelo.' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, erro: 'IA não configurada.' }, { status: 500 })
  try {
    const anthropic = new Anthropic()
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 800,
      system: SISTEMA,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'propor_descricao' },
      messages: [{ role: 'user', content: `Modelo: ${[marca, modelo].filter(Boolean).join(' ')}` }],
    })
    const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const dados = (bloco?.input ?? {}) as { descricao_pt?: string; descricao_en?: string }
    return Response.json({ ok: true, descricao_pt: dados.descricao_pt ?? '', descricao_en: dados.descricao_en ?? '' })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 502 })
  }
}
