import { createClient } from '@supabase/supabase-js'

// Consulta de dados de um NIF (empresa) no serviço NIF.pt, para preencher a ficha
// de cliente automaticamente. A chave do NIF.pt fica só no servidor (NIF_PT_API_KEY).
// Acesso: qualquer utilizador com sessão válida (todo o staff gere clientes).
// Nota: só devolve dados de pessoas coletivas; NIFs de pessoas singulares são
// protegidos e não têm dados públicos.

export const runtime = 'nodejs'

type NifRecord = {
  title?: string
  address?: string
  pc4?: string
  pc3?: string
  city?: string
}

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // Autenticação: basta ter sessão válida (todo o staff pode gerir clientes).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  // Valida o NIF (9 dígitos).
  const nif = (new URL(req.url).searchParams.get('nif') ?? '').replace(/\D/g, '')
  if (nif.length !== 9) {
    return Response.json({ ok: false, erro: 'Indica um NIF com 9 dígitos.' }, { status: 400 })
  }

  const key = process.env.NIF_PT_API_KEY
  if (!key) {
    return Response.json(
      { ok: false, erro: 'Consulta por NIF ainda não configurada (falta a chave do NIF.pt).' },
      { status: 503 }
    )
  }

  try {
    const r = await fetch(`https://www.nif.pt/?json=1&q=${nif}&key=${key}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const data = (await r.json()) as {
      result?: string
      message?: string
      records?: Record<string, NifRecord>
    }

    if (data.result !== 'success' || !data.records || !data.records[nif]) {
      // Sem dados públicos (p. ex. NIF de pessoa singular) ou NIF inexistente.
      return Response.json({
        ok: false,
        erro: data.message || 'Sem dados públicos para este NIF (pode ser de pessoa singular).',
      })
    }

    const rec = data.records[nif]
    const codigoPostal = [rec.pc4, rec.pc3].filter(Boolean).join('-')
    return Response.json({
      ok: true,
      nome: rec.title?.trim() || null,
      morada: rec.address?.trim() || null,
      codigo_postal: codigoPostal || null,
      cidade: rec.city?.trim() || null,
    })
  } catch {
    return Response.json({ ok: false, erro: 'Não foi possível consultar o NIF agora. Tenta de novo.' })
  }
}
