import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarEmail } from './email'
import { EMAIL_ANDREIA } from '@/types/freight'
import { ESTADOS_TRABALHO } from '@/types/pedidoFatura'

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

// Documento enviado ao cliente → avisa o colega que pediu (recado + email).
// A mensagem adapta-se: pró-forma enviada (aguarda pagamento) vs. fatura enviada.
export async function notificarFaturaEnviada(db: SupabaseClient, pedidoId: string) {
  const { data } = await db.from('pedidos_fatura')
    .select('numero, estado, cliente_nome, num_fatura, proforma_num, criado_por').eq('id', pedidoId).single()
  const p = data as { numero: string | null; estado: string; cliente_nome: string; num_fatura: string | null; proforma_num: string | null; criado_por: string | null } | null
  if (!p?.criado_por) return
  const { data: perfil } = await db.from('profiles').select('id, nome, email').eq('id', p.criado_por).maybeSingle()
  const colega = perfil as PerfilRef | null
  if (!colega) return
  const link = `${APP}/pedidos-fatura/${pedidoId}`
  const proforma = p.estado === 'aguarda_pagamento'
  const msg = proforma
    ? `A pró-forma ${p.proforma_num ?? p.numero ?? ''} de ${p.cliente_nome} foi enviada ao cliente. Quando o pagamento entrar, pede aqui a fatura final.`
    : `A fatura ${p.num_fatura ?? p.numero ?? ''} de ${p.cliente_nome} já está disponível na app e foi enviada ao cliente.`
  const assunto = proforma ? `Pró-forma enviada — ${p.cliente_nome}` : `Fatura enviada — ${p.cliente_nome}`
  await inserirRecados(db, [colega], `${msg}\n${link}`)
  if (colega.email) {
    await enviarEmail({ para: colega.email, assunto, html: `<p>${msg}</p><p><a href="${link}">Ver o pedido</a></p>` })
  }
}

