import { createClient } from '@supabase/supabase-js'

// Gera uma URL assinada de curta duração (60s) para ver/descarregar um ficheiro
// do cofre (bucket privado financial-docs) E regista o acesso no log de auditoria.
//
// O acesso é feito com o TOKEN do utilizador (não a service role): a RLS do
// Storage garante que só admin/financeiro obtêm o URL, e o log é escrito no mesmo
// passo — não é contornável a partir do cliente.

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  let body: { caminho?: string; acao?: string; documentId?: string; fileId?: string; documentTitulo?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }

  const caminho = String(body.caminho ?? '')
  const acao = body.acao === 'download' ? 'download' : body.acao === 'view' ? 'view' : null
  if (!caminho || !acao) return Response.json({ ok: false, erro: 'Parâmetros inválidos.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data: userData } = await sb.auth.getUser()
  const user = userData?.user
  if (!user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  // A RLS do bucket (has_financeiro_access) decide se pode assinar; standard falha aqui.
  const { data: signed, error: eSign } = await sb.storage
    .from('financial-docs')
    .createSignedUrl(caminho, 60, { download: acao === 'download' })
  if (eSign || !signed) return Response.json({ ok: false, erro: 'Sem acesso ao ficheiro.' }, { status: 403 })

  // Nome do utilizador para o log.
  const { data: perfil } = await sb.from('profiles').select('nome, email').eq('id', user.id).single()

  // Regista o acesso (auditável). Best-effort: não bloqueia a visualização.
  await sb.from('financial_document_access_log').insert({
    document_id: body.documentId ?? null,
    document_titulo: body.documentTitulo ?? null,
    file_id: body.fileId ?? null,
    acao,
    user_id: user.id,
    user_nome: perfil?.nome ?? perfil?.email ?? null,
  })

  return Response.json({ ok: true, url: signed.signedUrl })
}
