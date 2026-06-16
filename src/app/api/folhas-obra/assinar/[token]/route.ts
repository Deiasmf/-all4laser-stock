import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// API pública para o cliente assinar a folha de obra através de um link com token.
// Usa a SERVICE ROLE no servidor (ignora a RLS) — a chave nunca vai para o browser.
// O acesso é restringido pelo token (UUID) que identifica a folha.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function servico(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

// Devolve a folha (subset seguro) a partir do token, para mostrar ao cliente.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return Response.json({ ok: false, erro: 'Link inválido.' }, { status: 404 })
  }
  const supabase = servico()
  if (!supabase) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('folhas_obra')
    .select('numero, data_intervencao, tipo_servico, tecnico_nome, cliente_nome, equipamento_modelo, equipamento_sn, trabalho_realizado, estado, assinatura_cliente_at')
    .eq('token_assinatura_cliente', token)
    .maybeSingle()

  if (error || !data) {
    return Response.json({ ok: false, erro: 'Folha não encontrada.' }, { status: 404 })
  }
  return Response.json({ ok: true, folha: data })
}

// Recebe o PNG da assinatura do cliente, faz upload e grava na folha.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!UUID_RE.test(token)) {
    return Response.json({ ok: false, erro: 'Link inválido.' }, { status: 404 })
  }
  const supabase = servico()
  if (!supabase) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  const bytes = Buffer.from(await req.arrayBuffer())
  if (bytes.length === 0 || bytes.length > 2_000_000) {
    return Response.json({ ok: false, erro: 'Assinatura inválida.' }, { status: 400 })
  }

  const { data: folha, error: erroFolha } = await supabase
    .from('folhas_obra')
    .select('id')
    .eq('token_assinatura_cliente', token)
    .maybeSingle()
  if (erroFolha || !folha) {
    return Response.json({ ok: false, erro: 'Folha não encontrada.' }, { status: 404 })
  }

  const caminho = `${folha.id}/cliente-${Date.now()}.png`
  const { error: erroUpload } = await supabase.storage
    .from('assinaturas')
    .upload(caminho, bytes, { contentType: 'image/png' })
  if (erroUpload) {
    return Response.json({ ok: false, erro: 'Erro ao guardar a assinatura.' }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from('assinaturas').getPublicUrl(caminho)
  const { error: erroUpdate } = await supabase
    .from('folhas_obra')
    .update({ assinatura_cliente_url: pub.publicUrl, assinatura_cliente_at: new Date().toISOString() })
    .eq('id', folha.id)
  if (erroUpdate) {
    return Response.json({ ok: false, erro: 'Erro ao registar a assinatura.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
