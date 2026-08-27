import { supabase } from './supabase'
import type { Carrier, ShipmentTracking, TipoTransporte, Direcao, EstadoEnvio } from '@/types/tracking'
import { DIAS_DESTAQUE } from '@/types/tracking'

// Camada de dados do módulo Tracking. RLS: has_administrativo_access() (= is_staff,
// qualquer utilizador interno); a leitura de carriers está aberta a staff.

export const BUCKET_TRACKING = 'tracking-docs'

// ─── Transportadoras ─────────────────────────────────────────────────────────
export async function listarCarriers(incluirInativos = false): Promise<Carrier[]> {
  let q = supabase.from('carriers').select('*').order('tipo').order('nome')
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data } = await q
  return (data as Carrier[]) ?? []
}

// ─── Envios (shipments_tracking) ─────────────────────────────────────────────
export type FiltroEnvios = {
  estado?: EstadoEnvio
  tipo?: TipoTransporte
  direcao?: Direcao
  carrierId?: string
  entidade?: string           // pesquisa por nome de entidade
  procura?: string            // pesquisa por tracking / awb / entidade
  de?: string
  ate?: string
  eliminados?: boolean        // true = mostrar SÓ os eliminados (soft delete)
}

export async function listarEnvios(f: FiltroEnvios = {}): Promise<ShipmentTracking[]> {
  let q = supabase.from('shipments_tracking').select('*').order('data_expedicao', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  // Por defeito só ativos; o filtro "eliminados" mostra só os soft-deleted.
  q = f.eliminados ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.tipo) q = q.eq('tipo_transporte', f.tipo)
  if (f.direcao) q = q.eq('direcao', f.direcao)
  if (f.carrierId) q = q.eq('carrier_id', f.carrierId)
  if (f.de) q = q.gte('data_expedicao', f.de)
  if (f.ate) q = q.lte('data_expedicao', f.ate)
  if (f.procura && f.procura.trim()) {
    const t = f.procura.trim()
    q = q.or(`tracking_number.ilike.%${t}%,awb.ilike.%${t}%,entidade_nome.ilike.%${t}%,descricao_conteudo.ilike.%${t}%`)
  }
  const { data } = await q
  return (data as ShipmentTracking[]) ?? []
}

export async function obterEnvio(id: string) {
  return supabase.from('shipments_tracking').select('*').eq('id', id).single()
}

export type EnvioInput = {
  tracking_number: string | null
  awb: string | null
  awb_check_valido: boolean | null
  tipo_transporte: TipoTransporte
  carrier_id: string | null
  carrier_nome: string | null
  direcao: Direcao
  descricao_conteudo: string | null
  entidade_tipo: 'cliente' | 'fornecedor' | null
  cliente_id: string | null
  supplier_id: string | null
  entidade_nome: string | null
  estado: EstadoEnvio
  data_expedicao: string | null
  entrega_prevista: string | null
  entrega_efetiva: string | null
  notas: string | null
  aeroporto_origem: string | null
  aeroporto_destino: string | null
  num_volumes: number | null
  peso_kg: number | null
}

export type Autor = { id: string | null; nome: string | null }

// Criação manual (origem='manual'; sem source_type/source_id).
export async function criarEnvioManual(input: EnvioInput, criadoPor: Autor) {
  return supabase.from('shipments_tracking').insert({
    ...input,
    origem: 'manual',
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
  }).select().single()
}

// Criação a partir de upload de carta de porte (origem='upload'). Guarda o
// JSON extraído + confiança por campo para auditoria da qualidade da extração.
export async function criarEnvioUpload(
  input: EnvioInput,
  extracao: { json: unknown; confianca: unknown },
  criadoPor: Autor,
) {
  return supabase.from('shipments_tracking').insert({
    ...input,
    origem: 'upload',
    extracao_json: extracao.json,
    extracao_confianca: extracao.confianca,
    criado_por: criadoPor.id,
    criado_por_nome: criadoPor.nome,
  }).select().single()
}

export async function atualizarEnvio(id: string, patch: Partial<ShipmentTracking>) {
  return supabase.from('shipments_tracking').update(patch).eq('id', id).select().single()
}

// Eliminação (soft delete): marca deleted_at/by, remove a carta de porte do bucket
// (se for nossa) e NÃO toca no documento de origem. A sincronização automática
// passa a respeitar a eliminação (não ressuscita). Aplica-se a qualquer origem.
export async function eliminarEnvio(id: string, autor: Autor): Promise<{ error: string | null }> {
  const { data } = await supabase
    .from('shipments_tracking')
    .select('carta_porte_caminho')
    .eq('id', id)
    .single()
  const caminho = (data as { carta_porte_caminho: string | null } | null)?.carta_porte_caminho ?? null
  // Remove o ficheiro do nosso bucket (a carta_porte_url herdada da EP não é nossa).
  if (caminho) await supabase.storage.from(BUCKET_TRACKING).remove([caminho])
  const patch: Partial<ShipmentTracking> = {
    deleted_at: new Date().toISOString(),
    deleted_by: autor.id,
    deleted_by_nome: autor.nome,
  }
  if (caminho) patch.carta_porte_caminho = null
  const { error } = await supabase.from('shipments_tracking').update(patch).eq('id', id)
  return { error: error ? error.message : null }
}

// Restaura uma entrada eliminada (volta a aparecer na lista). A carta de porte
// não é recuperada (o ficheiro foi removido); pode ser re-anexada.
export async function restaurarEnvio(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('shipments_tracking').update({
    deleted_at: null, deleted_by: null, deleted_by_nome: null,
  }).eq('id', id)
  return { error: error ? error.message : null }
}

