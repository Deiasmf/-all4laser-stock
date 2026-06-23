import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Endpoint público para o formulário do website submeter novas leads.
// Usa a SERVICE ROLE no servidor (ignora a RLS) — a chave nunca vai para o browser.

const CANAIS = ['website', 'email', 'facebook', 'instagram', 'bimedis']

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

  // Aceita nomes de campo em português OU inglês (o formulário do site usa
  // name/phone/message; mantemos nome/telefone/mensagem por compatibilidade).
  const nome = String(corpo.nome ?? corpo.name ?? '').trim()
  if (!nome) {
    return Response.json({ ok: false, erro: 'O nome é obrigatório.' }, { status: 400, headers: corsHeaders })
  }

  const texto = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s ? s : null
  }
  // Primeiro valor não-vazio de uma lista de chaves possíveis.
  const campo = (...chaves: string[]) => {
    for (const k of chaves) { const v = texto(corpo[k]); if (v) return v }
    return null
  }
  const canalBruto = String(corpo.canal ?? 'website').toLowerCase()
  const canal = CANAIS.includes(canalBruto) ? canalBruto : 'website'

  // O formulário Wix envia 'equipamento', 'modalidade' e 'datas'.
  // - 'equipamento' → modelo_interesse
  // - 'modalidade' e 'datas' não têm coluna própria na tabela, por isso são
  //   acrescentados ao fim da mensagem (sem alterar o schema da BD).
  const modalidade = texto(corpo.modalidade)
  const datas = texto(corpo.datas)
  const extras = [
    modalidade ? `Modalidade: ${modalidade}` : null,
    datas ? `Datas pretendidas: ${datas}` : null,
  ].filter(Boolean)
  const mensagem = [campo('mensagem', 'message'), ...extras].filter(Boolean).join('\n') || null

  const lead = {
    nome,
    email: campo('email'),
    telefone: campo('telefone', 'phone'),
    cidade: campo('cidade', 'city'),
    mensagem,
    canal,
    modelo_interesse: campo('equipamento', 'modelo_interesse'),
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

  // `success` é o que o formulário Wix espera; `ok` mantém-se para compatibilidade.
  return Response.json(
    { success: true, ok: true, id: (data as { id: string }).id },
    { status: 201, headers: corsHeaders }
  )
}

async function notificarEquipa(lead: {
  nome: string; email: string | null; telefone: string | null; cidade: string | null
  canal: string; modelo_interesse: string | null; mensagem: string | null
  data_inicio: string | null; data_fim: string | null
}) {
  const to = (process.env.LEADS_NOTIFY_EMAILS ?? 'andreia.fernandes@all4laser.com,eduardo.esteves@all4laser.com')
    .split(',').map((s) => s.trim()).filter(Boolean)

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

  // Só envia se o email estiver configurado (SENDGRID_API_KEY); senão não faz nada.
  await enviarEmail({ para: to, assunto: `Nova lead: ${lead.nome}`, html })
}
