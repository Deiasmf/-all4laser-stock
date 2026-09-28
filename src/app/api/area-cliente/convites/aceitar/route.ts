import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    token?: string
    password?: string
    nome?: string
    email?: string
    telefone?: string
    empresa?: string
    nif?: string
    morada?: string
    faturacao_nome?: string
    faturacao_nif?: string
    faturacao_morada?: string
  } | null
  if (!body?.token || !body.password || body.password.length < 6) {
    return Response.json({ ok: false, erro: 'Convite ou password invalidos.' }, { status: 400 })
  }
  const db = dbAdmin()
  const { data: conviteRow } = await db.from('cliente_convites').select('*').eq('token_hash', hashToken(body.token)).single()
  const convite = conviteRow as { id: string; cliente_id: string | null; email: string; nome: string | null; empresa: string | null; expira_em: string; usado_em: string | null } | null
  if (!convite) return Response.json({ ok: false, erro: 'Convite invalido.' }, { status: 404 })
  if (convite.usado_em) return Response.json({ ok: false, erro: 'Convite ja utilizado.' }, { status: 409 })
  if (new Date(convite.expira_em).getTime() < Date.now()) return Response.json({ ok: false, erro: 'Convite expirado.' }, { status: 410 })

  const email = convite.email.toLowerCase()
  const nome = body.nome?.trim() || convite.nome || email
  let clienteId = convite.cliente_id
  if (!clienteId) {
    const { data: existente } = await db.from('clientes').select('id').ilike('email', email).maybeSingle()
    clienteId = (existente as { id: string } | null)?.id ?? null
  }
  if (!clienteId) {
    const { data: novo, error } = await db.from('clientes').insert({
      nome,
      email,
      telefone: body.telefone?.trim() || null,
      nif: body.nif?.trim() || null,
      morada: body.morada?.trim() || null,
      pais: 'Portugal',
      nacional: true,
    }).select('id').single()
    if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 })
    clienteId = (novo as { id: string }).id
  }

  const { data: user, error: userError } = await db.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: false,
    user_metadata: { role: 'cliente', nome, telefone: body.telefone?.trim() || '' },
  })
  if (userError || !user.user) return Response.json({ ok: false, erro: userError?.message ?? 'Nao foi possivel criar a conta.' }, { status: 500 })

  const { error: portalError } = await db.from('clientes_portal').upsert({
    id: user.user.id,
    cliente_id: clienteId,
    nome,
    email,
    telefone: body.telefone?.trim() || null,
    empresa: body.empresa?.trim() || convite.empresa,
    nif: body.nif?.trim() || null,
    morada: body.morada?.trim() || null,
    faturacao_nome: body.faturacao_nome?.trim() || nome,
    faturacao_nif: body.faturacao_nif?.trim() || body.nif?.trim() || null,
    faturacao_morada: body.faturacao_morada?.trim() || body.morada?.trim() || null,
    ativo: true,
  })
  if (portalError) return Response.json({ ok: false, erro: portalError.message }, { status: 500 })

  await db.from('cliente_convites').update({ usado_em: new Date().toISOString(), usado_por: user.user.id }).eq('id', convite.id)
  return Response.json({ ok: true, email })
}

