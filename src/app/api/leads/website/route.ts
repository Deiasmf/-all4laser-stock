import { createClient } from '@supabase/supabase-js'

// Endpoint público para o formulário do website submeter novas leads.
// Usa a SERVICE ROLE no servidor (ignora a RLS) — a chave nunca vai para o browser.

const CANAIS = ['website', 'email', 'facebook', 'instagram']

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.LEADS_ALLOW_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: Request) {
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400, headers: corsHeaders })
  }

  const nome = String(corpo.nome ?? '').trim()
  if (!nome) {
    return Response.json({ ok: false, erro: 'O nome é obrigatório.' }, { status: 400, headers: corsHeaders })
  }

  const texto = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s ? s : null
  }
  const canalBruto = String(corpo.canal ?? 'website').toLowerCase()
  const canal = CANAIS.includes(canalBruto) ? canalBruto : 'website'

  const lead = {
    nome,
    email: texto(corpo.email),
    telefone: texto(corpo.telefone),
    cidade: texto(corpo.cidade),
    mensagem: texto(corpo.mensagem),
    canal,
    modelo_interesse: texto(corpo.modelo_interesse),
    data_inicio: texto(corpo.data_inicio),
    data_fim: texto(corpo.data_fim),
    estado: 'nova',
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json(
      { ok: false, erro: 'Servidor não configurado (falta SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500, headers: corsHeaders }
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.from('leads').insert(lead).select('id').single()

  if (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500, headers: corsHeaders })
  }

  // Notificação por email (só se o Resend estiver configurado). Falha não bloqueia a resposta.
  await notificarEquipa(lead).catch(() => {})

  return Response.json({ ok: true, id: (data as { id: string }).id }, { status: 201, headers: corsHeaders })
}

async function notificarEquipa(lead: {
  nome: string; email: string | null; telefone: string | null; cidade: string | null
  canal: string; modelo_interesse: string | null; mensagem: string | null
  data_inicio: string | null; data_fim: string | null
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return // email desligado até a chave existir

  const to = (process.env.LEADS_NOTIFY_EMAILS ?? 'andreia.fernandes@all4laser.com,eduardo.esteves@all4laser.com')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const from = process.env.RESEND_FROM ?? 'All4laser <leads@all4laser.com>'

  const linha = (rotulo: string, v: string | null) => (v ? `<p><strong>${rotulo}:</strong> ${v}</p>` : '')
  const html = `
    <h2>Nova lead — ${lead.nome}</h2>
    ${linha('Canal', lead.canal)}
    ${linha('Email', lead.email)}
    ${linha('Telefone', lead.telefone)}
    ${linha('Cidade', lead.cidade)}
    ${linha('Modelo de interesse', lead.modelo_interesse)}
    ${linha('Datas pretendidas', lead.data_inicio || lead.data_fim ? `${lead.data_inicio ?? '?'} – ${lead.data_fim ?? '?'}` : null)}
    ${linha('Mensagem', lead.mensagem)}
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: `Nova lead: ${lead.nome}`, html }),
  })
}
