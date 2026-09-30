import { createClient } from '@supabase/supabase-js'
import { sondarTipo } from '@/lib/keyinvoiceApi'

// Diagnóstico (só-leitura, admin/financeiro): sonda tipos de documento (DocType)
// do Keyinvoice para descobrir qual corresponde às "Fatura Pró-forma".
// Usa a sonda "soft" (rápida, sem re-auth) e um conjunto dirigido de códigos.
// Não grava nada.

export const runtime = 'nodejs'
export const maxDuration = 120

// Candidatos por defeito: os de venda de baixo número (onde deve estar a pró-forma)
// + os já conhecidos (13 Encomendas, 32 Simplificada, 34 Fatura-Recibo) como controlo.
const DEFEITO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 32, 34]

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro') return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  // Códigos a sondar: ?codes=1,2,3 (senão o conjunto por defeito).
  const codesParam = new URL(req.url).searchParams.get('codes')
  const codes = codesParam
    ? codesParam.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
    : DEFEITO

  try {
    // Em paralelo (a sonda é curta e tolerante). Só reporta os que têm sinal.
    const todos = await Promise.all(codes.map((c) => sondarTipo(c)))
    const achados = todos.filter((t) => t.temSinal)
    return Response.json({ ok: true, sondados: codes, achados })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}
