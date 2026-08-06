import { supabase } from './supabase'
import { BUCKET_FREIGHT, obterPedido, listarLinhas } from './freight'
import { moradaDestino, type FreightRequest } from '@/types/freight'
import type { PackingList, PackingListLinha, PackingListPdf, LinhaPackingInput, IdiomaPacking } from '@/types/packing'

// Camada de dados das Packing Lists. RLS: admin + administrativo.
// Os PDFs ficam no bucket privado 'freight-quotes' sob a pasta packing-lists/.

export type CabecalhoPacking = {
  idioma: IdiomaPacking
  destinatario_nome: string | null
  destinatario_morada: string | null
  referencia: string | null
  tracking_awb: string | null
  observacoes: string | null
}

export function cabecalhoVazio(): CabecalhoPacking {
  return { idioma: 'en', destinatario_nome: null, destinatario_morada: null, referencia: null, tracking_awb: null, observacoes: null }
}

export async function listarPackingLists(): Promise<PackingList[]> {
  const { data } = await supabase.from('packing_lists').select('*').order('created_at', { ascending: false })
  return (data as PackingList[]) ?? []
}
export async function obterPackingList(id: string) {
  return supabase.from('packing_lists').select('*').eq('id', id).single()
}
export async function listarLinhasPacking(id: string): Promise<PackingListLinha[]> {
  const { data } = await supabase.from('packing_list_linhas').select('*').eq('packing_list_id', id).order('ordem')
  return (data as PackingListLinha[]) ?? []
}
export async function listarPdfsPacking(id: string): Promise<PackingListPdf[]> {
  const { data } = await supabase.from('packing_list_pdfs').select('*').eq('packing_list_id', id).order('versao', { ascending: false })
  return (data as PackingListPdf[]) ?? []
}

async function proximoNumero(): Promise<string | null> {
  const { data } = await supabase.rpc('packing_list_next_numero')
  return (data as string) ?? null
}

export async function criarPackingList(cab: CabecalhoPacking, criadoPor: string | null) {
  const numero = await proximoNumero()
  return supabase.from('packing_lists').insert({ ...cab, numero, created_by: criadoPor }).select().single()
}

export async function atualizarPackingList(id: string, cab: Partial<CabecalhoPacking>) {
  return supabase.from('packing_lists').update({ ...cab, updated_at: new Date().toISOString() }).eq('id', id).select().single()
}

export async function guardarLinhasPacking(id: string, linhas: LinhaPackingInput[]) {
  const { error } = await supabase.from('packing_list_linhas').delete().eq('packing_list_id', id)
  if (error) return { error }
  if (linhas.length === 0) return { error: null }
  const rows = linhas.map((l, i) => ({ ...l, packing_list_id: id, ordem: i }))
  return supabase.from('packing_list_linhas').insert(rows)
}

// Cria uma packing list pré-preenchida a partir de um pedido de cotação:
// destino → destinatário, linhas de carga → volumes (descrição = nome da caixa,
// editável depois). Idioma default EN para destinos fora de Portugal.
export async function criarPackingListDePedido(requestId: string, criadoPor: string | null): Promise<{ id?: string; error?: string }> {
  const { data: p, error } = await obterPedido(requestId)
  if (error || !p) return { error: error?.message ?? 'Pedido não encontrado.' }
  const ped = p as FreightRequest
  const idioma: IdiomaPacking = (ped.destino_pais ?? '').toLowerCase().includes('portugal') ? 'pt' : 'en'
  const { data: novo, error: e2 } = await criarPackingList({
    idioma,
    destinatario_nome: null,
    destinatario_morada: moradaDestino(ped) || null,
    referencia: null,
    tracking_awb: null,
    observacoes: null,
  }, criadoPor)
  if (e2 || !novo) return { error: e2?.message ?? 'Falha ao criar.' }
  const plId = (novo as PackingList).id
  await supabase.from('packing_lists').update({ request_id: requestId }).eq('id', plId)
  const cargo = await listarLinhas(requestId)
  if (cargo.length > 0) {
    await guardarLinhasPacking(plId, cargo.map((l) => ({
      descricao: l.descricao,
      ext_c: l.ext_c, ext_l: l.ext_l, ext_a: l.ext_a,
      peso_liquido: l.peso_volume,
      peso_bruto: l.peso_volume,
      quantidade: l.quantidade,
    })))
  }
  return { id: plId }
}

// Se já existe packing list para este pedido, devolve-a; senão cria.
export async function packingListDoPedido(requestId: string): Promise<PackingList | null> {
  const { data } = await supabase.from('packing_lists').select('*').eq('request_id', requestId).order('created_at', { ascending: false }).limit(1)
  return (data as PackingList[])?.[0] ?? null
}

// ─── Versões de PDF ──────────────────────────────────────────────────────────
function nomeSeguro(n: string) {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]/g, '_')
}
export async function guardarVersaoPdf(plId: string, numero: string, blob: Blob): Promise<{ versao?: number; path?: string; motivo?: string }> {
  const existentes = await listarPdfsPacking(plId)
  const versao = (existentes[0]?.versao ?? 0) + 1
  const path = `packing-lists/${plId}/v${versao}-${nomeSeguro(numero || plId)}.pdf`
  const { error } = await supabase.storage.from(BUCKET_FREIGHT).upload(path, blob, { contentType: 'application/pdf', upsert: true })
  if (error) return { motivo: error.message }
  const { error: e2 } = await supabase.from('packing_list_pdfs').insert({ packing_list_id: plId, versao, pdf_path: path })
  if (e2) return { motivo: e2.message }
  return { versao, path }
}
export async function urlPdfPacking(path: string, segundos = 120): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_FREIGHT).createSignedUrl(path, segundos)
  return data?.signedUrl ?? null
}
