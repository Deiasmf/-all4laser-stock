// ─────────────────────────────────────────────────────────────────────────────
// Sincronização eventos Google Calendar → paragens (transport_stops).
// Server-side (service_role + ANTHROPIC_API_KEY). Chamado pelo cron/manual.
//
// Regras:
//  - Zona e equipamento vêm do CALENDÁRIO (fonte primária), não da morada.
//  - Idempotência por google_event_id; hash deteta alterações → marca "alterado".
//  - Parsing AI só corre em eventos NOVOS ou ALTERADOS (poupa tokens).
//  - Nada desaparece: sem tipo/cliente fiável → estado "por_classificar".
//  - Evento cancelado no Google → paragem "cancelada" (+ alterado).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { listarEventosDetalhados, type EventoDetalhado } from './googleCalendar'

const MODELO_AI = 'claude-haiku-4-5'
const DIAS = 10

export function dbService(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Parsing AI do evento (título + descrição + morada) ──────────────────────
export type ParagemExtraida = { tipo: 'entrega' | 'recolha' | 'indefinido'; cliente: string | null; morada: string | null; confianca: 'alta' | 'media' | 'baixa' }

const TOOL: Anthropic.Tool = {
  name: 'registar_paragem',
  description: 'Regista os dados interpretados de um evento de agenda de transporte (entrega/recolha de equipamento).',
  input_schema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['entrega', 'recolha', 'indefinido'], description: 'entrega = levar equipamento ao cliente; recolha = ir buscar; indefinido se não for claro.' },
      cliente: { type: ['string', 'null'], description: 'Nome da clínica/cliente. null se não for identificável.' },
      morada: { type: ['string', 'null'], description: 'Morada da paragem, se existir no texto. null se não houver.' },
      confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Confiança global da interpretação.' },
    },
    required: ['tipo', 'cliente', 'morada', 'confianca'],
  },
}
const SISTEMA = `És um assistente que interpreta eventos de calendário da All4laser (equipamentos de estética)
para uma agenda de transportes. Cada evento é uma ENTREGA ou RECOLHA de um equipamento num cliente.
O texto é livre e em português. Extrai o tipo (entrega/recolha), o nome do cliente e a morada, se existirem.
Palavras como "entrega","montar","instalar","levar" → entrega; "recolha","recolher","levantar","buscar","fim" → recolha.
Se não for claro, usa "indefinido" e confiança "baixa". Nunca inventes moradas nem nomes.`

let _client: Anthropic | null = null
function ai(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return (_client ??= new Anthropic())
}

export async function extrairParagem(titulo: string, descricao: string, location: string): Promise<ParagemExtraida> {
  const client = ai()
  const fallback: ParagemExtraida = { tipo: 'indefinido', cliente: null, morada: location || null, confianca: 'baixa' }
  if (!client) return fallback
  try {
    const conteudo = `Título: ${titulo || '(vazio)'}\nMorada (campo local): ${location || '(vazio)'}\nDescrição:\n${(descricao || '').slice(0, 4000)}`
    const resp = await client.messages.create({
      model: MODELO_AI, max_tokens: 512, system: SISTEMA,
      tools: [TOOL], tool_choice: { type: 'tool', name: 'registar_paragem' },
      messages: [{ role: 'user', content: conteudo }],
    })
    const bloco = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const d = (bloco?.input ?? {}) as Partial<ParagemExtraida>
    const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return {
      tipo: d.tipo === 'entrega' || d.tipo === 'recolha' ? d.tipo : 'indefinido',
      cliente: t(d.cliente),
      morada: t(d.morada) ?? (location || null),
      confianca: d.confianca === 'alta' || d.confianca === 'media' ? d.confianca : 'baixa',
    }
  } catch {
    return fallback
  }
}

