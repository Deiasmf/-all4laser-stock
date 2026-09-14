import { createClient } from '@supabase/supabase-js'
import { importarSelecionadas } from '@/lib/notionSync'

// Confirmar a importação inicial: cria na app as linhas escolhidas na revisão
// (staging, incluir=true) e marca a conta como já revista. Staff autenticado.
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ ok: false, erro: 'Sessão em falta.' }, { status: 401 })
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: u } = await userClient.auth.getUser()
  const uid = u.user?.id
  if (!uid) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await userClient.from('profiles').select('role').eq('id', uid).maybeSingle()
  const role = (perfil as { role: string } | null)?.role
  if (!role || !['admin', 'financeiro', 'standard'].includes(role)) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const r = await importarSelecionadas(sb, uid)
  return Response.json(r)
}
