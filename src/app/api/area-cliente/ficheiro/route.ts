import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function utilizador(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!url || !anon || !jwt) return null
  const auth = createClient(url, anon, { auth: { persistSession: false } })
  const { data } = await auth.auth.getUser(jwt)
  return data.user ?? null
}

export async function POST(req: Request) {
  const user = await utilizador(req)
  if (!user) return Response.json({ ok: false, erro: 'Sem sessao.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { tipo?: string; id?: string } | null
  if (!body?.tipo || !body.id) return Response.json({ ok: false, erro: 'Pedido invalido.' }, { status: 400 })
  const db = dbAdmin()
  const { data: perfil } = await db.from('profiles').select('id').eq('id', user.id).maybeSingle()
  const staff = !!perfil

  let bucket = ''
  let caminho: string | null = null
  if (body.tipo === 'documento') {
    const { data } = await db.from('cliente_documentos').select('cliente_portal_id, caminho').eq('id', body.id).single()
    const doc = data as { cliente_portal_id: string; caminho: string } | null
    if (!doc || (!staff && doc.cliente_portal_id !== user.id)) return Response.json({ ok: false, erro: 'Sem acesso.' }, { status: 403 })
    bucket = 'cliente-documentos'; caminho = doc.caminho
  } else if (body.tipo === 'galeria') {
    const { data } = await db.from('cliente_galeria_materiais').select('ativo, caminho').eq('id', body.id).single()
    const mat = data as { ativo: boolean; caminho: string } | null
    if (!mat || (!staff && !mat.ativo)) return Response.json({ ok: false, erro: 'Sem acesso.' }, { status: 403 })
    bucket = 'cliente-galeria'; caminho = mat.caminho
  } else if (body.tipo === 'assistencia') {
    const { data } = await db.from('cliente_assistencia_anexos').select('cliente_portal_id, caminho').eq('id', body.id).single()
    const anexo = data as { cliente_portal_id: string; caminho: string } | null
    if (!anexo || (!staff && anexo.cliente_portal_id !== user.id)) return Response.json({ ok: false, erro: 'Sem acesso.' }, { status: 403 })
    bucket = 'cliente-assistencia'; caminho = anexo.caminho
  }
  if (!bucket || !caminho) return Response.json({ ok: false, erro: 'Tipo desconhecido.' }, { status: 400 })
  const { data, error } = await db.storage.from(bucket).createSignedUrl(caminho, 300)
  if (error || !data?.signedUrl) return Response.json({ ok: false, erro: error?.message ?? 'Nao foi possivel criar link.' }, { status: 500 })
  return Response.json({ ok: true, url: data.signedUrl })
}

