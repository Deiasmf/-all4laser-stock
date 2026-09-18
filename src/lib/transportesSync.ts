// ─────────────────────────────────────────────────────────────────────────────
// Sincronização eventos Google Calendar → paragens (transport_stops).
// Server-side (service_role + ANTHROPIC_API_KEY). Chamado pelo cron/manual.
//
// Modelo: cada evento é um PERÍODO DE ALUGUER (dia inteiro; título = cliente).
//  → gera DUAS paragens: ENTREGA na data de início e RECOLHA na data de fim
//    (o fim dos eventos de dia inteiro no Google é exclusivo → fim - 1 dia).
//  → o tipo vem da posição (não se adivinha). A IA (Haiku) serve só para extrair
//    cliente + morada do título/descrição.
//  - Zona e equipamento vêm do CALENDÁRIO (fonte primária).
//  - Idempotência por (google_event_id, tipo); hash deteta alterações → "alterado".
//  - Parsing AI só em eventos novos/alterados (poupa tokens).
//  - Nada desaparece: sem cliente → "por_classificar". Cancelado → "cancelada".
//  - Não cria paragens já passadas (data < hoje); as existentes são atualizadas.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { listarEventosDetalhados, type EventoDetalhado } from './googleCalendar'

const MODELO_AI = 'claude-haiku-4-5'
const DIAS = 12

export function dbService(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Parsing AI (cliente + morada) ───────────────────────────────────────────
export type DadosEvento = { cliente: string | null; morada: string | null; confianca: 'alta' | 'media' | 'baixa' }

const TOOL: Anthropic.Tool = {
  name: 'registar_evento',
  description: 'Regista o cliente e a morada de um evento de aluguer de equipamento.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: { type: ['string', 'null'], description: 'Nome do cliente/clínica (normalmente é o título). null se não houver.' },
      morada: { type: ['string', 'null'], description: 'Morada ou localidade, se existir (às vezes entre parênteses no título, ou no campo de local). null se não houver ou se os parênteses forem apenas uma nota (ex.: horário).' },
      confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Confiança na identificação do cliente.' },
    },
    required: ['cliente', 'morada', 'confianca'],
  },
}
const SISTEMA = `Interpretas eventos de calendário da All4laser (aluguer de equipamentos de estética).
Cada evento representa um aluguer; o título é normalmente o NOME DO CLIENTE (clínica ou pessoa).
Entre parênteses pode vir a localidade/morada (ex.: "Tatiana Lopes (Moscavide)") OU uma nota que
NÃO é morada (ex.: "(Sexta à tarde e Sábado)"). Extrai o cliente e, só se fizer sentido, a morada/
localidade. Usa também o campo de local, se vier preenchido. Nunca inventes.`

let _client: Anthropic | null = null
function ai(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return (_client ??= new Anthropic())
}

export async function extrairEvento(titulo: string, descricao: string, location: string): Promise<DadosEvento> {
  const client = ai()
  // Fallback sem IA: o título costuma ser o cliente; a morada vem do campo local.
  const fallback: DadosEvento = { cliente: titulo?.trim() || null, morada: location || null, confianca: 'baixa' }
  if (!client) return fallback
  try {
    const conteudo = `Título: ${titulo || '(vazio)'}\nLocal: ${location || '(vazio)'}\nDescrição:\n${(descricao || '').slice(0, 3000)}`
    const resp = await client.messages.create({
      model: MODELO_AI, max_tokens: 400, system: SISTEMA,
      tools: [TOOL], tool_choice: { type: 'tool', name: 'registar_evento' },
      messages: [{ role: 'user', content: conteudo }],
    })
    const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const d = (bloco?.input ?? {}) as Partial<DadosEvento>
    const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return {
      cliente: t(d.cliente) ?? (titulo?.trim() || null),
      morada: t(d.morada) ?? (location || null),
      confianca: d.confianca === 'alta' || d.confianca === 'media' ? d.confianca : 'baixa',
    }
  } catch {
    return fallback
  }
}

// ─── Aviso morada vs zona (heurística leve) ──────────────────────────────────
const KW: Record<string, string[]> = {
  norte: ['porto', 'braga', 'famalicão', 'famalicao', 'guimarães', 'guimaraes', 'viana', 'aveiro', 'gaia', 'matosinhos', 'maia', 'barcelos'],
  algarve: ['faro', 'albufeira', 'portimão', 'portimao', 'lagos', 'loulé', 'loule', 'tavira', 'olhão', 'olhao', 'quarteira', 'vilamoura'],
  lisboa: ['lisboa', 'cascais', 'sintra', 'oeiras', 'almada', 'setúbal', 'setubal', 'amadora', 'loures', 'seixal', 'barreiro', 'moscavide', 'belas'],
}
function avisoMorada(zona: string, morada: string | null): boolean {
  if (!morada) return false
  const m = morada.toLowerCase()
  for (const [z, kws] of Object.entries(KW)) {
    if (z === zona) continue
    if (kws.some((k) => m.includes(k))) return true
  }
  return false
}

