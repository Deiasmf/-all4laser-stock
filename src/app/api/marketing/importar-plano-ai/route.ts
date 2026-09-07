import { createClient } from '@supabase/supabase-js'
import { extrairPublicacoes, tipoSuportado, type FicheiroDoc } from '@/lib/planoMarketingExtract'

// Extração AI do plano → candidatos a publicações (o utilizador revê e confirma;
// nada é criado aqui). Servidor: valida o staff e chama a Claude.
export const runtime = 'nodejs'
export const maxDuration = 60

type Body = { texto?: string; ficheiro?: FicheiroDoc }

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

  const temTexto = !!(body.texto && body.texto.trim())
  const ficheiro = body.ficheiro
  if (ficheiro && !tipoSuportado(ficheiro.contentType)) {
    return Response.json({ ok: false, erro: 'Ficheiro não suportado. Usa PDF ou imagem — ou cola o texto.' }, { status: 400 })
  }
  if (!temTexto && !ficheiro) return Response.json({ ok: false, erro: 'Envia texto ou um documento.' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, erro: 'IA não configurada.' }, { status: 500 })
  try {
    // Canais ativos (geríveis) para a IA saber quais existem.
    const { data: canaisRows } = await db.from('marketing_canais').select('slug').eq('ativo', true).order('ordem')
    const canaisValidos = ((canaisRows as { slug: string }[]) ?? []).map((c) => c.slug)
    const posts = await extrairPublicacoes({ texto: body.texto, ficheiro }, canaisValidos)
    return Response.json({ ok: true, posts })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 502 })
  }
}
