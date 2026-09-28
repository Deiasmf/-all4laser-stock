import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function userFromReq(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!url || !anon || !jwt) return null
  const auth = createClient(url, anon, { auth: { persistSession: false } })
  const { data } = await auth.auth.getUser(jwt)
  return data.user ?? null
}

const seguro = (n: string) => n.normalize('NFD').replace(/[^\w.\-]/g, '_')
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

export async function POST(req: Request) {
  const user = await userFromReq(req)
  if (!user) return Response.json({ ok: false, erro: 'Sem sessao.' }, { status: 401 })
  const form = await req.formData()
  const equipamento = String(form.get('equipamento') ?? '').trim()
  const descricao = String(form.get('descricao') ?? '').trim()
  if (!equipamento || !descricao) return Response.json({ ok: false, erro: 'Indica equipamento e descricao.' }, { status: 400 })

  const db = dbAdmin()
  const { data: cliRow } = await db.from('clientes_portal').select('*').eq('id', user.id).single()
  const cli = cliRow as { id: string; cliente_id: string | null; nome: string | null; email: string | null; telefone: string | null } | null
  if (!cli) return Response.json({ ok: false, erro: 'Conta de cliente nao encontrada.' }, { status: 403 })

  const { data: pedidoRow, error } = await db.from('cliente_assistencia_pedidos').insert({
    cliente_portal_id: cli.id,
    cliente_id: cli.cliente_id,
    equipamento,
    numero_serie: String(form.get('numero_serie') ?? '').trim() || null,
    descricao,
    equipamento_parado: String(form.get('equipamento_parado') ?? '') === 'true',
    contacto: String(form.get('contacto') ?? '').trim() || cli.telefone || cli.email,
  }).select('*').single()
  if (error || !pedidoRow) return Response.json({ ok: false, erro: error?.message ?? 'Nao foi possivel registar.' }, { status: 500 })
  const pedido = pedidoRow as { id: string; numero: string | null; contacto: string | null; equipamento_parado: boolean }

  const ficheiros = form.getAll('anexos').filter((f): f is File => f instanceof File && f.size > 0)
  for (const f of ficheiros.slice(0, 6)) {
    const caminho = `${cli.id}/${pedido.id}/${Date.now()}-${seguro(f.name)}`
    const up = await db.storage.from('cliente-assistencia').upload(caminho, f, { contentType: f.type || 'application/octet-stream' })
    if (!up.error) {
      await db.from('cliente_assistencia_anexos').insert({
        pedido_id: pedido.id,
        cliente_portal_id: cli.id,
        caminho,
        nome_original: f.name,
        mime_type: f.type || null,
        tamanho_bytes: f.size,
      })
    }
  }
  await db.from('cliente_assistencia_mensagens').insert({
    pedido_id: pedido.id,
    cliente_portal_id: cli.id,
    autor_tipo: 'cliente',
    autor_nome: cli.nome ?? 'Cliente',
    mensagem: descricao,
  })

  const { data: cfg } = await db.from('cliente_config').select('email_assistencia').eq('id', true).single()
  const emailAssistencia = ((cfg as { email_assistencia: string } | null)?.email_assistencia || process.env.CLIENTE_ASSISTENCIA_EMAIL || 'assistencia@all4laser.com').trim()
  const html = `<h2>Novo pedido de assistencia ${esc(pedido.numero)}</h2>
    <p><strong>Cliente:</strong> ${esc(cli.nome)} (${esc(cli.email)})</p>
    <p><strong>Equipamento:</strong> ${esc(equipamento)}</p>
    <p><strong>Parado:</strong> ${pedido.equipamento_parado ? 'Sim' : 'Nao'}</p>
    <p><strong>Contacto:</strong> ${esc(pedido.contacto)}</p>
    <p>${esc(descricao).replace(/\n/g, '<br>')}</p>`
  const envio = await enviarEmail({ para: emailAssistencia, assunto: `All4laser - Assistencia ${pedido.numero ?? ''}`, html })
  await db.from('cliente_assistencia_pedidos').update({
    email_assistencia_estado: envio.ok ? 'enviado' : 'falhou',
    email_assistencia_erro: envio.ok ? null : envio.motivo ?? 'Email nao enviado.',
  }).eq('id', pedido.id)
  if (cli.email) {
    await enviarEmail({
      para: cli.email,
      assunto: `Pedido recebido ${pedido.numero ?? ''}`,
      html: `<p>Recebemos o seu pedido de assistencia ${esc(pedido.numero)}. A equipa All4laser ira analisar e responder assim que possivel.</p>`,
    })
  }
  return Response.json({ ok: true, id: pedido.id, numero: pedido.numero, email: envio.ok, emailErro: envio.motivo })
}

