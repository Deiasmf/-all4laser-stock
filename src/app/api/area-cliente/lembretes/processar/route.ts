import { createClient } from '@supabase/supabase-js'
import { enviarEmail } from '@/lib/email'
import { enviarSms } from '@/lib/sms'

export const runtime = 'nodejs'

function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role nao configurado.')
  return createClient(url, key, { auth: { persistSession: false } })
}

const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

function autorizado(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!autorizado(req)) return Response.json({ ok: false, erro: 'Sem permissao.' }, { status: 403 })
  const db = dbAdmin()
  const { data } = await db.from('cliente_lembretes')
    .select('*, cliente_agendamentos(titulo, inicio, fim, tipo), clientes_portal(email, telefone, preferencias_lembretes)')
    .eq('estado', 'pendente')
    .lte('enviar_em', new Date().toISOString())
    .limit(50)
  type Row = {
    id: string
    canal: 'email' | 'sms' | 'whatsapp' | 'push'
    cliente_agendamentos: { titulo: string; inicio: string; fim: string | null; tipo: string } | null
    clientes_portal: { email: string | null; telefone: string | null; preferencias_lembretes: Record<string, boolean> | null } | null
  }
  const rows = (data as unknown as Row[]) ?? []
  let enviados = 0, falhas = 0
  for (const l of rows) {
    const ag = l.cliente_agendamentos
    const cli = l.clientes_portal
    if (!ag || !cli) continue
    if (cli.preferencias_lembretes && cli.preferencias_lembretes[l.canal] === false) {
      await db.from('cliente_lembretes').update({ estado: 'cancelado', erro: 'Canal desativado pela cliente.' }).eq('id', l.id)
      continue
    }
    let ok = false
    let erro: string | undefined
    const texto = `Lembrete All4laser: ${ag.titulo} em ${new Date(ag.inicio).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}.`
    if (l.canal === 'email') {
      if (!cli.email) erro = 'Cliente sem email.'
      else {
        const r = await enviarEmail({ para: cli.email, assunto: `Lembrete All4laser - ${ag.titulo}`, html: `<p>${esc(texto)}</p>` })
        ok = r.ok; erro = r.motivo
      }
    } else if (l.canal === 'sms') {
      if (!cli.telefone) erro = 'Cliente sem telefone.'
      else {
        const r = await enviarSms(cli.telefone, texto)
        ok = r.ok; erro = r.erro
      }
    } else {
      erro = 'Canal preparado mas ainda sem fornecedor configurado.'
    }
    await db.from('cliente_lembretes').update({
      estado: ok ? 'enviado' : 'falhou',
      erro: ok ? null : erro ?? 'Falha desconhecida.',
      enviado_em: ok ? new Date().toISOString() : null,
    }).eq('id', l.id).eq('estado', 'pendente')
    if (ok) enviados++; else falhas++
  }
  return Response.json({ ok: true, processados: rows.length, enviados, falhas })
}

