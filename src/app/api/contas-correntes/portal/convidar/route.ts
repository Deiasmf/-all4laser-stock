import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Convite de um cliente para o portal de Contas Correntes.
//   POST { conta_id, email, nome } — só staff (sessão válida).
// Cria (ou reutiliza) o utilizador auth com app_metadata.role='portal' (o
// handle_new_user não lhe dá profile → sem acesso interno), liga-o à conta em
// portal_users e envia-lhe um magic link por email (SendGrid).

export const runtime = 'nodejs'
export const maxDuration = 60

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

async function obterOuCriarUser(sb: SupabaseClient, email: string, nome: string | null): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    // app_metadata p/ o claim; user_metadata p/ o trigger handle_new_user (o
    // GoTrue só aplica o app_metadata DEPOIS do trigger, por isso o marcador de
    // portal tem de vir também no user_metadata, presente já no INSERT).
    app_metadata: { role: 'portal' },
    user_metadata: { role: 'portal', ...(nome ? { nome } : {}) },
  })
  if (!error && data.user) return data.user.id
  if (error && /registered|already|exists/i.test(error.message)) {
    // Já existe — procurar e garantir o claim de portal.
    for (let page = 1; page <= 20; page++) {
      const { data: lista } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      const u = lista.users.find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase())
      if (u) {
        const role = (u.app_metadata as { role?: string } | undefined)?.role
        if (role !== 'portal') {
          await sb.auth.admin.updateUserById(u.id, { app_metadata: { ...(u.app_metadata ?? {}), role: 'portal' } })
        }
        return u.id
      }
      if (lista.users.length < 200) break
    }
  }
  throw new Error(error?.message ?? 'Não foi possível criar o utilizador.')
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = db()
  if (!sb || !url || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // Sessão + staff (qualquer interno pode gerir os acessos do portal).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await sb.from('profiles').select('role, nome').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string } | null
  if (!p?.role || !['admin', 'financeiro', 'standard'].includes(p.role)) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  let body: { conta_id?: string; email?: string; nome?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const conta_id = (body.conta_id ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const nome = (body.nome ?? '').trim() || null
  if (!conta_id || !email) return Response.json({ ok: false, erro: 'Indica a conta e o email.' }, { status: 400 })

  // A conta tem de existir.
  const { data: conta } = await sb.from('cc_contas').select('id, nome').eq('id', conta_id).maybeSingle()
  if (!conta) return Response.json({ ok: false, erro: 'Conta não encontrada.' }, { status: 404 })

  let userId: string
  try {
    userId = await obterOuCriarUser(sb, email, nome)
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao criar utilizador.' }, { status: 500 })
  }

  // Liga à conta (idempotente por (user_id, conta_id)); reativa se estava inativo.
  const { error: erroPU } = await sb.from('portal_users').upsert(
    { user_id: userId, conta_id, email, nome, ativo: true, criado_por: userData.user.id, criado_por_nome: p.nome ?? null },
    { onConflict: 'user_id,conta_id' },
  )
  if (erroPU) return Response.json({ ok: false, erro: erroPU.message }, { status: 500 })

  // Magic link (gerado, enviado pela nossa infra SendGrid).
  const origem = new URL(req.url).origin
  const redirectTo = `${origem}/portal-cc`
  const { data: link, error: erroLink } = await sb.auth.admin.generateLink({
    type: 'magiclink', email, options: { redirectTo },
  })
  const actionLink = (link as { properties?: { action_link?: string } } | null)?.properties?.action_link
  if (erroLink || !actionLink) {
    return Response.json({ ok: true, avisoEmail: 'Utilizador ligado, mas não consegui gerar o link de acesso.' })
  }

  const html = `<div style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.55">
    <p>Hello${nome ? ' ' + nome : ''},</p>
    <p>You now have access to the <strong>All4laser Client Portal</strong> for the account
       <strong>${conta.nome}</strong>. Click below to sign in:</p>
    <p><a href="${actionLink}" style="background:#0b3d2e;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">Sign in to the portal</a></p>
    <p style="color:#666;font-size:12px">If the button does not work, copy this link:<br>${actionLink}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <p style="color:#666;font-size:13px">Olá${nome ? ' ' + nome : ''}, já tens acesso ao Portal do Cliente da All4laser para a conta <strong>${conta.nome}</strong>. Usa o link acima para entrar.</p>
  </div>`
  const r = await enviarEmail({ para: email, assunto: 'All4laser — Client Portal access', html })

  return Response.json({ ok: true, emailEnviado: r.ok, motivoEmail: r.ok ? null : r.motivo ?? null })
}
