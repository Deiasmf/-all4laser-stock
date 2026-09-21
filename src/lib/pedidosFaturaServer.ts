import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from './email'
import { EMAIL_ANDREIA } from '@/types/freight'

// Lógica de servidor (service role) dos Pedidos de Fatura: notificações e
// lembretes. NÃO importar no cliente (usa a service role e o SendGrid).

const APP = 'https://all4laser-stock.vercel.app'
const H = 3600_000

type PerfilRef = { id: string; nome: string | null; email: string | null }

// Quem trata das faturas: o substituto (se definido) ou os utilizadores financeiro.
async function destinatariosFaturacao(db: SupabaseClient): Promise<PerfilRef[]> {
  const { data: cfg } = await db.from('pedidos_fatura_config').select('substituto_id').eq('id', true).maybeSingle()
  const subId = (cfg as { substituto_id: string | null } | null)?.substituto_id
  if (subId) {
    const { data } = await db.from('profiles').select('id, nome, email').eq('id', subId).maybeSingle()
    if (data) return [data as PerfilRef]
  }
  const { data } = await db.from('profiles').select('id, nome, email').eq('role', 'financeiro')
  return (data as PerfilRef[]) ?? []
}

async function inserirRecados(db: SupabaseClient, aQuem: PerfilRef[], mensagem: string) {
  const rows = aQuem.filter((p) => p.id).map((p) => ({ to_user: p.id, mensagem, urgente: false }))
  if (rows.length) await db.from('user_notes').insert(rows)
}

// Pedido novo → avisa a faturação (recado + email) com link direto.
export async function notificarNovoPedido(db: SupabaseClient, pedidoId: string) {
  const { data } = await db.from('pedidos_fatura')
    .select('numero, cliente_nome, descricao, criado_por_nome').eq('id', pedidoId).single()
  const p = data as { numero: string | null; cliente_nome: string; descricao: string; criado_por_nome: string | null } | null
  if (!p) return
  const alvos = await destinatariosFaturacao(db)
  const link = `${APP}/pedidos-fatura/${pedidoId}`
  const titulo = `Novo pedido de fatura de ${p.criado_por_nome ?? 'um colega'}: ${p.cliente_nome} — ${p.descricao}`
  await inserirRecados(db, alvos, `${titulo}\n${link}`)
  const emails = alvos.map((a) => a.email).filter((e): e is string => !!e)
  if (emails.length) {
    await enviarEmail({
      para: emails,
      assunto: `Novo pedido de fatura — ${p.cliente_nome}`,
      html: `<p>${titulo}</p><p><a href="${link}">Abrir o pedido ${p.numero ?? ''}</a></p>`,
    })
  }
}

// Fatura enviada ao cliente → avisa o colega que pediu (recado + email).
export async function notificarFaturaEnviada(db: SupabaseClient, pedidoId: string) {
  const { data } = await db.from('pedidos_fatura')
    .select('numero, cliente_nome, num_fatura, criado_por').eq('id', pedidoId).single()
  const p = data as { numero: string | null; cliente_nome: string; num_fatura: string | null; criado_por: string | null } | null
  if (!p?.criado_por) return
  const { data: perfil } = await db.from('profiles').select('id, nome, email').eq('id', p.criado_por).maybeSingle()
  const colega = perfil as PerfilRef | null
  if (!colega) return
  const link = `${APP}/pedidos-fatura/${pedidoId}`
  const msg = `A fatura ${p.num_fatura ?? p.numero ?? ''} de ${p.cliente_nome} já está disponível na app e foi enviada ao cliente.`
  await inserirRecados(db, [colega], `${msg}\n${link}`)
  if (colega.email) {
    await enviarEmail({ para: colega.email, assunto: `Fatura enviada — ${p.cliente_nome}`, html: `<p>${msg}</p><p><a href="${link}">Ver o pedido</a></p>` })
  }
}

// Horas ÚTEIS entre duas datas (conta só 2ª–6ª; o fim de semana não conta).
export function horasUteisEntre(iniISO: string, fimISO: string): number {
  let cursor = new Date(iniISO)
  const fim = new Date(fimISO)
  if (fim <= cursor) return 0
  let horas = 0
  while (cursor < fim) {
    const prox = new Date(cursor); prox.setHours(24, 0, 0, 0)
    const fimSeg = prox < fim ? prox : fim
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) horas += (fimSeg.getTime() - cursor.getTime()) / H
    cursor = fimSeg
  }
  return horas
}

// Cron: lembretes de pedidos parados (open) há mais de N horas (úteis, config).
export async function correrLembretes(db: SupabaseClient, dryrun: boolean): Promise<{ avisados: number; ids: string[] }> {
  const { data: cfgRow } = await db.from('pedidos_fatura_config').select('*').eq('id', true).maybeSingle()
  const cfg = (cfgRow ?? {}) as { lembrete_horas?: number; lembrete_horas_uteis?: boolean; escalona_cc_andreia?: boolean }
  const limite = cfg.lembrete_horas ?? 48
  const uteis = cfg.lembrete_horas_uteis ?? true
  const escalona = cfg.escalona_cc_andreia ?? true
  const agora = new Date().toISOString()

  const { data: abertos } = await db.from('pedidos_fatura')
    .select('id, numero, cliente_nome, descricao, criado_por_nome, created_at, lembrete_ultimo, lembretes_count')
    .in('estado', ['nao_realizado', 'a_realizar'])
  const lista = (abertos as { id: string; numero: string | null; cliente_nome: string; descricao: string; criado_por_nome: string | null; created_at: string; lembrete_ultimo: string | null; lembretes_count: number }[]) ?? []

  const alvos = await destinatariosFaturacao(db)
  const emailsBase = alvos.map((a) => a.email).filter((e): e is string => !!e)
  const ids: string[] = []

  for (const p of lista) {
    const base = p.lembrete_ultimo ?? p.created_at
    const decorridas = uteis ? horasUteisEntre(base, agora) : (Date.now() - new Date(base).getTime()) / H
    if (decorridas < limite) continue
    ids.push(p.id)
    if (dryrun) continue
    const cc = escalona && (p.lembretes_count ?? 0) >= 1 ? [EMAIL_ANDREIA] : []
    const link = `${APP}/pedidos-fatura/${p.id}`
    const destino = [...emailsBase, ...cc]
    if (destino.length) {
      await enviarEmail({
        para: destino,
        assunto: `Lembrete — pedido de fatura por tratar (${p.cliente_nome})`,
        html: `<p>O pedido ${p.numero ?? ''} de ${p.cliente_nome} (${p.descricao}), de ${p.criado_por_nome ?? 'um colega'}, continua por tratar.</p><p><a href="${link}">Abrir o pedido</a></p>`,
      })
    }
    await inserirRecados(db, alvos, `Lembrete: o pedido de fatura de ${p.cliente_nome} continua por tratar.\n${link}`)
    await db.from('pedidos_fatura').update({ lembrete_ultimo: agora, lembretes_count: (p.lembretes_count ?? 0) + 1 }).eq('id', p.id)
  }
  return { avisados: ids.length, ids }
}
