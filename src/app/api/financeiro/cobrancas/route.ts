import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'
import { alocarFaturas, contaParaSaldo, formatarEuro, formatarData, type MovimentoCC } from '@/lib/contasCorrentes'
import {
  elegivelAuto, preencherModelo, diasDesde, textoAtraso,
  ASSUNTO_PADRAO, MENSAGEM_PADRAO, CONFIG_PADRAO, type ConfigCobrancas,
} from '@/lib/cobrancas'

// Pedidos de pagamento ao cliente (cobranças).
//   POST → envio manual, disparado da página de Cobranças. Valida a sessão e
//          exige admin/financeiro (a área é restrita).
//   GET  → corrida automática (Vercel Cron, protegida por CRON_SECRET): envia
//          apenas aos documentos com lembretes automáticos ligados, respeitando
//          a cadência configurada. ?dryrun=1 calcula sem enviar.
// Cada envio fica registado em financeiro_cobrancas e atualiza lembrete_ultimo.

export const runtime = 'nodejs'
export const maxDuration = 300

const THROTTLE_MS = 400
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Candidato = {
  mov: MovimentoCC
  porLiquidar: number
  diasAtraso: number
  email: string | null
}

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

async function carregarConfig(sb: SupabaseClient): Promise<ConfigCobrancas> {
  const { data } = await sb.from('financeiro_config').select('*').maybeSingle()
  const c = (data ?? {}) as Partial<ConfigCobrancas>
  return {
    ...CONFIG_PADRAO,
    ...c,
    assunto_modelo: c.assunto_modelo || ASSUNTO_PADRAO,
    mensagem_modelo: c.mensagem_modelo || MENSAGEM_PADRAO,
  }
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

// Calcula o que está por liquidar nas faturas indicadas. Para alocar os créditos
// é preciso o extrato completo de cada cliente, não só os documentos pedidos.
async function calcularEmAberto(
  sb: SupabaseClient,
  filtro: { ids?: string[]; soAutomaticos?: boolean }
): Promise<Candidato[]> {
  let q = sb.from('financeiro_movimentos').select('*').eq('entidade_tipo', 'cliente')
  if (filtro.ids?.length) q = q.in('id', filtro.ids)
  if (filtro.soAutomaticos) q = q.eq('lembretes_auto', true)
  const { data: alvo } = await q
  const alvos = ((alvo as MovimentoCC[]) ?? []).filter((m) => m.tipo_documento === 'fatura')
  if (alvos.length === 0) return []

  const clienteIds = [...new Set(alvos.map((m) => m.cliente_id).filter((v): v is string => !!v))]
  const { data: todos } = await sb
    .from('financeiro_movimentos')
    .select('*')
    .eq('entidade_tipo', 'cliente')
    .in('cliente_id', clienteIds)
  const extrato = ((todos as MovimentoCC[]) ?? []).filter(contaParaSaldo)

  const porCliente = new Map<string, MovimentoCC[]>()
  for (const m of extrato) {
    if (!m.cliente_id) continue
    const arr = porCliente.get(m.cliente_id)
    if (arr) arr.push(m)
    else porCliente.set(m.cliente_id, [m])
  }
  const aloc = new Map<string, number>()
  for (const ms of porCliente.values()) {
    for (const [id, a] of alocarFaturas(ms)) aloc.set(id, a.porLiquidar)
  }

  const { data: cls } = await sb.from('clientes').select('id, email').in('id', clienteIds)
  const emails = new Map<string, string | null>()
  for (const c of (cls as { id: string; email: string | null }[]) ?? []) emails.set(c.id, c.email)

  const hoje = hojeISO()
  return alvos
    .map((mov) => ({
      mov,
      porLiquidar: aloc.get(mov.id) ?? 0,
      diasAtraso: mov.data_vencimento
        ? diasDesde(hoje, mov.data_vencimento)
        : diasDesde(hoje, mov.data_documento) - 30,
      email: (mov.cliente_id && emails.get(mov.cliente_id)) || null,
    }))
    .filter((c) => c.porLiquidar > 0.005)
}

function corpoHtml(mensagem: string, c: Candidato): string {
  const paragrafos = mensagem
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  const doc = c.mov.documento_ref ?? 'documento'
  return `<div style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.55">
    ${paragrafos}
    <table style="border-collapse:collapse;font-size:13.5px;margin-top:8px">
      <tr><td style="padding:4px 10px;color:#666">Documento</td><td style="padding:4px 10px"><strong>${doc}</strong></td></tr>
      <tr><td style="padding:4px 10px;color:#666">Data</td><td style="padding:4px 10px">${formatarData(c.mov.data_documento)}</td></tr>
      <tr><td style="padding:4px 10px;color:#666">Vencimento</td><td style="padding:4px 10px">${formatarData(c.mov.data_vencimento)}</td></tr>
      <tr><td style="padding:4px 10px;color:#666">Valor em dívida</td><td style="padding:4px 10px"><strong>${formatarEuro(c.porLiquidar)}</strong> · ${textoAtraso(c.diasAtraso)}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:18px">All4laser · este email foi gerado automaticamente pela gestão de contas correntes.</p>
  </div>`
}

// Envia, regista e atualiza a data do último pedido. Devolve o resumo.
async function enviarLote(
  sb: SupabaseClient,
  cfg: ConfigCobrancas,
  candidatos: Candidato[],
  ctx: { automatico: boolean; porId: string | null; porNome: string | null; dryrun: boolean }
) {
  let enviados = 0
  let falhas = 0
  const erros: string[] = []

  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i]
    const cliente = c.mov.entidade_nome ?? 'Cliente'
    const doc = c.mov.documento_ref ?? 'documento'
    const dados = {
      cliente, documento: doc, valor: c.porLiquidar,
      vencimento: c.mov.data_vencimento, diasAtraso: c.diasAtraso,
    }
    const assunto = preencherModelo(cfg.assunto_modelo || ASSUNTO_PADRAO, dados)
    const mensagem = preencherModelo(cfg.mensagem_modelo || MENSAGEM_PADRAO, dados)

    if (!c.email) {
      falhas++
      erros.push(`${doc}: ${cliente} sem email.`)
      continue
    }
    if (ctx.dryrun) { enviados++; continue }

    const r = await enviarEmail({ para: c.email, assunto, html: corpoHtml(mensagem, c) })
    const ok = r.ok
    if (ok) enviados++
    else { falhas++; erros.push(`${doc}: ${r.motivo ?? 'falha no envio'}`) }

    await sb.from('financeiro_cobrancas').insert({
      movimento_id: c.mov.id,
      cliente_id: c.mov.cliente_id,
      cliente_nome: cliente,
      documento_ref: c.mov.documento_ref,
      valor: c.porLiquidar,
      dias_atraso: c.diasAtraso,
      destinatario: c.email,
      assunto,
      automatico: ctx.automatico,
      ok,
      erro: ok ? null : r.motivo ?? 'falha no envio',
      enviado_por: ctx.porId,
      enviado_por_nome: ctx.porNome,
    })
    if (ok) {
      await sb.from('financeiro_movimentos')
        .update({ lembrete_ultimo: new Date().toISOString() })
        .eq('id', c.mov.id)
    }
    if (i < candidatos.length - 1) await sleep(THROTTLE_MS)
  }
  return { enviados, falhas, erros }
}

