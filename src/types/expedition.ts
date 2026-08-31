// Tipos e constantes puras do módulo Expedições (agrupamento de Notas de
// Encomenda num envio único). Sem dependências de Supabase.
import type { NotaEncomenda } from './notaEncomenda'

export type EstadoExpedition = 'em_preparacao' | 'pronta' | 'expedida' | 'entregue' | 'cancelada'
export type TipoTransporteExp = 'expresso' | 'carga_aerea' | 'outro'

export type Expedition = {
  id: string
  numero: string | null
  cliente_id: string | null
  cliente_nome: string | null
  morada_entrega_id: string | null
  morada_etiqueta: string | null
  morada: string | null
  cidade: string | null
  codigo_postal: string | null
  pais: string | null
  estado: EstadoExpedition
  tipo_transporte: TipoTransporteExp
  transportadora: string | null
  tracking_numero: string | null
  awb_numero: string | null
  carta_porte_url: string | null
  carta_porte_caminho: string | null
  data_prevista: string | null
  data_expedicao: string | null
  data_entrega: string | null
  notas: string | null
  criado_por: string | null
  criado_por_nome: string | null
  created_at: string
  updated_at: string
}

// Expedição + nº de NEs + resumo do conteúdo (para as listagens).
export type ExpedicaoComContagem = Expedition & { n_notas: number; resumo: string }

export type MoradaEntrega = {
  id: string
  cliente_id: string
  etiqueta: string | null
  morada: string | null
  cidade: string | null
  codigo_postal: string | null
  pais: string | null
}

export type ExpedicaoEvento = {
  id: string
  expedition_id: string
  tipo: string
  nota_id: string | null
  detalhe: string | null
  user_id: string | null
  user_nome: string | null
  created_at: string
}

export const ESTADOS_EXPEDITION: { valor: EstadoExpedition; label: string; cor: string; bg: string }[] = [
  { valor: 'em_preparacao', label: 'Em preparação', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'pronta', label: 'Pronta', cor: '#1D4ED8', bg: '#DBEAFE' },
  { valor: 'expedida', label: 'Expedida', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'entregue', label: 'Entregue', cor: '#4338CA', bg: '#E8E8FD' },
  { valor: 'cancelada', label: 'Cancelada', cor: '#6B7280', bg: '#F1F2F4' },
]
export function estadoExpInfo(v: string) {
  return ESTADOS_EXPEDITION.find((e) => e.valor === v) ?? ESTADOS_EXPEDITION[0]
}

export const TIPOS_TRANSPORTE_EXP: { valor: TipoTransporteExp; label: string }[] = [
  { valor: 'expresso', label: 'Expresso' },
  { valor: 'carga_aerea', label: 'Carga aérea (AWB)' },
  { valor: 'outro', label: 'Outro' },
]

// Resumo dos equipamentos de um conjunto de NEs (ex.: "2× Gmax Pro, 1× Vbeam").
export function resumoEquipamentos(notas: Pick<NotaEncomenda, 'equipamento_modelo'>[]): string {
  const contagem = new Map<string, number>()
  for (const n of notas) {
    const m = (n.equipamento_modelo ?? 'Equipamento').trim() || 'Equipamento'
    contagem.set(m, (contagem.get(m) ?? 0) + 1)
  }
  return [...contagem.entries()].map(([m, q]) => (q > 1 ? `${q}× ${m}` : m)).join(', ')
}

// Título descritivo (ponto 11): "EXP-2026-0007 — Cliente — 3 equipamentos".
export function tituloExpedicao(exp: Pick<Expedition, 'numero' | 'cliente_nome'>, nNotas: number): string {
  const cliente = exp.cliente_nome ?? 'Cliente'
  const eq = nNotas === 1 ? '1 equipamento' : `${nNotas} equipamentos`
  return `${exp.numero ?? 'EXP'} — ${cliente} — ${eq}`
}

// Morada de entrega numa linha só.
export function moradaLinha(m: Pick<Expedition, 'morada' | 'cidade' | 'codigo_postal' | 'pais'>): string {
  return [m.morada, [m.codigo_postal, m.cidade].filter(Boolean).join(' '), m.pais].filter(Boolean).join(', ')
}
