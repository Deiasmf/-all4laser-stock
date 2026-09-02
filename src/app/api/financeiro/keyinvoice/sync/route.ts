import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { listarDocumentos, listarSeries, valorPendente, type DocListItem } from '@/lib/keyinvoiceApi'
import { parseMontantePt, semAcentos } from '@/lib/categorizacaoFinanceira'
import { aplicarRegras, type RegraCat } from '@/lib/categoriasFin'
import type { DocKeyinvoice } from '@/lib/keyinvoiceSync'
import { tipoDocInfo, type TipoDocumento } from '@/lib/contasCorrentes'

// Sincronização Keyinvoice → Contas Correntes.
//   POST → "Sincronizar agora" (admin/financeiro): busca os documentos e devolve-os
//          ao cliente, que corre o pipeline (processar → importar) no browser.
//   GET  → cron (GitHub Actions, protegido por CRON_SECRET): busca E grava no
//          servidor (service role), com a mesma lógica (NIF, regras, idempotência).
//
// A chave da API fica sempre no servidor. Tetos de chamadas + orçamento de tempo
// respeitam o limite diário (5000) e o maxDuration.

export const runtime = 'nodejs'
export const maxDuration = 300

// DocType (Documentos de Venda) → tipo da app + estratégia de liquidação.
const TIPOS: { code: number; tipo: TipoDocumento; settle: 'check' | 'paid' | 'none' }[] = [
  { code: 4,  tipo: 'fatura',       settle: 'check' }, // Fatura
  { code: 32, tipo: 'fatura',       settle: 'check' }, // Fatura Simplificada
  { code: 34, tipo: 'fatura',       settle: 'paid'  }, // Fatura-Recibo (já liquidada)
  { code: 8,  tipo: 'fatura',       settle: 'check' }, // Nota de Débito
  { code: 7,  tipo: 'nota_credito', settle: 'none'  }, // Nota de Crédito
  { code: 6,  tipo: 'nota_credito', settle: 'none'  }, // Devolução
]

const MAX_PAGINAS_TIPO = 100 // 100 docs/página → até 10 000 por tipo
const MAX_CHAMADAS = 4000    // margem sob o limite diário de 5000
const MAX_SETTLE = 1500      // teto de checkIfSettle por corrida
const PAUSA_MS = 80          // intervalo entre chamadas (não sobrecarregar a API)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseData(s: string | undefined | null): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

export type SyncMeta = {
  total: number
  porTipo: Record<string, number>
  verificadosPagamento: number
  settleCapped: boolean
  truncado: boolean
  ignoradosSemData: number
  tiposIgnorados: { code: number; tipo: string; erro: string }[]
  chamadas: number
}