// ─── Envio manual ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const sb = db()
  if (!sb || !url || !anonKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // Autenticação + autorização (a cobrança é do Financeiro).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const { data: perfil } = await sb.from('profiles').select('role, nome').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string } | null
  if (p?.role !== 'admin' && p?.role !== 'financeiro') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  let body: { movimento_ids?: string[] }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const ids = (body.movimento_ids ?? []).filter((v) => typeof v === 'string' && v)
  if (ids.length === 0) return Response.json({ ok: false, erro: 'Sem documentos para cobrar.' }, { status: 400 })

  const cfg = await carregarConfig(sb)
  const candidatos = await calcularEmAberto(sb, { ids })
  if (candidatos.length === 0) {
    return Response.json({ ok: false, erro: 'Os documentos indicados já não têm valor em dívida.' }, { status: 400 })
  }

  const r = await enviarLote(sb, cfg, candidatos, {
    automatico: false,
    porId: userData.user.id,
    porNome: p?.nome ?? null,
    dryrun: false,
  })
  return Response.json({ ok: r.falhas === 0, ...r })
}

// ─── Corrida automática (cron) ───────────────────────────────────────────────

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  if ((req.headers.get('authorization') ?? '') === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }
  const sb = db()
  if (!sb) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'
  const cfg = await carregarConfig(sb)
  if (!cfg.lembretes_ativos) {
    return Response.json({ ok: true, enviados: 0, motivo: 'Pedidos automáticos desligados nas definições.' })
  }

  const candidatos = (await calcularEmAberto(sb, { soAutomaticos: true })).filter((c) =>
    elegivelAuto(
      {
        lembretes_auto: c.mov.lembretes_auto,
        porLiquidar: c.porLiquidar,
        diasAtraso: c.diasAtraso,
        ultimoPedido: c.mov.lembrete_ultimo,
        temEmail: !!c.email,
      },
      cfg
    )
  )
  if (candidatos.length === 0) return Response.json({ ok: true, dryrun, enviados: 0, motivo: 'Nada elegível hoje.' })

  const r = await enviarLote(sb, cfg, candidatos, { automatico: true, porId: null, porNome: 'Automático', dryrun })
  return Response.json({
    ok: r.falhas === 0,
    dryrun,
    sendgrid_configurado: !!process.env.SENDGRID_API_KEY,
    candidatos: candidatos.length,
    ...r,
  })
}
