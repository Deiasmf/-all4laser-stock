import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

// Envia ao cliente o documento emitido de um pedido de fatura/pró-forma (anexo).
// Usa a service role para ler o pedido no servidor (a chave nunca vai ao browser).
// Ao enviar com sucesso, marca o pedido como "enviado ao cliente".

type Pedido = {
  numero: string | null
  tipo: string | null
  cliente_nome: string | null
  cliente_email: string | null
  descricao: string | null
  valor: number | null
  documento_url: string | null
}

async function anexoDeUrl(url: string, nomeBase: string) {
  const r = await fetch(url)
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  const type = r.headers.get('content-type') ?? 'application/octet-stream'
  const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'pdf').toLowerCase()
  return { filename: `${nomeBase}.${ext}`, contentBase64: buf.toString('base64'), type }
}

function euro(v: number | null | undefined) {
  if (v == null) return ''
  return v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export async function POST(req: Request) {
  let id: string
  try {
    id = String((await req.json()).id ?? '')
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 })
  }
  if (!id) return Response.json({ ok: false, erro: 'Falta o id do pedido.' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 500 })
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('pedidos_fatura')
    .select('numero, tipo, cliente_nome, cliente_email, descricao, valor, documento_url')
    .eq('id', id)
    .single()
  if (error || !data) {
    return Response.json({ ok: false, erro: 'Pedido não encontrado.' }, { status: 404 })
  }

  const pedido = data as Pedido
  if (!pedido.cliente_email) {
    return Response.json({ ok: false, erro: 'O cliente não tem email definido.' }, { status: 400 })
  }
  if (!pedido.documento_url) {
    return Response.json({ ok: false, erro: 'Ainda não há documento anexado para enviar.' }, { status: 400 })
  }

  const eProForma = pedido.tipo === 'pro_forma'
  const nomeDoc = eProForma ? 'Fatura pró-forma' : 'Fatura'
  const anexo = await anexoDeUrl(pedido.documento_url, `${nomeDoc.replace(/\s+/g, '-')}-${pedido.numero ?? 'pedido'}`)
  const anexos = anexo ? [anexo] : []

  const html = `
    <h2>All4laser — ${nomeDoc}${pedido.numero ? ` ${pedido.numero}` : ''}</h2>
    <p>Olá ${pedido.cliente_nome ?? ''},</p>
    <p>Em anexo segue a ${nomeDoc.toLowerCase()}${pedido.descricao ? ` referente a: ${pedido.descricao}` : ''}${
      pedido.valor != null ? ` (valor: ${euro(pedido.valor)})` : ''
    }.</p>
    <p>Com os melhores cumprimentos,<br/>All4laser</p>
  `

  const r = await enviarEmail({
    para: pedido.cliente_email,
    assunto: `All4laser — ${nomeDoc}${pedido.numero ? ` ${pedido.numero}` : ''}`,
    html,
    anexos,
  })

  if (!r.ok) return Response.json({ ok: false, erro: r.motivo ?? 'Falha no envio.' }, { status: 502 })

  // Marca como enviado ao cliente.
  await supabase
    .from('pedidos_fatura')
    .update({ estado: 'enviado_cliente', enviado_em: new Date().toISOString() })
    .eq('id', id)

  return Response.json({ ok: true })
}
