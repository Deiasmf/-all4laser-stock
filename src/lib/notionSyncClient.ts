import { supabase } from './supabase'

// Leitura/ações do painel de sincronização Notion (lado cliente). As escritas
// pesadas (falar com o Notion) passam pelos endpoints /api/tarefas/notion-*.

export type EstadoSync = {
  ativo: boolean
  import_revisto: boolean
  ultima_sync_at: string | null
  ultima_sync_ok: boolean | null
  ultimo_erro: string | null
  falhas_seguidas: number
  tarefas_sincronizadas: number
} | null

export type RunSync = {
  id: string; origem: string | null; iniciado_at: string; ok: boolean | null
  criadas_app: number; atualizadas_app: number; criadas_notion: number; atualizadas_notion: number
  conflitos: number; erro: string | null
}

export type Conflito = {
  id: string; task_id: string | null; campo: string
  valor_app: string | null; valor_notion: string | null; vencedor: string; created_at: string
}

export type StagingItem = {
  id: string; notion_page_id: string; titulo: string | null; estado_notion: string | null; tags: string[] | null; incluir: boolean
}

export async function obterEstadoSync(userId: string): Promise<EstadoSync> {
  const { data } = await supabase.from('notion_sync_contas')
    .select('ativo, import_revisto, ultima_sync_at, ultima_sync_ok, ultimo_erro, falhas_seguidas, tarefas_sincronizadas')
    .eq('user_id', userId).maybeSingle()
  return (data as EstadoSync) ?? null
}

export async function ultimasRuns(userId: string, limite = 5): Promise<RunSync[]> {
  const { data } = await supabase.from('notion_sync_runs')
    .select('id, origem, iniciado_at, ok, criadas_app, atualizadas_app, criadas_notion, atualizadas_notion, conflitos, erro')
    .eq('user_id', userId).order('iniciado_at', { ascending: false }).limit(limite)
  return (data as RunSync[]) ?? []
}

export async function listarConflitos(userId: string): Promise<Conflito[]> {
  const { data } = await supabase.from('notion_sync_conflitos')
    .select('id, task_id, campo, valor_app, valor_notion, vencedor, created_at')
    .eq('user_id', userId).eq('resolvido', false).order('created_at', { ascending: false })
  return (data as Conflito[]) ?? []
}

export async function resolverConflito(id: string) {
  return supabase.from('notion_sync_conflitos').update({ resolvido: true }).eq('id', id)
}

export async function listarStaging(userId: string): Promise<StagingItem[]> {
  const { data } = await supabase.from('notion_sync_import_staging')
    .select('id, notion_page_id, titulo, estado_notion, tags, incluir')
    .eq('user_id', userId).eq('importado', false).order('titulo', { ascending: true })
  return (data as StagingItem[]) ?? []
}

export async function marcarIncluir(id: string, incluir: boolean) {
  return supabase.from('notion_sync_import_staging').update({ incluir }).eq('id', id)
}

// Chama um endpoint da API com o token da sessão (Bearer).
async function chamarApi(path: string): Promise<{ ok: boolean; erro?: string; [k: string]: unknown }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, erro: 'Sessão em falta.' }
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  try { return await res.json() } catch { return { ok: false, erro: `Erro ${res.status}.` } }
}

export function sincronizarAgora(dryrun = false) {
  return chamarApi(`/api/tarefas/notion-sync${dryrun ? '?dryrun=1' : ''}`)
}
export function importarSelecionadasApi() {
  return chamarApi('/api/tarefas/notion-import')
}
