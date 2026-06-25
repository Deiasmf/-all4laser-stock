import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Envia ao cliente a fatura e a carta de porte de um envio (anexos).
// Usa a service role para ler o envio no servidor (a chave nunca vai ao browser).

type Envio = {
  numero: string | null
  cliente_nome: string | null
  cliente_email: string | null
  valor_a_faturar: number | null
  fatura_url: string | null
  carta_porte_url: string | null
}

async function anexoDeUrl(url: string, nomeBase: string) {
  const r = await fetch(url)
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  const type = r.headers.get('content-type') ?? 'application/octet-stream'
  // Extensão simples a partir do url (pdf/jpg/png...) com fallback.
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase()
  return { filename: `${nomeBase}.${ext}`, contentBase64: buf.toString('base64'), type }
}

export async function POST(req: Request) {
  let id: string
  try {
    id = String((await req.json()).id ?? '')
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }
  if (!id) return Response.json({ ok: false, erro: 'Falta o id do envio.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 })
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('envios_pecas')
    .select('numero, cliente_nome, cliente_email, valor_a_faturar, fatura_url, carta_porte_url')
    .eq('id', id)
    .single()
  if (error || !data) return Response.json({ ok: false, erro: 'Envio não encontrado.' }, { status: 404 })

  const envio = data as Envio
  if (!envio.cliente_email) {
    return Response.json({ ok: false, erro: 'O cliente não tem email definido.' }, { status: 400 })
  }
  if (!envio.fatura_url && !envio.carta_porte_url) {
    return Response.json({ ok: false, erro: 'Não há documentos para enviar.' }, { status: 400 })
  }

  const anexos = []
  if (envio.fatura_url) {
    const a = await anexoDeUrl(envio.fatura_url, `Fatura-${envio.numero ?? 'envio'}`)
    if (a) anexos.push(a)
  }
  if (envio.carta_porte_url) {
    const a = await anexoDeUrl(envio.carta_porte_url, `CartaPorte-${envio.numero ?? 'envio'}`)
    if (a) anexos.push(a)
  }

  const html = `
    <h2>All4laser — Envio ${envio.numero ?? ''}</h2>
    <p>Olá ${envio.cliente_nome ?? ''},</p>
    <p>Em anexo seguem os documentos do seu envio${envio.valor_a_faturar != null ? ` (valor: ${envio.valor_a_faturar.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })})` : ''}.</p>
    <p>Com os melhores cumprimentos,<br/>All4laser</p>
  `

  const r = await enviarEmail({
    para: envio.cliente_email,
    assunto: `All4laser — Documentos do envio ${envio.numero ?? ''}`,
    html,
    anexos,
  })

  if (!r.ok) return Response.json({ ok: false, erro: r.motivo ?? 'Falha no envio.' }, { status: 502 })
  return Response.json({ ok: true })
}