// ─── Busca dos documentos à API (partilhada por POST e GET) ──────────────────
async function buscarDocumentos(): Promise<{ docs: DocKeyinvoice[]; meta: SyncMeta }> {
  type Entrada = { doc: DocKeyinvoice; code: number; num: string; series: string | number | undefined; settle: 'check' | 'paid' | 'none' }
  const entradas: Entrada[] = []
  const porTipo: Record<string, number> = {}
  let chamadas = 0
  let ignoradosSemData = 0
  let truncado = false
  const inicio = Date.now()
  const LIMITE_MS = 250_000
  const tiposIgnorados: { code: number; tipo: string; erro: string }[] = []

  // 1) Por tipo → séries activas → listar cada série (paginada). Tolerante.
  for (const t of TIPOS) {
    if (chamadas >= MAX_CHAMADAS || Date.now() - inicio > LIMITE_MS) { truncado = true; break }
    let series
    try {
      series = await listarSeries(t.code)
      chamadas++
    } catch (err) {
      tiposIgnorados.push({ code: t.code, tipo: t.tipo, erro: err instanceof Error ? err.message : String(err) })
      continue
    }
    await sleep(PAUSA_MS)
    const idsSerie: (number | string | undefined)[] = series.length > 0 ? series.map((s) => s.IdSerie) : [undefined]

    for (const idSerie of idsSerie) {
      let offset = 0
      for (let p = 0; p < MAX_PAGINAS_TIPO; p++) {
        if (chamadas >= MAX_CHAMADAS || Date.now() - inicio > LIMITE_MS) { truncado = true; break }
        let itens: DocListItem[]
        try {
          itens = await listarDocumentos(t.code, offset, idSerie)
          chamadas++
        } catch (err) {
          tiposIgnorados.push({ code: t.code, tipo: `${t.tipo}/série ${idSerie ?? '?'}`, erro: err instanceof Error ? err.message : String(err) })
          break
        }
        await sleep(PAUSA_MS)
        if (itens.length === 0) break
        for (const it of itens) {
          if (it.DocNum == null) continue
          const data = parseData(it.Date)
          if (!data) { ignoradosSemData++; continue }
          const valor = Math.abs(parseMontantePt(String(it.GrossTotal ?? '0')) || 0)
          const num = String(it.DocNum)
          const serie = it.DocSeries ?? idSerie
          const doc: DocKeyinvoice = {
            keyinvoice_doc_id: `ki|${t.code}|${serie ?? ''}|${num}`,
            descricao: null,
            categoria: null,
            subcategoria_id: null,
            entidade_tipo: 'cliente',
            nome: (it.ClientName ?? '').trim() || '—',
            nif: (it.VATIN ?? '').trim() || null,
            tipo_documento: t.tipo,
            numero: num,
            data_documento: data,
            data_vencimento: null,
            valor,
            valor_liquidado: t.settle === 'paid' ? valor : undefined,
          }
          entradas.push({ doc, code: t.code, num, series: serie, settle: t.settle })
          porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1
        }
        if (itens.length < 100) break
        offset += 100
      }
      if (truncado) break
    }
    if (truncado) break
  }

  // 2) Estado de liquidação (só faturas 'check'), com teto de chamadas.
  let verificados = 0
  let settleCapped = false
  for (const e of entradas) {
    if (e.settle !== 'check') continue
    if (verificados >= MAX_SETTLE || chamadas >= MAX_CHAMADAS || Date.now() - inicio > LIMITE_MS) { settleCapped = true; break }
    try {
      const pend = await valorPendente(e.code, e.num, e.series)
      chamadas++; verificados++
      if (pend != null) e.doc.valor_liquidado = Math.max(0, e.doc.valor - pend)
    } catch {
      verificados++
    }
    await sleep(PAUSA_MS)
  }

  return {
    docs: entradas.map((e) => e.doc),
    meta: { total: entradas.length, porTipo, verificadosPagamento: verificados, settleCapped, truncado, ignoradosSemData, tiposIgnorados, chamadas },
  }
}

// ─── Gravação server-side (usada pelo cron) ──────────────────────────────────
const normNif = (s: string | null | undefined) => (s ?? '').replace(/[^0-9A-Za-z]/g, '').toLowerCase()
const norm = (s: string | null | undefined) => semAcentos(s ?? '').trim()