function hashEvento(e: EventoDetalhado): string {
  return crypto.createHash('sha1').update([e.summary, e.description, e.location, e.inicio, e.fim, e.cancelado].join('|')).digest('hex')
}
function soData(iso: string): string { return iso.slice(0, 10) }
function menosUmDia(dataYmd: string): string {
  const [y, m, d] = dataYmd.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

async function cruzarCliente(sb: SupabaseClient, nome: string | null): Promise<string | null> {
  if (!nome || nome.trim().length < 3) return null
  const { data } = await sb.from('clientes').select('id').ilike('nome', `%${nome.trim()}%`).limit(1)
  return (data as { id: string }[] | null)?.[0]?.id ?? null
}

type CalRow = { id: string; google_calendar_id: string; nome: string; zona: string; equipamento_id: string | null }
type StopRow = { id: string; hash_evento: string | null; estado: string }

// ─── Sincronização principal ─────────────────────────────────────────────────
export async function sincronizarParagens(sb: SupabaseClient): Promise<{ ok: boolean; calendarios: number; novos: number; alterados: number; cancelados: number; erros: string[] }> {
  const erros: string[] = []
  const { data: cals } = await sb.from('transport_calendars').select('*').eq('ativo', true)
  const calendarios = (cals as CalRow[]) ?? []
  const hoje = new Date().toISOString().slice(0, 10)
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + DIAS * 86400_000).toISOString()

  let novos = 0, alterados = 0, cancelados = 0
  for (const cal of calendarios) {
    const r = await listarEventosDetalhados(cal.google_calendar_id, timeMin, timeMax)
    if (!r.ok || !r.eventos) { erros.push(`${cal.nome}: ${r.erro ?? 'sem eventos'}`); continue }

    for (const ev of r.eventos) {
      const hash = hashEvento(ev)
      // Papéis (paragens) que este evento gera.
      const papeis: { tipo: 'entrega' | 'recolha' | 'indefinido'; data: string }[] = []
      if (ev.diaInteiro) {
        papeis.push({ tipo: 'entrega', data: soData(ev.inicio) })
        papeis.push({ tipo: 'recolha', data: menosUmDia(ev.fim) })
      } else {
        // Evento com hora (raro): uma paragem, tipo indefinido (o Dinis classifica).
        papeis.push({ tipo: 'indefinido', data: soData(ev.inicio) })
      }

      // Extração AI só se for preciso (novo/alterado nalgum papel).
      let dados: DadosEvento | null = null
      const getDados = async () => (dados ??= await extrairEvento(ev.summary, ev.description, ev.location))

      for (const papel of papeis) {
        const { data: existRaw } = await sb.from('transport_stops')
          .select('id, hash_evento, estado').eq('google_event_id', ev.id).eq('tipo', papel.tipo).maybeSingle()
        const exist = existRaw as StopRow | null

        if (ev.cancelado) {
          if (exist && exist.estado !== 'cancelada') {
            await sb.from('transport_stops').update({ estado: 'cancelada', alterado: true, hash_evento: hash, sincronizado_em: new Date().toISOString() }).eq('id', exist.id)
            cancelados++
          }
          continue
        }

        if (exist && exist.hash_evento === hash) {
          await sb.from('transport_stops').update({ sincronizado_em: new Date().toISOString() }).eq('id', exist.id)
          continue
        }

        // Não cria paragens já passadas; as existentes são atualizadas.
        if (!exist && papel.data < hoje) continue

        const d = await getDados()
        const clienteId = await cruzarCliente(sb, d.cliente)
        const estado = d.cliente ? (papel.tipo === 'indefinido' ? 'por_classificar' : 'planeada') : 'por_classificar'
        const campos = {
          calendar_id: cal.id,
          zona: cal.zona,
          equipamento_id: cal.equipamento_id,
          data: papel.data,
          janela_inicio: null,
          janela_fim: null,
          tipo: papel.tipo,
          cliente_nome: d.cliente,
          cliente_id: clienteId,
          morada: d.morada,
          titulo_raw: ev.summary,
          descricao_raw: ev.description,
          confianca: d.confianca,
          aviso_morada: avisoMorada(cal.zona, d.morada),
          hash_evento: hash,
          link_evento: ev.htmlLink,
          sincronizado_em: new Date().toISOString(),
        }
        if (exist) {
          const manter = ['planeada', 'confirmada', 'concluida'].includes(exist.estado)
          await sb.from('transport_stops').update({ ...campos, alterado: true, ...(manter ? {} : { estado }) }).eq('id', exist.id)
          alterados++
        } else {
          await sb.from('transport_stops').insert({ ...campos, google_event_id: ev.id, estado })
          novos++
        }
      }
    }
  }
  return { ok: erros.length === 0, calendarios: calendarios.length, novos, alterados, cancelados, erros }
}
