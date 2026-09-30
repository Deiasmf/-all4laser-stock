// Fase 2 dos Processos de Equipamentos: incidências e dossiê documental por
// processo (= por consignação). Incidências/fotos/documentos em is_staff();
// fotos e documentos num bucket PRIVADO ('cc-processos-docs') via signed URLs.

import { supabase } from './supabase'
import { comprimirImagem } from './mediaUpload'
import { procurarFolhasPorSn } from './folhasObra'
import type { FolhaObra } from '@/types/folhaObra'

export const BUCKET_CC_DOCS = 'cc-processos-docs'
export const LIMITE_FICHEIRO_MB = 25

export type Autor = { id: string | null; nome: string | null }
export type ResultadoUpload = { carregados: number; total: number; grandes: string[]; falhas: { nome: string; motivo: string }[] }

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type TipoIncidencia = 'avaria' | 'transporte' | 'pagamento' | 'documentacao' | 'outro'
export type GravidadeIncidencia = 'baixa' | 'media' | 'alta'
export type EstadoIncidencia = 'aberta' | 'em_resolucao' | 'resolvida' | 'fechada'

export const TIPOS_INCIDENCIA: { valor: TipoIncidencia; label: string }[] = [
  { valor: 'avaria', label: 'Avaria' },
  { valor: 'transporte', label: 'Transporte' },
  { valor: 'pagamento', label: 'Pagamento' },
  { valor: 'documentacao', label: 'Documentação' },
  { valor: 'outro', label: 'Outro' },
]
export const GRAVIDADES: { valor: GravidadeIncidencia; label: string; cor: string; bg: string }[] = [
  { valor: 'baixa', label: 'Baixa', cor: '#065F46', bg: '#D1FAE5' },
  { valor: 'media', label: 'Média', cor: '#92400E', bg: '#FEF3C7' },
  { valor: 'alta', label: 'Alta', cor: '#B91C1C', bg: '#FEE2E2' },
]
export const ESTADOS_INCIDENCIA: { valor: EstadoIncidencia; label: string; cor: string; bg: string; aberta: boolean }[] = [
  { valor: 'aberta', label: 'Aberta', cor: '#B91C1C', bg: '#FEE2E2', aberta: true },
  { valor: 'em_resolucao', label: 'Em resolução', cor: '#92400E', bg: '#FEF3C7', aberta: true },
  { valor: 'resolvida', label: 'Resolvida', cor: '#065F46', bg: '#D1FAE5', aberta: false },
  { valor: 'fechada', label: 'Fechada', cor: '#6B7280', bg: '#F3F4F6', aberta: false },
]
export function gravidadeInfo(v: string) { return GRAVIDADES.find((g) => g.valor === v) ?? GRAVIDADES[1] }
export function estadoIncidenciaInfo(v: string) { return ESTADOS_INCIDENCIA.find((e) => e.valor === v) ?? ESTADOS_INCIDENCIA[0] }
const ESTADOS_ABERTOS: EstadoIncidencia[] = ['aberta', 'em_resolucao']

export type IncidenciaFoto = { id: string; incidencia_id: string; url: string; caminho: string; nome: string | null; created_at: string; signedUrl?: string }
export type Incidencia = {
  id: string; consignacao_id: string; titulo: string; descricao: string | null
  tipo: TipoIncidencia; gravidade: GravidadeIncidencia; estado: EstadoIncidencia
  data_abertura: string | null; data_resolucao: string | null; resolucao: string | null
  criado_por_nome: string | null; created_at: string
  fotos: IncidenciaFoto[]
}
export type ProcessoDocumento = { id: string; consignacao_id: string; url: string; caminho: string; nome: string | null; tipo: 'foto' | 'documento'; criado_por_nome: string | null; created_at: string; signedUrl?: string }

function nomeSeguro(nome: string) { return nome.normalize('NFD').replace(/[^\w.\-]/g, '_') }

// Gera signed URLs (bucket privado) para um conjunto de caminhos, de uma vez.
async function assinar(caminhos: string[]): Promise<Map<string, string>> {
  const paths = caminhos.filter(Boolean)
  if (!paths.length) return new Map()
  const { data } = await supabase.storage.from(BUCKET_CC_DOCS).createSignedUrls(paths, 3600)
  const m = new Map<string, string>()
  for (const it of data ?? []) if (it.path && it.signedUrl) m.set(it.path, it.signedUrl)
  return m
}

