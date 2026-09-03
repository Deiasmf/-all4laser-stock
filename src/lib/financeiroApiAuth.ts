import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Autenticação partilhada das rotas /api/financeiro/*: valida a sessão do
// utilizador (bearer token) e confirma o acesso financeiro (admin/financeiro).
// A chave da API do Keyinvoice nunca sai do servidor; estas rotas são a única
// porta para o browser, por isso o controlo de acesso vive aqui.

export type AuthOk = { ok: true; sb: SupabaseClient; userId: string }
export type AuthErro = { ok: false; resposta: Response }

export async function exigirFinanceiro(req: Request): Promise<AuthOk | AuthErro> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    return { ok: false, resposta: Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 }) }
  }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, resposta: Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 }) }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error } = await userClient.auth.getUser()
  if (error || !userData?.user) {
    return { ok: false, resposta: Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 }) }
  }
  const sb = createClient(url, service, { auth: { persistSession: false } })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro') {
    return { ok: false, resposta: Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 }) }
  }
  return { ok: true, sb, userId: userData.user.id }
}
