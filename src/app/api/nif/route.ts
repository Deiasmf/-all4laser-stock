import { createClient } from '@supabase/supabase-js'

// Consulta de dados de um NIF (empresa) no serviço oficial VIES da União Europeia,
// para preencher a ficha de cliente automaticamente. O VIES é gratuito e não exige
// chave nem conta. Acesso: qualquer utilizador com sessão válida (todo o staff gere
// clientes).
// Nota: só devolve dados de entidades registadas em IVA (empresas); NIFs de pessoas
// singulares/sem IVA não têm dados e são preenchidos à mão.

export const runtime = 'nodejs'

type ViesResposta = {
  isValid?: boolean
  name?: string
  address?: string
  userError?: string
}

// A morada vem do VIES numa única cadeia com linhas (ex.:
// "AV 24 DE JULHO N 12\nLISBOA\n1249-300 LISBOA"). Separamos morada,
// código-postal e cidade da melhor forma possível.
function separarMorada(address: string | undefined) {
  const linhas = (address ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (linhas.length === 0) return { morada: null, codigo_postal: null, cidade: null }

  let codigoPostal: string | null = null
  let cidade: string | null = null
  const morada = linhas[0]

  for (const linha of linhas.slice(1)) {
    const m = linha.match(/(\d{4}-\d{3})\s*(.*)/)
    if (m) {
      codigoPostal = m[1]
      if (m[2].trim()) cidade = m[2].trim()
      break
    }
  }
  // Se não houver cidade na linha do código-postal, usa a última linha sem dígitos.
  if (!cidade) {
    const semNumeros = linhas.slice(1).reverse().find((l) => l && !/\d{4}-\d{3}/.test(l))
    if (semNumeros) cidade = semNumeros
  }

  return { morada: morada || null, codigo_postal: codigoPostal, cidade }
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

  try {
    const r = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/PT/vat/${nif}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!r.ok) {
      return Response.json({ ok: false, erro: 'O serviço de consulta (VIES) está indisponível. Tenta mais logo.' })
    }
    const data = (await r.json()) as ViesResposta

    if (!data.isValid) {
      return Response.json({
        ok: false,
        erro: 'Este NIF não está registado como empresa com IVA (pode ser de pessoa singular). Preenche à mão.',
      })
    }

    const nome = data.name && data.name !== '---' ? data.name.trim() : null
    const { morada, codigo_postal, cidade } = separarMorada(data.address)

    if (!nome && !morada) {
      return Response.json({
        ok: false,
        erro: 'O NIF é válido mas sem dados públicos de nome/morada. Preenche à mão.',
      })
    }

    return Response.json({ ok: true, nome, morada, codigo_postal, cidade })
  } catch {
    return Response.json({ ok: false, erro: 'Não foi possível consultar o NIF agora. Tenta de novo.' })
  }
}
