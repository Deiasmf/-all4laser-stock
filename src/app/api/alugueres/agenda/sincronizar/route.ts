import { createClient } from '@supabase/supabase-js'
import { dbService, sincronizarParagens } from '@/lib/transportesSync'

// Sincronização das paragens a partir dos calendários Google.
//   GET  → cron (GitHub Actions, a cada 30 min), protegido por CRON_SECRET.
//   POST → manual, pela sessão do utilizador (staff), do ecrã da agenda.
// O plano Hobby da Vercel não permite crons de 30 min, por isso o agendamento
// vive no GitHub Actions (como os pedidos de pagamento).

export const runtime = 'nodejs'
export const maxDuration = 300

function cronAutorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

export async function GET(req: Request) {
  if (!cronAutorizado(req)) return Response.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 })
  const sb = dbService()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })
  const r = await sincronizarParagens(sb)
  return Response.json(r)
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = dbService()
  if (!url || !anonKey || !sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: u } = await anon.auth.getUser(jwt)
  if (!u?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await sb.from('profiles').select('id').eq('id', u.user.id).single()
  if (!perfil) return Response.json({ ok: false, erro: 'Apenas staff.' }, { status: 403 })
  const r = await sincronizarParagens(sb)
  return Response.json(r)
}
