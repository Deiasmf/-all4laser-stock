import { createClient } from '@supabase/supabase-js'

// Webhook do Meta (Facebook / Instagram) para entrada de leads via mensagem.
// - GET  → verificação do webhook (handshake da Meta)
// - POST → recebe mensagens e guarda cada uma como lead (canal facebook/instagram)
//
// Usa a SERVICE ROLE no servidor (ignora a RLS) — a chave nunca vai para o browser.

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'all4laser-2026'

// ---------------------------------------------------------------- GET (verificação)
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    // A Meta espera o challenge devolvido como texto simples.
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new Response('Forbidden', { status: 403 })
}

// ---------------------------------------------------------------- POST (mensagens)
type EventoMeta = {
  object?: string
  entry?: Array<{
    messaging?: Array<{
      sender?: { id?: string }
      message?: { text?: string }
    }>
  }>
}

export async function POST(req: Request) {
  let corpo: EventoMeta
  try {
    corpo = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // object 'instagram' → Instagram; tudo o resto (ex.: 'page') → Facebook.
  const canal = corpo.object === 'instagram' ? 'instagram' : 'facebook'
  const rotulo = canal === 'instagram' ? 'Instagram' : 'Facebook'

  const novas: Array<Record<string, unknown>> = []
  for (const entry of corpo.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const texto = ev.message?.text?.trim()
      if (!texto) continue // ignora eventos sem texto (entregas, leituras, etc.)
      const senderId = ev.sender?.id ?? 'desconhecido'
      novas.push({
        nome: `${rotulo} ${senderId}`,
        email: null,
        telefone: null,
        cidade: null,
        mensagem: texto,
        canal,
        modelo_interesse: null,
        data_inicio: null,
        data_fim: null,
        estado: 'nova',
      })
    }
  }

  // Guardar (se houver mensagens). Mesmo sem nada, devolvemos 200 para a Meta
  // não voltar a tentar nem desativar o webhook.
  if (novas.length > 0) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && serviceKey) {
      const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
      await supabase.from('leads').insert(novas)
    }
  }

  // A Meta exige resposta 200 rápida.
  return new Response('EVENT_RECEIVED', { status: 200 })
}