// ─── Aviso morada vs zona (heurística leve, não decide nada) ──────────────────
const KW: Record<string, string[]> = {
  norte: ['porto', 'braga', 'famalicão', 'famalicao', 'guimarães', 'guimaraes', 'viana', 'aveiro', 'gaia', 'matosinhos', 'maia', 'barcelos'],
  algarve: ['faro', 'albufeira', 'portimão', 'portimao', 'lagos', 'loulé', 'loule', 'tavira', 'olhão', 'olhao', 'quarteira', 'vilamoura'],
  lisboa: ['lisboa', 'cascais', 'sintra', 'oeiras', 'almada', 'setúbal', 'setubal', 'amadora', 'loures', 'seixal', 'barreiro'],
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
function dataDe(inicioISO: string): string { return inicioISO.slice(0, 10) }

async function cruzarCliente(sb: SupabaseClient, nome: string | null): Promise<string | null> {
  if (!nome || nome.trim().length < 3) return null
  const { data } = await sb.from('clientes').select('id').ilike('nome', `%${nome.trim()}%`).limit(1)
  return (data as { id: string }[] | null)?.[0]?.id ?? null
}

type CalRow = { id: string; google_calendar_id: string; nome: string; zona: string; equipamento_id: string | null; ativo: boolean }
type StopRow = { id: string; hash_evento: string | null; estado: string; cliente_id: string | null }

// ─── Sincronização principal ─────────────────────────────────────────────────
export async function sincronizarParagens(sb: SupabaseClient): Promise<{ ok: boolean; calendarios: number; novos: number; alterados: number; cancelados: number; erros: string[] }> {
  const erros: string[] = []
  const { data: cals } = await sb.from('transport_calendars').select('*').eq('ativo', true)
  const calendarios = (cals as CalRow[]) ?? []
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + DIAS * 86400_000).toISOString()

  let novos = 0, alterados = 0, cancelados = 0
  for (const cal of calendarios) {
    const r = await listarEventosDetalhados(cal.google_calendar_id, timeMin, timeMax)
    if (!r.ok || !r.eventos) { erros.push(`${cal.nome}: ${r.erro ?? 'sem eventos'}`); continue }

    for (const ev of r.eventos) {
      const { data: existRaw } = await sb.from('transport_stops').select('id, hash_evento, estado, cliente_id').eq('google_event_id', ev.id).maybeSingle()
      const exist = existRaw as StopRow | null
      const hash = hashEvento(ev)

      // Cancelado no Google → paragem cancelada (só se existir).
      if (ev.cancelado) {
        if (exist && exist.estado !== 'cancelada') {
          await sb.from('transport_stops').update({ estado: 'cancelada', alterado: true, hash_evento: hash, sincronizado_em: new Date().toISOString() }).eq('id', exist.id)
          cancelados++
        }
        continue
      }

      // Sem alterações → só marca sincronizado.
      if (exist && exist.hash_evento === hash) {
        await sb.from('transport_stops').update({ sincronizado_em: new Date().toISOString() }).eq('id', exist.id)
        continue
      }

      // Novo ou alterado → (re)interpretar.
      const p = await extrairParagem(ev.summary, ev.description, ev.location)
      const clienteId = await cruzarCliente(sb, p.cliente)
      const estado = (p.tipo === 'indefinido' || !p.cliente) ? 'por_classificar' : 'planeada'
      const campos = {
        calendar_id: cal.id,
        zona: cal.zona,
        equipamento_id: cal.equipamento_id,
        data: dataDe(ev.inicio),
        janela_inicio: ev.diaInteiro ? null : ev.inicio,
        janela_fim: ev.diaInteiro ? null : ev.fim,
        tipo: p.tipo,
        cliente_nome: p.cliente,
        cliente_id: clienteId,
        morada: p.morada,
        titulo_raw: ev.summary,
        descricao_raw: ev.description,
        confianca: p.confianca,
        aviso_morada: avisoMorada(cal.zona, p.morada),
        hash_evento: hash,
        link_evento: ev.htmlLink,
        sincronizado_em: new Date().toISOString(),
      }

      if (exist) {
        // Alterado: preserva o estado se já foi trabalhado (planeada/confirmada/concluida); senão recalcula.
        const manterEstado = ['planeada', 'confirmada', 'concluida'].includes(exist.estado)
        await sb.from('transport_stops').update({ ...campos, alterado: true, ...(manterEstado ? {} : { estado }) }).eq('id', exist.id)
        alterados++
      } else {
        await sb.from('transport_stops').insert({ ...campos, google_event_id: ev.id, estado })
        novos++
      }
    }
  }
  return { ok: erros.length === 0, calendarios: calendarios.length, novos, alterados, cancelados, erros }
}
