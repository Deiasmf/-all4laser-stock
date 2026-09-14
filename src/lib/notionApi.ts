// Cliente REST do Notion (só servidor). Usa o token em NOTION_TOKEN (env do
// Vercel) e a API de "data sources" (versão 2025-09-03). NÃO depende do MCP.
//
// Endpoints usados:
//   POST   /v1/data_sources/{id}/query   — listar linhas (tarefas)
//   POST   /v1/pages                     — criar página (parent = data_source_id)
//   PATCH  /v1/pages/{id}                — atualizar propriedades / arquivar
//   GET    /v1/pages/{id}                — ler uma página
//   GET    /v1/blocks/{id}/children      — ler o corpo (notas)
//   PATCH  /v1/blocks/{id}/children      — acrescentar blocos
//   DELETE /v1/blocks/{id}               — remover um bloco
//   GET    /v1/users/me                  — verificar o token (bot)

const API = 'https://api.notion.com/v1'
const VERSION = process.env.NOTION_VERSION || '2025-09-03'

// Data source "Tasks" (dentro de "Projects & tasks"). Pode ser sobreposto por env.
export const DATA_SOURCE_ID =
  process.env.NOTION_TASKS_DATA_SOURCE_ID || '2df37b59-e71f-8196-ae09-000b602f4b23'
// Assignee = eu (Andreia) por defeito; guardável por utilizador em notion_sync_contas.
export const ANDREIA_NOTION_USER_ID =
  process.env.NOTION_ASSIGNEE_ID || 'a7521b7e-31ab-4530-a497-dff0fe093934'

export type NotionRich = { plain_text?: string; text?: { content: string; link?: { url: string } | null }; annotations?: Record<string, boolean>; href?: string | null }
export type NotionPage = {
  id: string
  last_edited_time: string
  created_time: string
  archived?: boolean
  in_trash?: boolean
  properties: Record<string, NotionProp>
}
export type NotionProp = {
  type: string
  title?: NotionRich[]
  rich_text?: NotionRich[]
  select?: { name: string } | null
  status?: { name: string } | null
  multi_select?: { name: string }[]
  date?: { start: string; end: string | null } | null
  people?: { id: string }[]
  relation?: { id: string }[]
  checkbox?: boolean
}
export type NotionBlock = { id: string; type: string; [k: string]: unknown }

export class NotionError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message); this.name = 'NotionError'; this.status = status; this.code = code
  }
}

export function tokenNotion(): string | null {
  return process.env.NOTION_TOKEN || null
}

async function req<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await res.text()
  let json: Record<string, unknown> = {}
  try { json = texto ? JSON.parse(texto) : {} } catch { json = { message: texto } }
  if (!res.ok) {
    throw new NotionError(String(json.message ?? `Notion HTTP ${res.status}`), res.status, json.code as string | undefined)
  }
  return json as T
}

// Verifica o token (devolve o bot user). Lança NotionError se inválido.
export async function verificarToken(token: string): Promise<{ id: string; name?: string }> {
  return req(token, 'GET', '/users/me')
}

// Todas as MINHAS tarefas no Notion (Assignee = assigneeId), com paginação.
export async function queryTarefasAtribuidas(token: string, assigneeId: string): Promise<NotionPage[]> {
  const todas: NotionPage[] = []
  let cursor: string | undefined
  do {
    const body: Record<string, unknown> = {
      filter: { property: 'Assignee', people: { contains: assigneeId } },
      page_size: 100,
    }
    if (cursor) body.start_cursor = cursor
    const r = await req<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      token, 'POST', `/data_sources/${DATA_SOURCE_ID}/query`, body,
    )
    todas.push(...r.results)
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined
  } while (cursor)
  return todas
}

export async function obterPagina(token: string, pageId: string): Promise<NotionPage> {
  return req(token, 'GET', `/pages/${pageId}`)
}

export async function criarPagina(token: string, properties: Record<string, unknown>, children?: unknown[]): Promise<NotionPage> {
  const body: Record<string, unknown> = { parent: { type: 'data_source_id', data_source_id: DATA_SOURCE_ID }, properties }
  if (children && children.length) body.children = children
  return req(token, 'POST', '/pages', body)
}

export async function atualizarPagina(token: string, pageId: string, properties: Record<string, unknown>): Promise<NotionPage> {
  return req(token, 'PATCH', `/pages/${pageId}`, { properties })
}

export async function arquivarPagina(token: string, pageId: string, arquivar = true): Promise<NotionPage> {
  return req(token, 'PATCH', `/pages/${pageId}`, { archived: arquivar })
}

export async function lerBlocos(token: string, pageId: string): Promise<NotionBlock[]> {
  const blocos: NotionBlock[] = []
  let cursor: string | undefined
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100'
    const r = await req<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(
      token, 'GET', `/blocks/${pageId}/children${qs}`,
    )
    blocos.push(...r.results)
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined
  } while (cursor)
  return blocos
}

export async function acrescentarBlocos(token: string, pageId: string, children: unknown[]): Promise<void> {
  if (!children.length) return
  await req(token, 'PATCH', `/blocks/${pageId}/children`, { children })
}

export async function apagarBloco(token: string, blockId: string): Promise<void> {
  await req(token, 'DELETE', `/blocks/${blockId}`)
}
