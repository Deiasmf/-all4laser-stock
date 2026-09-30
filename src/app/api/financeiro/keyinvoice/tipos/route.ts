import { createClient } from '@supabase/supabase-js'
import { listarSeries, listarDocumentos } from '@/lib/keyinvoiceApi'

// Diagnóstico (só-leitura, admin/financeiro): sonda os tipos de documento (DocType)
// do Keyinvoice para descobrir qual corresponde às "Fatura Pró-forma".
// Para cada código no intervalo, lista as séries (nome) e uma amostra de documentos.
// Não grava nada — serve para acrescentar o DocType certo à sincronização.

export const runtime = 'nodejs'
export const maxDuration = 300

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Achado = {
  code: number
  series: string[]
  nAmostra: number
  amostra: { num: string; data: string; cliente: string; total: string }[]
  erro?: string
}

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

  // Intervalo de códigos a sondar (por defeito 1..40, cobre os tipos de venda).
  const u = new URL(req.url)
  const de = Math.max(1, Number(u.searchParams.get('de') ?? '1') || 1)
  const ate = Math.min(60, Number(u.searchParams.get('ate') ?? '40') || 40)

  try {
    const achados: Achado[] = []
    for (let code = de; code <= ate; code++) {
      const ach: Achado = { code, series: [], nAmostra: 0, amostra: [] }
      try {
        const series = await listarSeries(code)
        ach.series = series.map((s) => String(s.Name ?? s.Ref ?? s.IdSerie ?? '').trim()).filter(Boolean)
      } catch (e) {
        ach.erro = e instanceof Error ? e.message : String(e)
      }
      await sleep(40)
      try {
        const docs = await listarDocumentos(code, 0)
        ach.nAmostra = docs.length
        ach.amostra = docs.slice(0, 3).map((d) => ({
          num: String(d.DocNum ?? ''),
          data: String(d.Date ?? ''),
          cliente: String(d.ClientName ?? '').trim(),
          total: String(d.GrossTotal ?? ''),
        }))
      } catch (e) {
        if (!ach.erro) ach.erro = e instanceof Error ? e.message : String(e)
      }
      await sleep(40)
      // Só reporta códigos com sinal (séries ou documentos) — omite os vazios/inválidos.
      if (ach.series.length > 0 || ach.nAmostra > 0) achados.push(ach)
    }
    return Response.json({ ok: true, intervalo: { de, ate }, achados })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}