// Nº/identificação do documento de origem (para o aviso "associado a EP-…").
export async function numeroDaOrigem(sourceType: string | null, sourceId: string | null): Promise<string | null> {
  if (!sourceType || !sourceId) return null
  const mapa: Record<string, { tabela: string; coluna: string }> = {
    envios_pecas: { tabela: 'envios_pecas', coluna: 'numero' },
    expeditions: { tabela: 'expeditions', coluna: 'numero' },
    recepcao_movimentos: { tabela: 'recepcao_movimentos', coluna: 'referencia_numero' },
    equipamentos: { tabela: 'equipamentos', coluna: 'serial_number' },
  }
  const m = mapa[sourceType]
  if (!m) return null
  const { data } = await supabase.from(m.tabela).select(m.coluna).eq('id', sourceId).single()
  const val = (data as Record<string, unknown> | null)?.[m.coluna]
  return typeof val === 'string' && val.trim() ? val : null
}

// Origens (referências ao documento de origem) de um envio.
export type EnvioOrigem = { id: string; tracking_id: string; origem: string; source_type: string; source_id: string; anulada: boolean; created_at: string }
export async function listarOrigens(trackingId: string): Promise<EnvioOrigem[]> {
  const { data } = await supabase
    .from('shipments_tracking_sources')
    .select('*').eq('tracking_id', trackingId).order('created_at', { ascending: true })
  return (data as EnvioOrigem[]) ?? []
}

// ─── Log de extrações (auditoria da qualidade da extração AI) ────────────────
export type ExtracaoLog = {
  id: string
  ficheiro_nome: string | null
  content_type: string | null
  tamanho: number | null
  sucesso: boolean
  modelo: string | null
  erro: string | null
  extracao_json: unknown
  duplicado_de: string | null
  tracking_id: string | null
  user_nome: string | null
  created_at: string
}

export async function listarExtracaoLog(opts: { soErros?: boolean; limite?: number } = {}): Promise<ExtracaoLog[]> {
  let q = supabase.from('tracking_extracao_log').select('*').order('created_at', { ascending: false }).limit(opts.limite ?? 200)
  if (opts.soErros) q = q.eq('sucesso', false)
  const { data } = await q
  return (data as ExtracaoLog[]) ?? []
}

// ─── Carta de porte (bucket privado, signed URLs) ────────────────────────────
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}

export async function carregarCartaPorte(envioId: string, ficheiro: File): Promise<{ ok: boolean; motivo?: string }> {
  const caminho = `${envioId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
  const { error } = await supabase.storage.from(BUCKET_TRACKING).upload(caminho, ficheiro)
  if (error) return { ok: false, motivo: error.message }
  const { error: erroBd } = await supabase
    .from('shipments_tracking')
    .update({ carta_porte_caminho: caminho, carta_porte_url: null })
    .eq('id', envioId)
  if (erroBd) return { ok: false, motivo: erroBd.message }
  return { ok: true }
}

// URL para abrir a carta de porte: signed URL (bucket privado) ou o url público
// herdado da origem (envios_pecas grava carta_porte_url pública).
export async function urlCartaPorte(envio: Pick<ShipmentTracking, 'carta_porte_caminho' | 'carta_porte_url'>, segundos = 120): Promise<string | null> {
  if (envio.carta_porte_caminho) {
    const { data } = await supabase.storage.from(BUCKET_TRACKING).createSignedUrl(envio.carta_porte_caminho, segundos)
    if (data?.signedUrl) return data.signedUrl
  }
  return envio.carta_porte_url ?? null
}

// ─── Resumo para o dashboard administrativo ──────────────────────────────────
export type ResumoTracking = {
  emTransitoExpresso: number
  emTransitoAerea: number
  atrasadosExpresso: number
  atrasadosAerea: number
  problema: number
}

export async function resumoTracking(): Promise<ResumoTracking> {
  const { data } = await supabase
    .from('shipments_tracking')
    .select('tipo_transporte, estado, data_expedicao, origem_anulada')
    .in('estado', ['registado', 'em_transito', 'problema'])
    .eq('origem_anulada', false)
    .is('deleted_at', null)
  const linhas = (data as Pick<ShipmentTracking, 'tipo_transporte' | 'estado' | 'data_expedicao' | 'origem_anulada'>[]) ?? []
  const hoje = Date.now()
  const r: ResumoTracking = { emTransitoExpresso: 0, emTransitoAerea: 0, atrasadosExpresso: 0, atrasadosAerea: 0, problema: 0 }
  for (const l of linhas) {
    if (l.estado === 'problema') { r.problema++; continue }
    const aerea = l.tipo_transporte === 'carga_aerea'
    if (aerea) r.emTransitoAerea++; else r.emTransitoExpresso++
    if (l.data_expedicao) {
      const dias = Math.floor((hoje - new Date(l.data_expedicao).getTime()) / 86400000)
      const limite = aerea ? DIAS_DESTAQUE.carga_aerea : DIAS_DESTAQUE.expresso
      if (dias >= limite) { if (aerea) r.atrasadosAerea++; else r.atrasadosExpresso++ }
    }
  }
  return r
}

// Nº de dias em trânsito (para destacar na tabela). null se sem data.
export function diasEmTransito(dataExpedicao: string | null): number | null {
  if (!dataExpedicao) return null
  return Math.floor((Date.now() - new Date(dataExpedicao).getTime()) / 86400000)
}
