import { createClient } from '@supabase/supabase-js'
import { dbService, correrCron, lerIntegracao } from '@/lib/trackingAuto'
import { providerAtivo } from '@/lib/trackingProvider'

// Sincronização manual do tracking, disparada do painel pela SESSÃO do
// utilizador (staff) — não precisa de CRON_SECRET. Faz o mesmo que o cron:
// regista os envios ativos ainda sem tracker + reconcilia os já registados.
// Serve também de diagnóstico: diz se a SHIP24_API_KEY está ativa em produção.

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = dbService()
  if (!url || !anonKey || !sb) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  // Autenticação pela sessão (qualquer staff pode gerir o tracking).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error } = await userClient.auth.getUser()
  if (error || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro' && role !== 'standard') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  // Diagnóstico: sem API key nada acontece — dizer claramente.
  if (!providerAtivo()) {
    return Response.json({ ok: false, erro: 'SHIP24_API_KEY não está configurada em produção (ou o redeploy ainda não a aplicou).' }, { status: 400 })
  }
  const integ = await lerIntegracao(sb)
  if (!integ.ativo) {
    return Response.json({ ok: false, erro: 'A integração está desligada — liga-a primeiro no painel.' }, { status: 400 })
  }

  const r = await correrCron(sb)
  return Response.json({ ...r, providerAtivo: true })
}
