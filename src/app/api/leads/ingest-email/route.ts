import { createClient } from '@supabase/supabase-js'
import { procurarMensagens, obterEmail, garantirEtiqueta, aplicarEtiqueta, caixaLeads } from '@/lib/gmailRead'
import { classificar, queryCandidatos, ETIQUETA_PROCESSADA } from '@/lib/leadSources'
import { extrairLead, falhaGlobalIA, type LeadExtraida } from '@/lib/leadExtract'

// Ingestão automática de leads por email. Lê a caixa (Gmail API, Service
// Account), identifica os emails-lead por remetente/padrão, extrai os campos
// com a Claude API e grava-os na tabela `leads`, marcando o email como
// processado (etiqueta) para não repetir. Cron Vercel; protegido por CRON_SECRET.
//   ?dryrun=1 -> lê e mostra o que extrairia, sem gravar nem etiquetar.

export const runtime = 'nodejs'
export const maxDuration = 60
// (deploy: garantir que a rota fica publicada em produção)

const MAX_POR_CORRIDA = 25

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${segredo}`) return true
  return new URL(req.url).searchParams.get('secret') === segredo
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ ok: false, erro: 'Não autorizado ou CRON_SECRET não configurado.' }, { status: 401 })
  }
  const dryrun = new URL(req.url).searchParams.get('dryrun') === '1'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor mal configurado.' }, { status: 500 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    // Etiqueta de "processada" (criada se não existir) — usada na query e no fim.
    const labelId = await garantirEtiqueta(ETIQUETA_PROCESSADA)

    // Candidatos: emails das fontes conhecidas, ainda sem a etiqueta.
    const ids = await procurarMensagens(queryCandidatos(), MAX_POR_CORRIDA)
    if (ids.length === 0) {
      return Response.json({ ok: true, dryrun, caixa: caixaLeads(), total: 0, criados: 0, resultados: [] })
    }

    // Já em BD? (dedup por message_id, para além da etiqueta.)
    const { data: existentes } = await db.from('leads').select('email_message_id').in('email_message_id', ids)
    const jaEmBd = new Set((existentes as { email_message_id: string | null }[] ?? []).map((r) => r.email_message_id))

    const resultados: Array<Record<string, unknown>> = []
    let criados = 0
    let falhaGlobal: string | null = null

    for (const id of ids) {
      const email = await obterEmail(id)
      const def = classificar(email)
      if (!def) { resultados.push({ id, assunto: email.assunto, estado: 'ignorado (não é lead)' }); continue }
      if (jaEmBd.has(id)) {
        // Já foi ingerida: etiquetar (a etiqueta pode ter falhado antes) para
        // não voltar a entrar nos candidatos de todas as corridas.
        if (!dryrun) await aplicarEtiqueta(id, labelId).catch(() => {})
        resultados.push({ id, assunto: email.assunto, estado: 'ignorado (já em BD)' }); continue
      }

      // A falha de um email não pode deitar abaixo a corrida toda; só uma falha
      // global (sem créditos, chave errada, API em baixo) interrompe o resto.
      let extra: LeadExtraida
      try {
        extra = await extrairLead(email, def.fonte)
      } catch (e) {
        const erro = e instanceof Error ? e.message : 'Falha na extração.'
        resultados.push({ id, assunto: email.assunto, estado: 'falhou (extração)', erro })
        if (falhaGlobalIA(e)) { falhaGlobal = erro; break }
        continue
      }
      // Sem qualquer forma de contacto → não é uma lead útil (ex.: auto-resposta).
      if (!extra.email && !extra.telefone) {
        resultados.push({ id, assunto: email.assunto, estado: 'ignorado (sem contacto)' }); continue
      }
      const lead = {
        nome: extra.nome || '(sem nome)',
        email: extra.email,
        telefone: extra.telefone,
        cidade: extra.cidade,
        mensagem: extra.mensagem,
        canal: def.canal,
        modelo_interesse: extra.modelo_interesse,
        data_inicio: null as string | null,
        data_fim: null as string | null,
        estado: 'nova',
        email_message_id: id,
        email_fonte: def.fonte,
      }

      if (dryrun) {
        resultados.push({ id, fonte: def.fonte, assunto: email.assunto, extraido: lead })
        continue
      }

      const { error } = await db.from('leads').insert(lead)
      if (error) {
        resultados.push({ id, assunto: email.assunto, estado: 'falhou', erro: error.message })
        continue
      }
      await aplicarEtiqueta(id, labelId).catch(() => {}) // best-effort: já está em BD (dedup garante)
      criados++
      resultados.push({ id, fonte: def.fonte, assunto: email.assunto, estado: 'criada', nome: lead.nome })
    }

    // Uma falha global é reportada como 500 (o cron fica vermelho e avisa),
    // mas as leads criadas antes disso ficam gravadas e etiquetadas.
    return Response.json(
      { ok: !falhaGlobal, dryrun, caixa: caixaLeads(), total: ids.length, criados, erro: falhaGlobal ?? undefined, resultados },
      falhaGlobal ? { status: 500 } : undefined,
    )
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Falha na ingestão.' }, { status: 500 })
  }
}
