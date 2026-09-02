import { createClient } from '@supabase/supabase-js'
import { obterEmpresa } from '@/lib/keyinvoiceApi'

// Testa a ligação à API do Keyinvoice: autentica e lê os dados da empresa.
// Restrito a admin/financeiro (mesma barreira das restantes rotas do Financeiro).

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // Autenticação + autorização (Financeiro).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  try {
    const empresa = await obterEmpresa()
    return Response.json({ ok: true, empresa: { nome: empresa.Name ?? null, nif: empresa.VATIN ?? null } })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}
