import { supabase } from './supabase'
import type { FolhaObra, FolhaInput } from '@/types/folhaObra'

// ─── Folhas de obra ─────────────────────────────────────────────────────────

export async function listarFolhas(): Promise<FolhaObra[]> {
  const { data } = await supabase
    .from('folhas_obra')
    .select('*')
    .order('data_intervencao', { ascending: false })
    .order('created_at', { ascending: false })
  return (data as FolhaObra[]) ?? []
}

export async function obterFolha(id: string) {
  return supabase.from('folhas_obra').select('*').eq('id', id).single()
}

export async function criarFolha(input: FolhaInput, criadoPor: string | null) {
  return supabase
    .from('folhas_obra')
    .insert({ ...input, criado_por: criadoPor })
    .select()
    .single()
}

export async function atualizarFolha(id: string, input: Partial<FolhaInput>) {
  return supabase.from('folhas_obra').update(input).eq('id', id).select().single()
}

export async function eliminarFolha(id: string) {
  return supabase.from('folhas_obra').delete().eq('id', id)
}

// ─── Assinaturas ────────────────────────────────────────────────────────────

const BUCKET_ASSINATURAS = 'assinaturas'

// Faz upload do PNG da assinatura e grava o URL + timestamp na folha.
export async function guardarAssinatura(
  folhaId: string,
  tipo: 'tecnico' | 'cliente',
  blob: Blob
): Promise<{ data: FolhaObra | null; error: { message: string } | null }> {
  const caminho = `${folhaId}/${tipo}-${Date.now()}.png`
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_ASSINATURAS)
    .upload(caminho, blob, { contentType: 'image/png', upsert: true })
  if (erroUpload) return { data: null, error: erroUpload }

  const { data: pub } = supabase.storage.from(BUCKET_ASSINATURAS).getPublicUrl(caminho)
  const agora = new Date().toISOString()
  const campos =
    tipo === 'tecnico'
      ? { assinatura_tecnico_url: pub.publicUrl, assinatura_tecnico_at: agora }
      : { assinatura_cliente_url: pub.publicUrl, assinatura_cliente_at: agora }

  const { data, error } = await supabase
    .from('folhas_obra')
    .update(campos)
    .eq('id', folhaId)
    .select()
    .single()
  return { data: (data as FolhaObra) ?? null, error }
}

// ─── Seletores para o formulário ────────────────────────────────────────────

export type ClienteOpc = { id: string; nome: string; pais: string | null }

export async function pesquisarClientes(q: string): Promise<ClienteOpc[]> {
  if (q.trim().length < 1) return []
  const { data } = await supabase
    .from('clientes')
    .select('id, nome, pais')
    .ilike('nome', `%${q.trim()}%`)
    .order('nome')
    .limit(8)
  return (data as ClienteOpc[]) ?? []
}

export type EquipOpc = {
  id: string
  modelo: string | null
  serial_number: string | null
  ano: string | null
}

export async function pesquisarEquipamentos(q: string): Promise<EquipOpc[]> {
  if (q.trim().length < 2) return []
  const termo = q.trim()
  const { data } = await supabase
    .from('equipamentos')
    .select('id, modelo, serial_number, ano')
    .or(`serial_number.ilike.%${termo}%,modelo.ilike.%${termo}%`)
    .order('modelo')
    .limit(8)
  return (data as EquipOpc[]) ?? []
}

export type TecnicoOpc = { id: string; nome: string | null; email: string | null }

export async function listarTecnicos(): Promise<TecnicoOpc[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, nome, email')
    .order('nome', { nullsFirst: false })
  return (data as TecnicoOpc[]) ?? []
}
