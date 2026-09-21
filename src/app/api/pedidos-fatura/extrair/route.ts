import { createClient } from '@supabase/supabase-js'
import { extrairFatura, tipoSuportado } from '@/lib/docExtract'

// Pré-extração dos dados da fatura anexada (nº, data, valor total) por IA, para
// a Vanessa confirmar em vez de digitar. Recebe o id do pedido, lê o documento
// já anexado (documento_url) no servidor e devolve os campos + confiança.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  // Autenticação + autorização (financeiro trata das faturas).
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  if (!['admin', 'financeiro'].includes((perfil as { role?: string } | null)?.role ?? '')) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  let id: string
  try { id = String((await req.json()).id ?? '') } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  if (!id) return Response.json({ ok: false, erro: 'Falta o id do pedido.' }, { status: 400 })

  const { data: pedido } = await db.from('pedidos_fatura').select('documento_url').eq('id', id).single()
  const docUrl = (pedido as { documento_url: string | null } | null)?.documento_url
  if (!docUrl) return Response.json({ ok: false, erro: 'Anexa primeiro o documento da fatura.' }, { status: 400 })

  const r = await fetch(docUrl)
  if (!r.ok) return Response.json({ ok: false, erro: 'Não consegui obter o documento anexado.' }, { status: 502 })
  const contentType = (r.headers.get('content-type') ?? 'application/pdf').split(';')[0].trim()
  if (!tipoSuportado(contentType)) return Response.json({ ok: false, erro: `Tipo não suportado para extração: ${contentType}.` }, { status: 400 })
  const base64 = Buffer.from(await r.arrayBuffer()).toString('base64')

  try {
    const extraido = await extrairFatura({ base64, contentType, nome: 'fatura' })
    return Response.json({ ok: true, extraido })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na extração.' }, { status: 500 })
  }
}
