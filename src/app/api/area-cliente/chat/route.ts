import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function userFromReq(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!url || !anon || !jwt) return null
  const auth = createClient(url, anon, { auth: { persistSession: false } })
  const { data } = await auth.auth.getUser(jwt)
  return data.user ?? null
}

export async function POST(req: Request) {
  const user = await userFromReq(req)
  if (!user) return Response.json({ ok: false, erro: 'Sem sessao.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { mensagem?: string; conversaId?: string } | null
  const mensagem = body?.mensagem?.trim()
  if (!mensagem) return Response.json({ ok: false, erro: 'Mensagem vazia.' }, { status: 400 })

  const db = dbAdmin()
  const { data: cliRow } = await db.from('clientes_portal').select('*').eq('id', user.id).single()
  const cli = cliRow as { id: string; cliente_id: string | null; nome: string | null; email: string | null } | null
  if (!cli) return Response.json({ ok: false, erro: 'Conta de cliente nao encontrada.' }, { status: 403 })

  let conversaId = body?.conversaId ?? null
  if (!conversaId) {
    const { data } = await db.from('cliente_chat_conversas').insert({
      cliente_portal_id: cli.id,
      titulo: mensagem.slice(0, 80),
    }).select('id').single()
    conversaId = (data as { id: string } | null)?.id ?? null
  }
  if (!conversaId) return Response.json({ ok: false, erro: 'Nao foi possivel iniciar conversa.' }, { status: 500 })

  await db.from('cliente_chat_mensagens').insert({ conversa_id: conversaId, cliente_portal_id: cli.id, papel: 'cliente', conteudo: mensagem })

  const [{ data: conteudos }, { data: reservas }, { data: docs }, { data: pedidos }] = await Promise.all([
    db.from('cliente_assistente_conteudos').select('titulo, categoria, conteudo').eq('ativo', true).limit(20),
    db.from('cliente_reservas').select('numero, estado, modelo, data_inicio, data_fim').eq('cliente_portal_id', cli.id).order('created_at', { ascending: false }).limit(10),
    db.from('cliente_documentos').select('categoria, titulo, data_documento').eq('cliente_portal_id', cli.id).order('created_at', { ascending: false }).limit(10),
    db.from('cliente_assistencia_pedidos').select('numero, estado, equipamento, created_at').eq('cliente_portal_id', cli.id).order('created_at', { ascending: false }).limit(10),
  ])

  if (!process.env.ANTHROPIC_API_KEY) {
    const resposta = 'O assistente ainda nao esta configurado. A sua mensagem ficou registada e pode ser encaminhada para a equipa All4laser.'
    await db.from('cliente_chat_mensagens').insert({ conversa_id: conversaId, cliente_portal_id: cli.id, papel: 'assistente', conteudo: resposta, sustentado: false })
    return Response.json({ ok: true, conversaId, resposta, modo: 'configuracao_pendente' })
  }

  const contexto = [
    'CONTEUDOS APROVADOS:',
    JSON.stringify(conteudos ?? []),
    'DADOS DA CLIENTE AUTENTICADA:',
    JSON.stringify({ cliente: { nome: cli.nome, email: cli.email }, reservas: reservas ?? [], documentos: docs ?? [], assistencia: pedidos ?? [] }),
  ].join('\n')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const r = await anthropic.messages.create({
    model: process.env.CLIENTE_ASSISTENTE_MODEL || 'claude-sonnet-4-5-20250929',
    max_tokens: 700,
    system:
      'Responde em portugues de Portugal como assistente da All4laser. Usa apenas o contexto fornecido. ' +
      'Se a resposta nao estiver sustentada, diz que nao tens informacao suficiente e oferece encaminhar para a equipa. ' +
      'Questões tecnicas, clinicas, de seguranca ou avarias devem ser encaminhadas para avaliacao humana.',
    messages: [{ role: 'user', content: `${contexto}\n\nPERGUNTA:\n${mensagem}` }],
  })
  const resposta = r.content.map((c) => c.type === 'text' ? c.text : '').join('\n').trim() || 'Nao tenho informacao suficiente para responder.'
  await db.from('cliente_chat_mensagens').insert({ conversa_id: conversaId, cliente_portal_id: cli.id, papel: 'assistente', conteudo: resposta, sustentado: true })
  return Response.json({ ok: true, conversaId, resposta })
}

