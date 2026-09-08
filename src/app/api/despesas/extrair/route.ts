import { createClient } from '@supabase/supabase-js'
import { extrairDespesa, tipoSuportado } from '@/lib/docExtract'
import type { DespesaExtraida, RespostaExtracaoDespesa } from '@/types/despesa'

// Extrai os dados de um talão/fatura de despesa (PDF/imagem) com a Claude API.
// Corre no servidor: valida a sessão (qualquer staff interno) e devolve os campos
// lidos + a confiança de cada um. Nunca falha "a sério": se a extração correr mal,
// devolve resposta parcial para o cliente abrir o formulário manual com a foto.

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 10 * 1024 * 1024   // 10 MB

function vazia(): DespesaExtraida {
  return { fornecedor: null, data_despesa: null, valor: null, iva: null, num_documento: null, confianca: {} }
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // 1) Autenticação.
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  // 2) Autorização: qualquer staff interno.
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role ?? ''
  if (!['admin', 'financeiro', 'standard'].includes(role)) {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  // 3) Corpo: ficheiro em base64.
  let body: { base64?: string; contentType?: string; nome?: string }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const base64 = (body.base64 ?? '').replace(/^data:[^,]*;base64,/, '')
  const contentType = (body.contentType ?? '').toLowerCase()
  const nome = body.nome ?? 'documento'
  if (!base64) return Response.json({ ok: false, erro: 'Ficheiro em falta.' }, { status: 400 })
  if (!tipoSuportado(contentType)) {
    return Response.json({ ok: false, erro: 'Tipo de ficheiro não suportado (usa PDF, JPG ou PNG).' }, { status: 415 })
  }
  const bytes = Math.floor((base64.length * 3) / 4)
  if (bytes > LIMITE_BYTES) return Response.json({ ok: false, erro: 'Ficheiro demasiado grande (máx. 10 MB).' }, { status: 413 })

  // 4) Extração AI. Se falhar, devolve resposta parcial (não bloqueia o upload).
  let extra: DespesaExtraida
  try {
    extra = await extrairDespesa({ base64, contentType, nome })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na extração.'
    const resp: RespostaExtracaoDespesa = {
      ok: true, parcial: true, erro: msg, extraido: vazia(), confianca: {},
      avisos: ['Extração falhou — completa manualmente. A foto fica anexada.'],
    }
    return Response.json(resp)
  }

  const avisos: string[] = []
  const semValor = extra.valor === null
  const semData = !extra.data_despesa
  const parcial = semValor || semData
  if (semValor) avisos.push('Não foi possível ler o valor — confirma-o.')
  if (semData) avisos.push('Não foi possível ler a data — confirma-a.')

  const resp: RespostaExtracaoDespesa = {
    ok: true, parcial, erro: null, extraido: extra, confianca: extra.confianca, avisos,
  }
  return Response.json(resp)
}
