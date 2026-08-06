import { supabase } from './supabase'
import type { FolhaObra, FolhaInput, FolhaHistorico } from '@/types/folhaObra'

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

export async function criarFolha(
  input: FolhaInput,
  criadoPor: string | null,
  notaEncomendaId?: string | null
) {
  return supabase
    .from('folhas_obra')
    .insert({ ...input, criado_por: criadoPor, nota_encomenda_id: notaEncomendaId ?? null })
    .select()
    .single()
}

// Folhas de obra ligadas a uma nota de encomenda (fase técnica do fluxo).
export async function folhasDaNota(notaId: string): Promise<FolhaObra[]> {
  const { data } = await supabase
    .from('folhas_obra')
    .select('*')
    .eq('nota_encomenda_id', notaId)
    .order('created_at', { ascending: false })
  return (data as FolhaObra[]) ?? []
}

// Existe pelo menos uma folha CONCLUÍDA ligada a esta nota?
export async function temFolhaConcluida(notaId: string): Promise<boolean> {
  const { count } = await supabase
    .from('folhas_obra')
    .select('id', { count: 'exact', head: true })
    .eq('nota_encomenda_id', notaId)
    .eq('estado', 'concluida')
  return (count ?? 0) > 0
}

export async function atualizarFolha(id: string, input: Partial<FolhaInput>) {
  return supabase.from('folhas_obra').update(input).eq('id', id).select().single()
}

export async function eliminarFolha(id: string) {
  return supabase.from('folhas_obra').delete().eq('id', id)
}

// ─── Reutilização por Serial Number ──────────────────────────────────────────

// Normaliza o S/N para a deteção (maiúsculas, sem espaços/hífens/símbolos).
export function normalizarSn(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Procura FOs concluídas para um S/N: correspondência exata (normalizada) e,
// se não houver, sugestões semelhantes (mesmo prefixo/conteúdo).
export async function procurarFolhasPorSn(sn: string): Promise<{ exatas: FolhaObra[]; semelhantes: FolhaObra[] }> {
  const alvo = normalizarSn(sn)
  if (alvo.length < 3) return { exatas: [], semelhantes: [] }
  const { data } = await supabase
    .from('folhas_obra')
    .select('*')
    .eq('estado', 'concluida')
    .not('equipamento_sn', 'is', null)
    .order('data_intervencao', { ascending: false })
    .order('created_at', { ascending: false })
  const todas = (data as FolhaObra[]) ?? []
  const exatas = todas.filter((f) => normalizarSn(f.equipamento_sn) === alvo)
  if (exatas.length > 0) return { exatas, semelhantes: [] }
  // Semelhantes: um contém o outro (>= 4 chars), para sugerir "é este equipamento?"
  const semelhantes = alvo.length >= 4
    ? todas.filter((f) => { const n = normalizarSn(f.equipamento_sn); return n.length >= 4 && (n.includes(alvo) || alvo.includes(n)) })
    : []
  return { exatas: [], semelhantes }
}

// Cria uma FO nova (rascunho) copiando a FO de origem para esta NE. Devolve o id.
export async function copiarFolhaObra(origemId: string, notaId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('copiar_folha_obra', { p_origem: origemId, p_nota: notaId })
  if (error) return { error: error.message }
  return { id: data as string }
}

// Limiar de idade (meses) para o aviso "folha com mais de X".
export async function mesesAvisoFolha(): Promise<number> {
  const { data } = await supabase.from('folha_obra_config').select('meses_aviso').eq('id', 1).single()
  return (data as { meses_aviso?: number } | null)?.meses_aviso ?? 12
}

// Histórico de alterações de uma FO (com o nome de quem alterou).
export async function historicoFolha(folhaId: string): Promise<FolhaHistorico[]> {
  const { data } = await supabase.from('folha_obra_historico').select('*').eq('folha_id', folhaId).order('em', { ascending: false })
  const rows = (data as FolhaHistorico[]) ?? []
  const ids = Array.from(new Set(rows.map((r) => r.por_id).filter(Boolean))) as string[]
  const nomes = new Map<string, string | null>()
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', ids)
    for (const p of (profs as { id: string; nome: string | null }[]) ?? []) nomes.set(p.id, p.nome)
  }
  return rows.map((r) => ({ ...r, por_nome: r.por_id ? nomes.get(r.por_id) ?? null : null }))
}

// Desbloqueia uma FO (só admin — a BD impede caso contrário) e regista o motivo.
export async function desbloquearFolha(folhaId: string, motivo: string, autor: { id: string | null; nome: string | null }): Promise<{ error?: string }> {
  const { error } = await supabase.from('folhas_obra').update({ bloqueada: false, bloqueada_em: null }).eq('id', folhaId)
  if (error) return { error: error.message }
  await supabase.from('folha_obra_desbloqueios').insert({ folha_id: folhaId, por_id: autor.id, por_nome: autor.nome, motivo: motivo.trim() || null })
  return {}
}

// ─── Assinaturas ────────────────────────────────────────────────────────────

const BUCKET_ASSINATURAS = 'assinaturas'

// Faz upload do PNG da assinatura e grava o URL + timestamp na folha.
export async function guardarAssinatura(
  folhaId: string,
  tipo: 'tecnico' | 'cliente',
  blob: Blob
): Promise<{ data: FolhaObra | null; error: { message: string } | null }> {
  // Caminho único (com timestamp) → insert simples. NÃO usar upsert: o
  // INSERT ... ON CONFLICT DO UPDATE do upsert é bloqueado pela RLS do storage
  // para o role authenticated ("new row violates row-level security policy").
  const caminho = `${folhaId}/${tipo}-${Date.now()}.png`
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_ASSINATURAS)
    .upload(caminho, blob, { contentType: 'image/png' })
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

// ─── PDF ────────────────────────────────────────────────────────────────────

const BUCKET_DOCS = 'folhas-obra-docs'

// Faz upload do PDF gerado e guarda o pdf_url na folha.
export async function guardarPdfFolha(
  folha: FolhaObra,
  blob: Blob
): Promise<{ data: FolhaObra | null; error: { message: string } | null }> {
  // Caminho único (com timestamp) → insert simples (sem upsert; ver nota em
  // guardarAssinatura). O pdf_url passa a apontar sempre para o PDF mais recente.
  const caminho = `${folha.id}/${folha.numero}-${Date.now()}.pdf`
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DOCS)
    .upload(caminho, blob, { contentType: 'application/pdf' })
  if (erroUpload) return { data: null, error: erroUpload }

  const { data: pub } = supabase.storage.from(BUCKET_DOCS).getPublicUrl(caminho)
  const { data, error } = await supabase
    .from('folhas_obra')
    .update({ pdf_url: pub.publicUrl })
    .eq('id', folha.id)
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
