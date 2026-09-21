import { createClient } from '@supabase/supabase-js'
import { notificarNovoPedido } from '@/lib/pedidosFaturaServer'

// Avisa a faturação (recado + email) de um pedido de fatura acabado de criar.
// Chamada pelo cliente logo após criar o pedido. Best-effort.
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false }, { status: 500 })

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) return Response.json({ ok: false }, { status: 401 })

  let id: string
  try { id = String((await req.json()).id ?? '') } catch { return Response.json({ ok: false }, { status: 400 }) }
  if (!id) return Response.json({ ok: false }, { status: 400 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  try { await notificarNovoPedido(db, id) } catch { /* best-effort */ }
  return Response.json({ ok: true })
}
