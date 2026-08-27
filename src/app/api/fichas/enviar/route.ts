import { createClient } from '@supabase/supabase-js'
import { enviarGmail, type AnexoGmail } from '@/lib/gmailSend'

// Envio da ficha de produto por email (Gmail comercial@). O PDF é gerado no
// cliente (jsPDF) e enviado em base64. Servidor: valida o utilizador
// (admin/administrativo), envia UM email com o(s) PDF(s) anexado(s) e regista
// em ficha_envios/ficha_envio_itens (históricos por equipamento e por lead).

export const runtime = 'nodejs'
export const maxDuration = 120

type ItemEnvio = {
  equipamentoId: string
  pdfBase64: string
  filename: string
  incluiuPreco?: boolean
  incluiuSnCompleto?: boolean
  linkId?: string | null
}
type Body = {
  para?: string
  nome?: string
  cc?: string
  assunto?: string
  corpo?: string
  idioma?: string
  leadId?: string | null
  clienteId?: string | null
  itens?: ItemEnvio[]
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  // 1. Autenticação + autorização (admin/administrativo)
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role, nome, email').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string; email?: string } | null
  if (!['admin', 'financeiro', 'standard'].includes(p?.role ?? '')) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  const remetenteNome = p?.nome ?? p?.email ?? 'All4laser'

  // 2. Corpo do pedido
  let body: Body
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const para = (body.para ?? '').trim()
  if (!para.includes('@')) return Response.json({ ok: false, erro: 'Email de destinatário inválido.' }, { status: 400 })
  const itens = (body.itens ?? []).filter((i) => i && i.equipamentoId && i.pdfBase64)
  if (itens.length === 0) return Response.json({ ok: false, erro: 'Sem fichas para enviar.' }, { status: 400 })
  const assunto = (body.assunto ?? '').trim() || 'All4laser'
  const corpo = (body.corpo ?? '').trim() || ' '
  const cc = (body.cc ?? '').split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'))

  // 3. Anexos (PDFs vindos do cliente)
  const anexos: AnexoGmail[] = itens.map((i) => ({
    filename: i.filename?.toLowerCase().endsWith('.pdf') ? i.filename : `${i.filename || 'ficha'}.pdf`,
    contentBase64: i.pdfBase64,
    mimeType: 'application/pdf',
  }))

  // 4. Enviar (Gmail comercial@ por omissão)
  const r = await enviarGmail({ para: [para], cc, assunto, corpoTexto: corpo, anexos })
  if (!r.ok) return Response.json({ ok: false, erro: r.erro ?? 'Falha no envio.', configurado: r.configurado }, { status: 502 })

  // 5. Registo (histórico por equipamento e por lead)
  try {
    const { data: envio } = await db.from('ficha_envios').insert({
      enviado_por: userData.user.id, enviado_por_nome: remetenteNome,
      para_email: para, para_nome: body.nome ?? null,
      lead_id: body.leadId ?? null, cliente_id: body.clienteId ?? null,
      assunto, idioma: body.idioma ?? null,
    }).select('id').single()
    const envioId = (envio as { id: string } | null)?.id
    if (envioId) {
      await db.from('ficha_envio_itens').insert(itens.map((i) => ({
        envio_id: envioId, equipamento_id: i.equipamentoId, link_id: i.linkId ?? null,
        incluiu_preco: !!i.incluiuPreco, incluiu_sn_completo: !!i.incluiuSnCompleto,
      })))
    }
  } catch {
    // o email já saiu; o registo é best-effort e nunca reverte o envio
  }

  return Response.json({ ok: true, messageId: r.messageId })
}
