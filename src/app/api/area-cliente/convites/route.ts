import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function staff(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const auth = createClient(url, anon, { auth: { persistSession: false } })
  const { data } = await auth.auth.getUser(jwt)
  if (!data.user) return null
  const db = dbAdmin()
  const { data: perfil } = await db.from('profiles').select('id, nome, email, role').eq('id', data.user.id).single()
  return perfil as { id: string; nome: string | null; email: string | null; role: string } | null
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!token) return Response.json({ ok: false, erro: 'Convite em falta.' }, { status: 400 })
  const db = dbAdmin()
  const { data } = await db.from('cliente_convites')
    .select('id, email, nome, empresa, expira_em, usado_em')
    .eq('token_hash', hashToken(token))
    .single()
  const convite = data as { email: string; nome: string | null; empresa: string | null; expira_em: string; usado_em: string | null } | null
  if (!convite) return Response.json({ ok: false, erro: 'Convite invalido.' }, { status: 404 })
  if (convite.usado_em) return Response.json({ ok: false, erro: 'Convite ja utilizado.' }, { status: 409 })
  if (new Date(convite.expira_em).getTime() < Date.now()) return Response.json({ ok: false, erro: 'Convite expirado.' }, { status: 410 })
  return Response.json({ ok: true, convite: { email: convite.email, nome: convite.nome, empresa: convite.empresa, expira_em: convite.expira_em } })
}

export async function POST(req: Request) {
  const perfil = await staff(req)
  if (!perfil) return Response.json({ ok: false, erro: 'Sem permissao.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { email?: string; nome?: string; empresa?: string; cliente_id?: string; dias?: number } | null
  const email = body?.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) return Response.json({ ok: false, erro: 'Email invalido.' }, { status: 400 })
  const token = crypto.randomBytes(32).toString('base64url')
  const dias = Math.min(Math.max(Number(body?.dias ?? 7), 1), 30)
  const expira = new Date(Date.now() + dias * 864e5).toISOString()
  const db = dbAdmin()
  const { error } = await db.from('cliente_convites').insert({
    token_hash: hashToken(token),
    cliente_id: body?.cliente_id || null,
    email,
    nome: body?.nome?.trim() || null,
    empresa: body?.empresa?.trim() || null,
    expira_em: expira,
    criado_por: perfil.id,
    criado_por_nome: perfil.nome ?? perfil.email,
  })
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
  const origem = new URL(req.url).origin
  return Response.json({ ok: true, link: `${origem}/reservas/registo?convite=${token}`, expira_em: expira })
}

