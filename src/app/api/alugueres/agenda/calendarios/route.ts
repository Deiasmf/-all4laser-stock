import { createClient } from '@supabase/supabase-js'
import { listarCalendarios } from '@/lib/googleCalendar'

// Lista os calendários Google acessíveis (via Service Account + delegação).
// Só staff — verifica o token da sessão antes de ler.
export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (chaves Supabase).' }, { status: 500 })
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })

  const res = await listarCalendarios()
  if (!res.ok) return Response.json({ ok: false, erro: res.erro }, { status: 502 })
  return Response.json({ ok: true, calendarios: res.calendarios })
}
