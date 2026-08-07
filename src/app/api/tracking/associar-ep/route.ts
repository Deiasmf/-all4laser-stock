import { createClient } from '@supabase/supabase-js'

// Associa um envio (criado a partir de uma carta de porte) a uma Encomenda (EP)
// que ainda não tinha tracking: escreve o tracking/AWB na envios_pecas. O trigger
// de sincronização já existente (trg_sync_envios_pecas_tracking) deteta o mesmo
// tracking/AWB e liga a EP ao envio criado (dedup_key), sem duplicar.
// NÃO mexe na transportadora da EP (tem CHECK a valores fixos) — o envio criado
// já tem a transportadora certa. Corre no servidor (admin/administrativo).

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'administrativo') return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let body: { epId?: string; tracking_numero?: string | null; awb_numero?: string | null }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const epId = body.epId
  const tracking = (body.tracking_numero ?? '').trim()
  const awb = (body.awb_numero ?? '').trim()
  if (!epId) return Response.json({ ok: false, erro: 'Falta epId.' }, { status: 400 })
  if (!tracking && !awb) return Response.json({ ok: false, erro: 'Sem tracking nem AWB para associar.' }, { status: 400 })

  // Só preenche o que a EP ainda não tem (não sobrescreve valores existentes).
  const { data: ep, error: erroEp } = await db
    .from('envios_pecas').select('id, tracking_numero, awb_numero').eq('id', epId).single()
  if (erroEp || !ep) return Response.json({ ok: false, erro: 'Encomenda não encontrada.' }, { status: 404 })
  const linha = ep as { tracking_numero: string | null; awb_numero: string | null }

  const patch: { tracking_numero?: string; awb_numero?: string } = {}
  if (tracking && !linha.tracking_numero) patch.tracking_numero = tracking
  if (awb && !linha.awb_numero) patch.awb_numero = awb
  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, jaTinha: true })
  }

  const { error: erroUpd } = await db.from('envios_pecas').update(patch).eq('id', epId)
  if (erroUpd) return Response.json({ ok: false, erro: erroUpd.message }, { status: 500 })

  // O trigger de sincronização liga a EP ao envio (mesmo dedup_key).
  return Response.json({ ok: true })
}
