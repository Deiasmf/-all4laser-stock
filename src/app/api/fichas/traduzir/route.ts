import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'

// Tradução dos campos de texto livre da ficha (PT → EN/ES/FR) com CACHE por
// hash do texto original + idioma. Só chama a IA para os textos ainda sem cache.
export const runtime = 'nodejs'
export const maxDuration = 60

const MODELO = 'claude-sonnet-4-6'
const LINGUA: Record<string, string> = { en: 'Inglês', es: 'Espanhol', fr: 'Francês' }

type Body = { textos?: string[]; idioma?: string }
const hashDe = (s: string) => createHash('sha1').update(s).digest('hex')

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return Response.json({ ok: false, erro: 'Configuração em falta.' }, { status: 500 })

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (!['admin', 'financeiro', 'standard'].includes(role ?? '')) return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })

  let body: Body
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const idioma = (body.idioma ?? '').trim()
  const textos = Array.isArray(body.textos) ? body.textos.map((t) => (t ?? '').toString()) : []
  // PT ou idioma desconhecido → devolve tal e qual.
  if (!LINGUA[idioma]) return Response.json({ ok: true, traducoes: textos })

  const unicos = Array.from(new Set(textos.map((t) => t.trim()).filter(Boolean)))
  const mapa = new Map<string, string>() // textoTrim → tradução

  if (unicos.length) {
    const hashes = unicos.map(hashDe)
    const { data } = await db.from('ficha_traducoes').select('texto_hash, traducao').eq('idioma', idioma).in('texto_hash', hashes)
    const byHash = new Map(((data as { texto_hash: string; traducao: string }[]) ?? []).map((r) => [r.texto_hash, r.traducao]))
    unicos.forEach((u, i) => { const t = byHash.get(hashes[i]); if (t != null) mapa.set(u, t) })
  }

  const faltam = unicos.filter((u) => !mapa.has(u))
  if (faltam.length) {
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, erro: 'IA não configurada.' }, { status: 500 })
    try {
      const anthropic = new Anthropic()
      const TOOL: Anthropic.Tool = {
        name: 'traduzir',
        description: 'Devolve as traduções na MESMA ordem e quantidade dos textos recebidos.',
        input_schema: { type: 'object', properties: { traducoes: { type: 'array', items: { type: 'string' } } }, required: ['traducoes'] },
      }
      const resp = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 3000,
        system: `Traduz de Português para ${LINGUA[idioma]} os textos fornecidos (JSON array). Contexto: equipamentos de laser e luz para medicina estética — mantém a terminologia técnica correta (ex.: handpiece, Nd:YAG, alexandrite). Devolve APENAS as traduções, pela MESMA ordem e quantidade, sem comentários.`,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'traduzir' },
        messages: [{ role: 'user', content: JSON.stringify(faltam) }],
      })
      const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const arr = ((bloco?.input as { traducoes?: string[] })?.traducoes ?? []) as string[]
      const linhas = faltam.map((f, i) => {
        const trad = (arr[i] ?? f).toString()
        mapa.set(f, trad)
        return { texto_hash: hashDe(f), idioma, traducao: trad }
      })
      if (linhas.length) await db.from('ficha_traducoes').upsert(linhas, { onConflict: 'texto_hash,idioma' })
    } catch (e) {
      return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na tradução.' }, { status: 502 })
    }
  }

  const out = textos.map((t) => { const k = t.trim(); return k ? (mapa.get(k) ?? t) : t })
  return Response.json({ ok: true, traducoes: out })
}