// Pagamento recebido numa pró-forma → avisa a faturação para emitir a fatura
// final (recado + email), com todo o contexto já no mesmo pedido.
export async function notificarFaturaFinalPedida(db: SupabaseClient, pedidoId: string) {
  const { data } = await db.from('pedidos_fatura')
    .select('numero, cliente_nome, descricao, criado_por_nome').eq('id', pedidoId).single()
  const p = data as { numero: string | null; cliente_nome: string; descricao: string; criado_por_nome: string | null } | null
  if (!p) return
  const alvos = await destinatariosFaturacao(db)
  const link = `${APP}/pedidos-fatura/${pedidoId}`
  const titulo = `Pagamento recebido — emitir fatura final: ${p.cliente_nome} — ${p.descricao}`
  await inserirRecados(db, alvos, `${titulo}\n${link}`)
  const emails = alvos.map((a) => a.email).filter((e): e is string => !!e)
  if (emails.length) {
    await enviarEmail({
      para: emails,
      assunto: `Fatura final a emitir — ${p.cliente_nome}`,
      html: `<p>${titulo}</p><p>O cliente pagou a pró-forma ${p.numero ?? ''}. Emite a fatura final no mesmo pedido.</p><p><a href="${link}">Abrir o pedido</a></p>`,
    })
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

type PedidoLembrete = {
  id: string; numero: string | null; estado: string; cliente_nome: string; descricao: string
  criado_por: string | null; criado_por_nome: string | null; created_at: string
  fatura_pedida_em: string | null; proforma_enviada_em: string | null
  lembrete_ultimo: string | null; lembretes_count: number
}

// Cron: lembretes dos pedidos de fatura. Duas frentes:
//  1) TRABALHO da Vanessa (nao_realizado/a_realizar/fatura_pedida) parado há mais
//     de N horas (úteis, config) → avisa a faturação (CC Andreia a escalar).
//  2) AGUARDA PAGAMENTO parado há mais de X dias (config) → avisa QUEM CRIOU o
//     pedido, para fazer follow-up ao cliente (não é trabalho da Vanessa).
export async function correrLembretes(db: SupabaseClient, dryrun: boolean): Promise<{ avisados: number; ids: string[] }> {
  const { data: cfgRow } = await db.from('pedidos_fatura_config').select('*').eq('id', true).maybeSingle()
  const cfg = (cfgRow ?? {}) as {
    lembrete_horas?: number; lembrete_horas_uteis?: boolean; escalona_cc_andreia?: boolean
    aguarda_pagamento_lembrete_ativo?: boolean; aguarda_pagamento_lembrete_dias?: number
  }
  const limite = cfg.lembrete_horas ?? 48
  const uteis = cfg.lembrete_horas_uteis ?? true
  const escalona = cfg.escalona_cc_andreia ?? true
  const aguardaAtivo = cfg.aguarda_pagamento_lembrete_ativo ?? true
  const aguardaDias = cfg.aguarda_pagamento_lembrete_dias ?? 15
  const agora = new Date().toISOString()
  const ids: string[] = []

  const COLS = 'id, numero, estado, cliente_nome, descricao, criado_por, criado_por_nome, created_at, fatura_pedida_em, proforma_enviada_em, lembrete_ultimo, lembretes_count'

  // ── Frente 1: trabalho da faturação ─────────────────────────────────────────
  const { data: abertos } = await db.from('pedidos_fatura').select(COLS).in('estado', ESTADOS_TRABALHO)
  const lista = (abertos as PedidoLembrete[]) ?? []
  const alvos = await destinatariosFaturacao(db)
  const emailsBase = alvos.map((a) => a.email).filter((e): e is string => !!e)

  for (const p of lista) {
    const inicio = p.estado === 'fatura_pedida' ? (p.fatura_pedida_em ?? p.created_at) : p.created_at
    const base = p.lembrete_ultimo ?? inicio
    const decorridas = uteis ? horasUteisEntre(base, agora) : (Date.now() - new Date(base).getTime()) / H
    if (decorridas < limite) continue
    ids.push(p.id)
    if (dryrun) continue
    const final = p.estado === 'fatura_pedida'
    const assunto = final
      ? `Lembrete — fatura final por emitir (${p.cliente_nome})`
      : `Lembrete — pedido de fatura por tratar (${p.cliente_nome})`
    const texto = final
      ? `A fatura final do pedido ${p.numero ?? ''} de ${p.cliente_nome} (${p.descricao}) continua por emitir.`
      : `O pedido ${p.numero ?? ''} de ${p.cliente_nome} (${p.descricao}), de ${p.criado_por_nome ?? 'um colega'}, continua por tratar.`
    const cc = escalona && (p.lembretes_count ?? 0) >= 1 ? [EMAIL_ANDREIA] : []
    const link = `${APP}/pedidos-fatura/${p.id}`
    const destino = [...emailsBase, ...cc]
    if (destino.length) {
      await enviarEmail({ para: destino, assunto, html: `<p>${texto}</p><p><a href="${link}">Abrir o pedido</a></p>` })
    }
    await inserirRecados(db, alvos, `${texto}\n${link}`)
    await db.from('pedidos_fatura').update({ lembrete_ultimo: agora, lembretes_count: (p.lembretes_count ?? 0) + 1 }).eq('id', p.id)
  }

  // ── Frente 2: aguarda pagamento → follow-up a quem criou ─────────────────────
  if (aguardaAtivo) {
    const DIA = 24 * H
    const { data: espera } = await db.from('pedidos_fatura').select(COLS).eq('estado', 'aguarda_pagamento')
    for (const p of (espera as PedidoLembrete[]) ?? []) {
      if (!p.criado_por) continue
      const base = p.lembrete_ultimo ?? p.proforma_enviada_em ?? p.created_at
      const dias = (Date.now() - new Date(base).getTime()) / DIA
      if (dias < aguardaDias) continue
      ids.push(p.id)
      if (dryrun) continue
      const { data: perfil } = await db.from('profiles').select('id, nome, email').eq('id', p.criado_por).maybeSingle()
      const colega = perfil as PerfilRef | null
      const link = `${APP}/pedidos-fatura/${p.id}`
      const texto = `A pró-forma ${p.numero ?? ''} de ${p.cliente_nome} aguarda pagamento há mais de ${aguardaDias} dias. Faz follow-up ao cliente; quando pagar, pede aqui a fatura final.`
      if (colega) {
        await inserirRecados(db, [colega], `${texto}\n${link}`)
        if (colega.email) await enviarEmail({ para: colega.email, assunto: `Pró-forma por pagar — ${p.cliente_nome}`, html: `<p>${texto}</p><p><a href="${link}">Abrir o pedido</a></p>` })
      }
      await db.from('pedidos_fatura').update({ lembrete_ultimo: agora, lembretes_count: (p.lembretes_count ?? 0) + 1 }).eq('id', p.id)
    }
  }

  return { avisados: ids.length, ids }
}
