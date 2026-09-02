import { createClient } from '@supabase/supabase-js'
import { listarDocumentos, valorPendente, type DocListItem } from '@/lib/keyinvoiceApi'
import { parseMontantePt } from '@/lib/categorizacaoFinanceira'
import type { DocKeyinvoice } from '@/lib/keyinvoiceSync'
import type { TipoDocumento } from '@/lib/contasCorrentes'

// Busca os documentos ao Keyinvoice (a chave fica no servidor) e devolve-os no
// formato DocKeyinvoice para o cliente correr o pipeline existente
// (processar → importar): associação por NIF, regras de categoria, idempotência.
//
// Restrito a admin/financeiro. Respeita um teto de chamadas para não estourar o
// limite diário (5000) da API — se truncar, basta voltar a sincronizar.

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

function parseData(s: string | undefined | null): string | null {
  const t = (s ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ ok: false, erro: 'Servidor não configurado.' }, { status: 500 })
  }

  // Autenticação + autorização (Financeiro).
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return Response.json({ ok: false, erro: 'Sem sessão.' }, { status: 401 })
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: erroUser } = await userClient.auth.getUser()
  if (erroUser || !userData?.user) return Response.json({ ok: false, erro: 'Sessão inválida.' }, { status: 401 })
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await sb.from('profiles').select('role').eq('id', userData.user.id).single()
  const role = (perfil as { role?: string } | null)?.role
  if (role !== 'admin' && role !== 'financeiro') {
    return Response.json({ ok: false, erro: 'Sem permissão.' }, { status: 403 })
  }

  try {
    type Entrada = { doc: DocKeyinvoice; code: number; num: string; series: string | number | undefined; settle: 'check' | 'paid' | 'none' }
    const entradas: Entrada[] = []
    const porTipo: Record<string, number> = {}
    let chamadas = 0
    let ignoradosSemData = 0
    let truncado = false

    // 1) Listagem por tipo (paginada de 100 em 100).
    for (const t of TIPOS) {
      let offset = 0
      for (let p = 0; p < MAX_PAGINAS_TIPO; p++) {
        if (chamadas >= MAX_CHAMADAS) { truncado = true; break }
        const itens: DocListItem[] = await listarDocumentos(t.code, offset)
        chamadas++
        if (itens.length === 0) break
        for (const it of itens) {
          if (it.DocNum == null) continue
          const data = parseData(it.Date)
          if (!data) { ignoradosSemData++; continue }
          const valor = Math.abs(parseMontantePt(String(it.GrossTotal ?? '0')) || 0)
          const num = String(it.DocNum)
          const doc: DocKeyinvoice = {
            keyinvoice_doc_id: `ki|${t.code}|${it.DocSeries ?? ''}|${num}`,
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
          entradas.push({ doc, code: t.code, num, series: it.DocSeries, settle: t.settle })
          porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1
        }
        if (itens.length < 100) break
        offset += 100
      }
      if (truncado) break
    }

    // 2) Estado de liquidação (só faturas 'check'), com teto de chamadas.
    let verificados = 0
    let settleCapped = false
    for (const e of entradas) {
      if (e.settle !== 'check') continue
      if (verificados >= MAX_SETTLE || chamadas >= MAX_CHAMADAS) { settleCapped = true; break }
      const pend = await valorPendente(e.code, e.num, e.series)
      chamadas++; verificados++
      if (pend != null) e.doc.valor_liquidado = Math.max(0, e.doc.valor - pend)
    }

    return Response.json({
      ok: true,
      docs: entradas.map((e) => e.doc),
      meta: {
        total: entradas.length,
        porTipo,
        verificadosPagamento: verificados,
        settleCapped,
        truncado,
        ignoradosSemData,
        chamadas,
      },
    })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : 'Erro desconhecido.' })
  }
}
