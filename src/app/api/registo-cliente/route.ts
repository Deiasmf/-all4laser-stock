import { createClient } from '@supabase/supabase-js'

// Endpoint público do formulário de registo de clientes.
// Grava a submissão em `registos_cliente` com estado 'pendente' (nunca escreve
// diretamente em `clientes` — a aprovação é feita por um admin na Fase 3).
// Usa a SERVICE ROLE no servidor (ignora a RLS); a chave nunca vai ao browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

// Texto limpo ou null.
function texto(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

// Normaliza a lista de moradas de entrega, ficando só com entradas que tenham algo.
function moradasEntrega(v: unknown): { etiqueta: string | null; morada: string | null; cidade: string | null; codigo_postal: string | null; pais: string | null }[] {
  if (!Array.isArray(v)) return []
  return v
    .map((m) => ({
      etiqueta: texto((m as Record<string, unknown>)?.etiqueta),
      morada: texto((m as Record<string, unknown>)?.morada),
      cidade: texto((m as Record<string, unknown>)?.cidade),
      codigo_postal: texto((m as Record<string, unknown>)?.codigo_postal),
      pais: texto((m as Record<string, unknown>)?.pais) ?? 'Portugal',
    }))
    .filter((m) => m.etiqueta || m.morada || m.cidade || m.codigo_postal)
    .slice(0, 20)
}

export async function POST(req: Request) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400, headers: corsHeaders })
  }

  // Honeypot anti-spam: campo escondido que só os bots preenchem.
  if (texto(corpo.website)) {
    return Response.json({ ok: true }, { status: 200, headers: corsHeaders })
  }

  const nome = texto(corpo.nome)
  if (!nome) {
    return Response.json({ ok: false, erro: 'Indique o nome da empresa ou do cliente.' }, { status: 400, headers: corsHeaders })
  }
  const email = texto(corpo.email)
  const telefone = texto(corpo.telefone)
  if (!email && !telefone) {
    return Response.json({ ok: false, erro: 'Indique pelo menos um contacto (email ou telefone).' }, { status: 400, headers: corsHeaders })
  }

  const registo = {
    nome,
    nif: texto(corpo.nif),
    email,
    telefone,
    contacto_nome: texto(corpo.contacto_nome),
    morada: texto(corpo.morada),
    cidade: texto(corpo.cidade),
    codigo_postal: texto(corpo.codigo_postal),
    pais: texto(corpo.pais) ?? 'Portugal',
    moradas_entrega: moradasEntrega(corpo.moradas_entrega),
    observacoes: texto(corpo.observacoes),
    estado: 'pendente',
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json(
      { ok: false, erro: 'Servidor não configurado (falta SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500, headers: corsHeaders },
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error } = await supabase.from('registos_cliente').insert(registo)
  if (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500, headers: corsHeaders })
  }

  return Response.json({ ok: true }, { status: 201, headers: corsHeaders })
}