async function persistir(
  sb: SupabaseClient,
  docs: DocKeyinvoice[]
): Promise<{ importados: number; atualizados: number; semEntidade: number; erro?: string }> {
  // Documentos já existentes (respeitar categoria fixada à mão).
  const ids = docs.map((d) => d.keyinvoice_doc_id)
  const existentes = new Map<string, { categoria_manual: boolean }>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb.from('financeiro_movimentos')
      .select('keyinvoice_doc_id, categoria_manual').in('keyinvoice_doc_id', ids.slice(i, i + 500))
    for (const r of (data as { keyinvoice_doc_id: string; categoria_manual: boolean | null }[]) ?? []) {
      existentes.set(r.keyinvoice_doc_id, { categoria_manual: !!r.categoria_manual })
    }
  }

  // Clientes (associação por NIF, depois nome).
  const { data: cli } = await sb.from('clientes').select('id, nome, nif').limit(5000)
  const porNif = new Map<string, string>()
  const porNome = new Map<string, string>()
  for (const c of (cli as { id: string; nome: string | null; nif: string | null }[]) ?? []) {
    if (!c.nome) continue
    const nif = normNif(c.nif)
    if (nif) porNif.set(nif, c.id)
    porNome.set(norm(c.nome), c.id)
  }

  const { data: regrasData } = await sb.from('financeiro_regras_categoria').select('*').order('ordem').order('created_at')
  const regras = (regrasData as RegraCat[]) ?? []

  let semEntidade = 0
  const insertRows: Record<string, unknown>[] = []
  const updates: { id: string; upd: Record<string, unknown> }[] = []
  const vistos = new Set<string>()

  for (const d of docs) {
    if (vistos.has(d.keyinvoice_doc_id)) continue
    vistos.add(d.keyinvoice_doc_id)
    const entId = porNif.get(normNif(d.nif)) || porNome.get(norm(d.nome)) || null
    if (!entId) { semEntidade++; continue }
    const cat = aplicarRegras(regras, { descricao: d.descricao, documento_ref: d.numero, entidade_nome: d.nome })
      ?? { categoria_chave: d.categoria ?? null, subcategoria_id: null }
    const sentido = tipoDocInfo(d.tipo_documento).sentido
    const base: Record<string, unknown> = {
      entidade_tipo: 'cliente', cliente_id: entId, fornecedor_id: null, entidade_nome: d.nome,
      tipo_documento: d.tipo_documento, documento_ref: d.numero,
      data_documento: d.data_documento, data_vencimento: d.data_vencimento, descricao: d.descricao ?? null,
      valor_debito: sentido === 'debito' ? d.valor : 0, valor_credito: sentido === 'credito' ? d.valor : 0,
    }
    const ex = existentes.get(d.keyinvoice_doc_id)
    const liquidado = d.tipo_documento === 'fatura' && typeof d.valor_liquidado === 'number' ? d.valor_liquidado : null
    if (!ex) {
      insertRows.push({
        ...base,
        categoria: cat.categoria_chave, subcategoria_id: cat.subcategoria_id,
        valor_liquidado: liquidado ?? 0,
        origem: 'keyinvoice', keyinvoice_doc_id: d.keyinvoice_doc_id,
        criado_por_nome: 'Sincronização automática',
      })
    } else {
      const upd: Record<string, unknown> = { ...base }
      if (!ex.categoria_manual) { upd.categoria = cat.categoria_chave; upd.subcategoria_id = cat.subcategoria_id }
      if (liquidado != null) upd.valor_liquidado = liquidado
      updates.push({ id: d.keyinvoice_doc_id, upd })
    }
  }

  let importados = 0, atualizados = 0, erro: string | undefined
  if (insertRows.length > 0) {
    const { error } = await sb.from('financeiro_movimentos').insert(insertRows)
    if (error) erro = error.message; else importados = insertRows.length
  }
  if (!erro) {
    for (const u of updates) {
      const { error } = await sb.from('financeiro_movimentos').update(u.upd).eq('keyinvoice_doc_id', u.id)
      if (error) { erro = error.message; break }
      atualizados++
    }
  }
  return { importados, atualizados, semEntidade, erro }
}

// ─── POST: "Sincronizar agora" (admin/financeiro) ────────────────────────────
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  try {
    const { docs, meta } = await buscarDocumentos()
    return Response.json({ ok: true, docs, meta })
  } catch (e) {
    console.error('[keyinvoice/sync POST]', e)
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}

// ─── GET: cron (GitHub Actions, protegido por CRON_SECRET) ───────────────────
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    const { docs, meta } = await buscarDocumentos()
    const r = await persistir(sb, docs)
    await sb.from('financeiro_keyinvoice_sync').insert({
      recurso: 'sync_api_cron',
      estado: r.erro ? 'erro' : 'ok',
      payload: { ...r, ...meta },
      sincronizado_em: new Date().toISOString(),
    })
    return Response.json({ ok: !r.erro, ...r, meta })
  } catch (e) {
    console.error('[keyinvoice/sync GET]', e)
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}