// ─── Incidências ───────────────────────────────────────────────────────────────
export async function listarIncidencias(consignacaoId: string): Promise<Incidencia[]> {
  const { data } = await supabase
    .from('cc_incidencias')
    .select('*, fotos:cc_incidencia_fotos(*)')
    .eq('consignacao_id', consignacaoId)
    .order('created_at', { ascending: false })
  const incs = (data ?? []) as unknown as Incidencia[]
  // Assina as fotos de todas as incidências de uma vez.
  const todosCaminhos = incs.flatMap((i) => (i.fotos ?? []).map((f) => f.caminho))
  const urls = await assinar(todosCaminhos)
  for (const i of incs) {
    i.fotos = (i.fotos ?? [])
      .map((f) => ({ ...f, signedUrl: urls.get(f.caminho) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }
  return incs
}

// Consignações (por id) com pelo menos uma incidência ABERTA — para o estado do
// processo "com_incidencia" na vista ccProcessos.
export async function incidenciasAbertasPorConsignacao(consignacaoIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(consignacaoIds.filter(Boolean)))
  if (!ids.length) return new Set()
  const { data } = await supabase
    .from('cc_incidencias')
    .select('consignacao_id, estado')
    .in('consignacao_id', ids)
    .in('estado', ESTADOS_ABERTOS)
  const set = new Set<string>()
  for (const r of (data ?? []) as { consignacao_id: string }[]) set.add(r.consignacao_id)
  return set
}

export type IncidenciaInput = {
  consignacao_id: string; titulo: string; descricao?: string | null
  tipo: TipoIncidencia; gravidade: GravidadeIncidencia
}
export async function criarIncidencia(input: IncidenciaInput, autor: Autor) {
  return supabase.from('cc_incidencias').insert({
    consignacao_id: input.consignacao_id,
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    tipo: input.tipo,
    gravidade: input.gravidade,
    criado_por: autor.id,
    criado_por_nome: autor.nome,
  }).select().single()
}

// Muda o estado (e grava resolução/data quando passa a resolvida/fechada).
export async function atualizarEstadoIncidencia(id: string, estado: EstadoIncidencia, resolucao?: string | null) {
  const patch: Record<string, unknown> = { estado }
  if (estado === 'resolvida' || estado === 'fechada') {
    patch.data_resolucao = new Date().toISOString().slice(0, 10)
    if (resolucao !== undefined) patch.resolucao = resolucao?.trim() || null
  } else {
    patch.data_resolucao = null
  }
  return supabase.from('cc_incidencias').update(patch).eq('id', id).select().single()
}

export async function eliminarIncidencia(inc: Incidencia) {
  const caminhos = (inc.fotos ?? []).map((f) => f.caminho).filter(Boolean)
  if (caminhos.length) await supabase.storage.from(BUCKET_CC_DOCS).remove(caminhos)
  return supabase.from('cc_incidencias').delete().eq('id', inc.id)
}

export async function carregarFotosIncidencia(
  incidenciaId: string, ficheiros: File[],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoUpload> {
  const limiteBytes = LIMITE_FICHEIRO_MB * 1024 * 1024
  const res: ResultadoUpload = { carregados: 0, total: ficheiros.length, grandes: [], falhas: [] }
  let feitos = 0
  for (const original of ficheiros) {
    feitos++; onProgresso?.(feitos, ficheiros.length)
    const ficheiro = await comprimirImagem(original)
    if (ficheiro.size > limiteBytes) { res.grandes.push(original.name); continue }
    const caminho = `incidencias/${incidenciaId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_CC_DOCS).upload(caminho, ficheiro)
    if (error) {
      if (/exceed|maximum|too large|payload|size/i.test(error.message)) res.grandes.push(original.name)
      else res.falhas.push({ nome: original.name, motivo: error.message })
      continue
    }
    const { error: erroBd } = await supabase.from('cc_incidencia_fotos').insert({
      incidencia_id: incidenciaId, url: caminho, caminho, nome: original.name,
    })
    if (erroBd) { res.falhas.push({ nome: original.name, motivo: erroBd.message }); continue }
    res.carregados++
  }
  return res
}

export async function removerFotoIncidencia(foto: { id: string; caminho: string }) {
  if (foto.caminho) await supabase.storage.from(BUCKET_CC_DOCS).remove([foto.caminho])
  return supabase.from('cc_incidencia_fotos').delete().eq('id', foto.id)
}

// ─── Documentos do processo (uploads manuais) ────────────────────────────────
export async function listarDocumentos(consignacaoId: string): Promise<ProcessoDocumento[]> {
  const { data } = await supabase
    .from('cc_processo_documentos')
    .select('*')
    .eq('consignacao_id', consignacaoId)
    .order('created_at', { ascending: false })
  const docs = (data ?? []) as ProcessoDocumento[]
  const urls = await assinar(docs.map((d) => d.caminho))
  return docs.map((d) => ({ ...d, signedUrl: urls.get(d.caminho) }))
}

export async function carregarDocumentos(
  consignacaoId: string, ficheiros: File[], autor: Autor,
  onProgresso?: (feitos: number, total: number) => void,
): Promise<ResultadoUpload> {
  const limiteBytes = LIMITE_FICHEIRO_MB * 1024 * 1024
  const res: ResultadoUpload = { carregados: 0, total: ficheiros.length, grandes: [], falhas: [] }
  let feitos = 0
  for (const original of ficheiros) {
    feitos++; onProgresso?.(feitos, ficheiros.length)
    const eImagem = /^image\//.test(original.type)
    const ficheiro = eImagem ? await comprimirImagem(original) : original
    if (ficheiro.size > limiteBytes) { res.grandes.push(original.name); continue }
    const caminho = `documentos/${consignacaoId}/${Date.now()}-${nomeSeguro(ficheiro.name)}`
    const { error } = await supabase.storage.from(BUCKET_CC_DOCS).upload(caminho, ficheiro, { contentType: original.type || undefined })
    if (error) {
      if (/exceed|maximum|too large|payload|size/i.test(error.message)) res.grandes.push(original.name)
      else res.falhas.push({ nome: original.name, motivo: error.message })
      continue
    }
    const { error: erroBd } = await supabase.from('cc_processo_documentos').insert({
      consignacao_id: consignacaoId, url: caminho, caminho, nome: original.name,
      tipo: eImagem ? 'foto' : 'documento', criado_por: autor.id, criado_por_nome: autor.nome,
    })
    if (erroBd) { res.falhas.push({ nome: original.name, motivo: erroBd.message }); continue }
    res.carregados++
  }
  return res
}

export async function removerDocumento(doc: { id: string; caminho: string }) {
  if (doc.caminho) await supabase.storage.from(BUCKET_CC_DOCS).remove([doc.caminho])
  return supabase.from('cc_processo_documentos').delete().eq('id', doc.id)
}

// ─── Dossiê automático (só leitura): FOs por S/N + tracking do equipamento ────
export type TrackingLigado = {
  id: string; tracking_number: string | null; awb: string | null
  entidade_nome: string | null; estado: string | null; direcao: string | null; data_expedicao: string | null
}
export type DossieAuto = { folhas: FolhaObra[]; trackings: TrackingLigado[] }

export async function dossieAutomatico(sn: string | null, equipamentoId: string | null): Promise<DossieAuto> {
  const [folhasRes, trackings] = await Promise.all([
    sn ? procurarFolhasPorSn(sn) : Promise.resolve({ exatas: [] as FolhaObra[], semelhantes: [] as FolhaObra[] }),
    trackingsDoEquipamento(equipamentoId),
  ])
  return { folhas: folhasRes.exatas, trackings }
}

// Envios de tracking ligados a este equipamento (via shipments_tracking_sources).
async function trackingsDoEquipamento(equipamentoId: string | null): Promise<TrackingLigado[]> {
  if (!equipamentoId) return []
  const { data: srcs } = await supabase
    .from('shipments_tracking_sources')
    .select('tracking_id')
    .eq('source_type', 'equipamentos')
    .eq('source_id', equipamentoId)
    .eq('anulada', false)
  const ids = Array.from(new Set((srcs ?? []).map((s: { tracking_id: string }) => s.tracking_id)))
  if (!ids.length) return []
  const { data } = await supabase
    .from('shipments_tracking')
    .select('id, tracking_number, awb, entidade_nome, estado, direcao, data_expedicao')
    .in('id', ids)
    .is('deleted_at', null)
    .order('data_expedicao', { ascending: false, nullsFirst: false })
  return (data ?? []) as TrackingLigado[]
}
