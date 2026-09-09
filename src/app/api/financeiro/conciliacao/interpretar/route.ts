import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { MODELO_DOC } from '@/lib/docExtract'

// Interpreta um descritivo bancário difícil e sugere o NOME da entidade (cliente)
// que fez o pagamento. Devolve só a sugestão de nome + confiança; o cruzamento
// com a base de clientes é feito no browser (não enviamos a lista de clientes à IA).
// Corre no servidor (ANTHROPIC_API_KEY). Acesso: admin/financeiro.

export const runtime = 'nodejs'
export const maxDuration = 30

const TOOL: Anthropic.Tool = {
  name: 'interpretar_movimento',
  description: 'Regista a entidade (cliente) que provavelmente fez este pagamento bancário.',
  input_schema: {
    type: 'object',
    properties: {
      nome_entidade: {
        type: ['string', 'null'],
        description: 'Nome do cliente/entidade que ordenou a transferência, limpo de ruído bancário (nº de operação, "TRF CR SEPA+", "RECEBIDA", IBAN). Ex.: de "TRF CR SEPA+ 0009453 DE LASKIN, UNIPESSOAL,LDA" → "Laskin". null se não der para saber.',
      },
      referencia: { type: ['string', 'null'], description: 'Referência de fatura/documento mencionada, se houver.' },
      confianca: { type: ['string', 'null'], enum: ['alta', 'media', 'baixa', null] },
    },
    required: ['nome_entidade', 'confianca'],
  },
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role ?? ''
  if (!['admin', 'financeiro'].includes(role)) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let body: { descritivo?: string; observacoes?: string | null }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const descritivo = (body.descritivo ?? '').trim()
  if (!descritivo) return Response.json({ ok: false, erro: 'Descritivo em falta.' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, erro: 'IA não configurada no servidor.' }, { status: 503 })

  try {
    const client = new Anthropic()
    const resp = await client.messages.create({
      model: MODELO_DOC,
      max_tokens: 512,
      system: 'És um assistente de conciliação bancária de uma empresa portuguesa de equipamentos de estética. Recebes o descritivo de um movimento de crédito (recebimento) de um extrato bancário e identificas o nome da entidade (cliente) que fez o pagamento, limpo do ruído bancário. Responde sempre pela tool.',
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `Descritivo: "${descritivo}"${body.observacoes ? `\nObservação: "${body.observacoes}"` : ''}` }],
    })
    const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const out = (bloco?.input ?? {}) as { nome_entidade?: string | null; referencia?: string | null; confianca?: string | null }
    return Response.json({ ok: true, nome: out.nome_entidade ?? null, referencia: out.referencia ?? null, confianca: out.confianca ?? null })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 500 })
  }
}
