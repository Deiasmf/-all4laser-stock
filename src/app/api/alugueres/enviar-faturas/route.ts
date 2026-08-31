import { createClient } from '@supabase/supabase-js'
import { enviarGmail } from '@/lib/gmailSend'
import {
  render, periodoDoMes, nFaturaDoNome, formatarValor,
  type FaturaEmailVars, type TemplateChave,
} from '@/lib/faturaEmailRender'

// Envio de faturas de aluguer por email (Gmail comercial@), individual ou em
// lote. Cada fatura vai NUM email individual ao seu cliente (nunca agrupa).
// Servidor: valida o utilizador (admin/financeiro), usa a service role, aplica
// throttling e regista cada envio no log. Espelha o padrão do freight/send.

export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET = 'faturas-alugueres'
const THROTTLE_MS = 600      // pausa entre envios (limites do Gmail)
const TENTATIVAS_MAX = 2     // tentativas por fatura
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ItemEnvio = {
  faturacaoId: string
  para: string
  cc?: string
  templateChave: TemplateChave
  assuntoOverride?: string
  corpoOverride?: string
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })

  // 1. Autenticação + autorização (admin/financeiro)
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await db.from('profiles').select('role, nome, email').eq('id', userData.user.id).single()
  const p = perfil as { role?: string; nome?: string; email?: string } | null
  if (p?.role !== 'admin' && p?.role !== 'financeiro') return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  const remetenteNome = p?.nome ?? p?.email ?? 'All4laser'
  const remetenteEmail = p?.email ?? ''

  // 2. Corpo do pedido
  let body: { itens?: ItemEnvio[] }
  try { body = await req.json() } catch { return Response.json({ ok: false, erro: 'JSON inválido.' }, { status: 400 }) }
  const itens = (body.itens ?? []).filter((i) => i && i.faturacaoId)
  if (itens.length === 0) return Response.json({ ok: false, erro: 'Sem faturas para enviar.' }, { status: 400 })

  // Templates (para render quando não há override)
  const { data: tmplRows } = await db.from('alugueres_email_templates').select('*')
  const templates = new Map<string, { assunto_template: string; corpo_template: string }>()
  for (const t of (tmplRows as { chave: string; assunto_template: string; corpo_template: string }[] | null) ?? []) {
    templates.set(t.chave, t)
  }

  const resultados: { faturacaoId: string; estado: 'enviado' | 'falhou'; motivo?: string }[] = []

  for (let idx = 0; idx < itens.length; idx++) {
    const item = itens[idx]
    const registar = async (estado: 'enviado' | 'falhou', extra: { erro?: string; msgId?: string; threadId?: string; mes?: string | null; aluguerId?: string | null }) => {
      await db.from('alugueres_fatura_envios').insert({
        faturacao_id: item.faturacaoId, aluguer_id: extra.aluguerId ?? null, mes: extra.mes ?? null,
        para: item.para, cc: item.cc ?? null, template_chave: item.templateChave,
        assunto: item.assuntoOverride ?? null, estado, erro: extra.erro ?? null,
        gmail_message_id: extra.msgId ?? null, gmail_thread_id: extra.threadId ?? null,
        enviado_por: userData.user.id, enviado_por_nome: remetenteNome,
      })
    }

    try {
      const para = (item.para ?? '').trim()
      if (!para.includes('@')) { resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: 'Email inválido.' }); await registar('falhou', { erro: 'Email inválido.' }); continue }

      // Carregar fatura + aluguer + cliente
      const { data: fatRow } = await db.from('alugueres_faturacao_mensal').select('*').eq('id', item.faturacaoId).single()
      const fat = fatRow as { aluguer_id: string; mes: string; valor_a_faturar: number | null; fatura_url: string | null; fatura_caminho: string | null; fatura_nome: string | null } | null
      if (!fat) { resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: 'Fatura não encontrada.' }); await registar('falhou', { erro: 'Fatura não encontrada.' }); continue }
      if (!fat.fatura_caminho && !fat.fatura_url) { resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: 'Sem PDF anexado.' }); await registar('falhou', { erro: 'Sem PDF anexado.', mes: fat.mes, aluguerId: fat.aluguer_id }); continue }

      const { data: alRow } = await db.from('alugueres').select('id, cliente_id, cliente_nome, modelo, serial_number').eq('id', fat.aluguer_id).single()
      const al = alRow as { cliente_id: string | null; cliente_nome: string | null; modelo: string | null; serial_number: string | null } | null
      let contacto: string | null = null, clienteNome: string | null = al?.cliente_nome ?? null
      if (al?.cliente_id) {
        const { data: cliRow } = await db.from('clientes').select('contacto_nome, nome').eq('id', al.cliente_id).single()
        const cli = cliRow as { contacto_nome: string | null; nome: string | null } | null
        contacto = cli?.contacto_nome ?? null
        clienteNome = clienteNome ?? cli?.nome ?? null
      }

      // Assunto/corpo: override do modal (envio individual editado) ou render do template
      let assunto = item.assuntoOverride, corpo = item.corpoOverride
      if (assunto == null || corpo == null) {
        const tmpl = templates.get(item.templateChave)
        if (!tmpl) { resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: 'Template não encontrado.' }); await registar('falhou', { erro: 'Template não encontrado.', mes: fat.mes, aluguerId: fat.aluguer_id }); continue }
        const vars: FaturaEmailVars = {
          n_fatura: nFaturaDoNome(fat.fatura_nome), periodo: periodoDoMes(fat.mes), valor: formatarValor(fat.valor_a_faturar),
          equipamento: al?.modelo ?? '', serial_number: al?.serial_number ?? '',
          nome_contacto: contacto ?? clienteNome ?? '', cliente_nome: clienteNome ?? '',
          nome_colaborador: remetenteNome, email_colaborador: remetenteEmail, telefone: '',
        }
        assunto = render(tmpl.assunto_template, vars)
        corpo = render(tmpl.corpo_template, vars)
      }

      // Obter o PDF (storage privado por caminho, ou URL público)
      let base64: string | null = null
      if (fat.fatura_caminho) {
        const { data: blob } = await db.storage.from(BUCKET).download(fat.fatura_caminho)
        if (blob) base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      }
      if (!base64 && fat.fatura_url) {
        const res = await fetch(fat.fatura_url)
        if (res.ok) base64 = Buffer.from(await res.arrayBuffer()).toString('base64')
      }
      if (!base64) { resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: 'Não foi possível obter o PDF.' }); await registar('falhou', { erro: 'PDF inacessível.', mes: fat.mes, aluguerId: fat.aluguer_id }); continue }

      const nomeFicheiro = fat.fatura_nome ?? `fatura-${fat.mes}.pdf`
      const mime = nomeFicheiro.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
      const cc = (item.cc ?? '').split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'))

      // Enviar (com retries)
      let enviado = false, ultimoErro = '', msgId: string | undefined, threadId: string | undefined
      for (let tent = 0; tent < TENTATIVAS_MAX && !enviado; tent++) {
        if (tent > 0) await sleep(400)
        const r = await enviarGmail({ para: [para], cc, assunto: assunto!, corpoTexto: corpo!, anexos: [{ filename: nomeFicheiro, contentBase64: base64, mimeType: mime }] })
        if (r.ok) { enviado = true; msgId = r.messageId; threadId = r.threadId }
        else { ultimoErro = r.erro ?? 'Falha no envio.'; if (!r.configurado) break }
      }

      if (enviado) {
        await db.from('alugueres_faturacao_mensal').update({ fatura_enviada_em: new Date().toISOString(), fatura_enviada_para: para }).eq('id', item.faturacaoId)
        if (al?.cliente_id) await db.from('clientes').update({ email_faturacao: para }).eq('id', al.cliente_id)
        await registar('enviado', { msgId, threadId, mes: fat.mes, aluguerId: fat.aluguer_id })
        resultados.push({ faturacaoId: item.faturacaoId, estado: 'enviado' })
      } else {
        await registar('falhou', { erro: ultimoErro, mes: fat.mes, aluguerId: fat.aluguer_id })
        resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: ultimoErro })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado.'
      resultados.push({ faturacaoId: item.faturacaoId, estado: 'falhou', motivo: msg })
      await registar('falhou', { erro: msg })
    }

    if (idx < itens.length - 1) await sleep(THROTTLE_MS)
  }

  const enviadas = resultados.filter((r) => r.estado === 'enviado').length
  return Response.json({ ok: true, resultados, resumo: { enviadas, falhadas: resultados.length - enviadas } })
}
