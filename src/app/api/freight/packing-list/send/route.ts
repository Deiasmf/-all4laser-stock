import { createClient } from '@supabase/supabase-js'
import { enviarGmail } from '@/lib/gmailSend'
import { remetenteValido } from '@/types/freight'

// Envia a última versão do PDF da packing list por email (Gmail, com anexo).
// Autenticado (admin/administrativo). Corre no servidor.

export const runtime = 'nodejs'
const BUCKET = 'freight-quotes'

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (!['admin', 'financeiro', 'standard'].includes(role ?? '')) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let corpo: { packingListId?: string; para?: string[]; assunto?: string; corpo?: string; remetente?: string }
  try { corpo = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const plId = corpo.packingListId
  const para = (corpo.para ?? []).map((e) => e.trim()).filter((e) => e.includes('@'))
  if (!plId) return Response.json({ ok: false, erro: 'Falta packingListId.' }, { status: 400 })
  if (para.length === 0) return Response.json({ ok: false, erro: 'Indica pelo menos um email de destino.' }, { status: 400 })

  const { data: plRow } = await db.from('packing_lists').select('numero').eq('id', plId).single()
  const numero = (plRow as { numero?: string } | null)?.numero ?? 'Packing-List'

  const { data: pdfRow } = await db.from('packing_list_pdfs').select('pdf_path, versao').eq('packing_list_id', plId).order('versao', { ascending: false }).limit(1).single()
  const path = (pdfRow as { pdf_path?: string } | null)?.pdf_path
  if (!path) return Response.json({ ok: false, erro: 'Gera primeiro o PDF da packing list.' }, { status: 400 })

  const { data: blob, error: erroDl } = await db.storage.from(BUCKET).download(path)
  if (erroDl || !blob) return Response.json({ ok: false, erro: 'Não consegui obter o PDF.' }, { status: 500 })
  const contentBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64')

  const remetente = remetenteValido(corpo.remetente) ? corpo.remetente!.trim() : undefined
  const assunto = (corpo.assunto && corpo.assunto.trim()) || `All4laser — Packing List ${numero}`
  const corpoTexto = (corpo.corpo && corpo.corpo.trim())
    || `Boa tarde,\n\nSegue em anexo a packing list ${numero}.\n\nCom os melhores cumprimentos,\nAll4laser`

  const r = await enviarGmail({
    para, assunto, corpoTexto, remetente,
    anexos: [{ filename: `${numero}.pdf`, contentBase64, mimeType: 'application/pdf' }],
  })
  if (!r.ok) return Response.json({ ok: false, erro: r.erro ?? 'Falha no envio.' }, { status: 500 })
  return Response.json({ ok: true, messageId: r.messageId })
}
