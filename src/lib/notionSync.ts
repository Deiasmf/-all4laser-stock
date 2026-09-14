// Motor de sincronização A Minha Área ↔ Notion (só servidor; usa service role).
// Âmbito: apenas as MINHAS tarefas (Assignee = eu no Notion). Notas e subtarefas
// vão só app→Notion (fase 1); os campos escalares e as etiquetas são nos dois
// sentidos. Conflitos (editado dos dois lados no mesmo intervalo) são resolvidos
// pela edição mais recente e SEMPRE registados em notion_sync_conflitos.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  tokenNotion, verificarToken, queryTarefasAtribuidas, criarPagina, atualizarPagina,
  obterPagina, lerBlocos, apagarBloco, acrescentarBlocos,
  ANDREIA_NOTION_USER_ID, type NotionPage, type NotionProp,
} from './notionApi'

// ─── Mapeamentos ──────────────────────────────────────────────────────────────
const ESTADO_STATUS: Record<string, string> = {
  pendente: 'Not Started', em_curso: 'In Progress', aguarda_info: 'On Hold',
  concluida: 'Done', adiada: 'Another time',
}
const STATUS_ESTADO: Record<string, string> = {
  'Not Started': 'pendente', 'In Progress': 'em_curso', 'On Hold': 'aguarda_info',
  'Done': 'concluida', 'Another time': 'adiada',
  // 'Archived' é tratado à parte (arquivar), não muda o estado.
}
const PRIO_PRIORITY: Record<string, string> = { baixa: 'Low', normal: 'Medium', alta: 'High' }
const PRIORITY_PRIO: Record<string, string> = { Low: 'baixa', Medium: 'normal', High: 'alta' }

// ─── Leitura de propriedades do Notion ─────────────────────────────────────────
function texto(p?: NotionProp): string {
  const arr = p?.title ?? p?.rich_text ?? []
  return arr.map((r) => r.plain_text ?? r.text?.content ?? '').join('')
}
const statusName = (p?: NotionProp) => p?.status?.name ?? null
const selectName = (p?: NotionProp) => p?.select?.name ?? null
const dateStart = (p?: NotionProp) => p?.date?.start ?? null
const multi = (p?: NotionProp) => (p?.multi_select ?? []).map((o) => o.name)

// ─── Construção de valores de propriedades ─────────────────────────────────────
const titleVal = (s: string) => ({ title: [{ text: { content: s || '' } }] })
const richVal = (s: string | null) => ({ rich_text: s ? [{ text: { content: s } }] : [] })
const selectVal = (name: string | null) => ({ select: name ? { name } : null })
const statusVal = (name: string) => ({ status: { name } })
const dateVal = (d: string | null) => ({ date: d ? { start: d } : null })
const multiVal = (names: string[]) => ({ multi_select: names.map((n) => ({ name: n })) })
const peopleVal = (ids: string[]) => ({ people: ids.map((id) => ({ id })) })
const relationVal = (ids: string[]) => ({ relation: ids.map((id) => ({ id })) })

// ─── Notas: HTML simples → blocos Notion (fase 1: parágrafos + bullets; o texto
// inline é simplificado). Best-effort e à prova de falhas. ─────────────────────
function stripInline(frag: string): string {
  return frag
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim()
}
function paragrafo(txt: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: txt.slice(0, 1900) } }] } }
}
export function notasParaBlocos(html: string | null): unknown[] {
  if (!html) return []
  try {
    const blocos: unknown[] = []
    for (const parte of html.replace(/\r?\n/g, '').split(/(<ul[\s\S]*?<\/ul>)/i)) {
      if (!parte) continue
      if (/^<ul/i.test(parte)) {
        for (const li of parte.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) ?? []) {
          const t = stripInline(li)
          if (t) blocos.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: t.slice(0, 1900) } }] } })
        }
      } else {
        for (const p of parte.split(/<\/p>|<\/div>|<br\s*\/?>/i)) {
          const t = stripInline(p)
          if (t) blocos.push(paragrafo(t))
        }
      }
    }
    return blocos.slice(0, 100)
  } catch {
    const t = stripInline(html)
    return t ? [paragrafo(t)] : []
  }
}

// ─── Tipos internos ────────────────────────────────────────────────────────────
type EtiquetaApp = { id: string; nome: string; notion_tag_name: string | null }
type SubApp = { id: string; titulo: string; concluida: boolean; notion_page_id: string | null }
type TarefaSync = {
  assigneeId: string
  estado: string
  concluida_em: string | null
  arquivada_em: string | null
  task: {
    id: string; titulo: string; descricao: string | null; prioridade: string
    data_limite: string | null; notas: string | null; updated_at: string
    last_synced_at: string | null; notion_page_id: string | null; notion_last_edited_at: string | null
  }
  etiquetas: EtiquetaApp[]
  subtarefas: SubApp[]
}
export type SyncStats = {
  criadas_app: number; atualizadas_app: number
  criadas_notion: number; atualizadas_notion: number; conflitos: number
}
export type SyncResultado = SyncStats & { ok: boolean; erro?: string; dryrun: boolean; plano?: string[] }

// ─── Carregar as minhas tarefas (app) prontas para sincronizar ─────────────────
async function carregarTarefasApp(sb: SupabaseClient, userId: string): Promise<TarefaSync[]> {
  const { data } = await sb.from('user_task_assignees')
    .select('id, estado, concluida_em, arquivada_em, user_tasks(id, titulo, descricao, prioridade, data_limite, notas, updated_at, last_synced_at, notion_page_id, notion_last_edited_at)')
    .eq('user_id', userId)
  const linhas = (data as unknown as { id: string; estado: string; concluida_em: string | null; arquivada_em: string | null; user_tasks: TarefaSync['task'] | null }[]) ?? []
  const validas = linhas.filter((l) => l.user_tasks)
  const ids = validas.map((l) => l.user_tasks!.id)
  const [etq, subs] = await Promise.all([
    ids.length ? sb.from('user_task_etiquetas').select('task_id, task_etiquetas(id, nome, notion_tag_name)').in('task_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('user_task_subtarefas').select('id, task_id, titulo, concluida, notion_page_id').in('task_id', ids) : Promise.resolve({ data: [] }),
  ])
  const etqPor = new Map<string, EtiquetaApp[]>()
  for (const r of (etq.data as unknown as { task_id: string; task_etiquetas: EtiquetaApp | null }[]) ?? []) {
    if (!r.task_etiquetas) continue
    const a = etqPor.get(r.task_id) ?? []; a.push(r.task_etiquetas); etqPor.set(r.task_id, a)
  }
  const subPor = new Map<string, SubApp[]>()
  for (const r of (subs.data as unknown as (SubApp & { task_id: string })[]) ?? []) {
    const a = subPor.get(r.task_id) ?? []; a.push(r); subPor.set(r.task_id, a)
  }
  return validas.map((l) => ({
    assigneeId: l.id, estado: l.estado, concluida_em: l.concluida_em, arquivada_em: l.arquivada_em,
    task: l.user_tasks!, etiquetas: etqPor.get(l.user_tasks!.id) ?? [], subtarefas: subPor.get(l.user_tasks!.id) ?? [],
  }))
}

// Etiqueta por nome (cria se não existir). Devolve o id.
async function etiquetaPorNome(sb: SupabaseClient, nome: string, cache: Map<string, string>): Promise<string | null> {
  const chave = nome.trim().toLowerCase()
  if (cache.has(chave)) return cache.get(chave)!
  const { data: existente } = await sb.from('task_etiquetas').select('id').ilike('nome', nome.trim()).eq('ativo', true).maybeSingle()
  let id = (existente as { id: string } | null)?.id ?? null
  if (!id) {
    const { data: nova } = await sb.from('task_etiquetas').insert({ nome: nome.trim(), cor: '#6366F1', notion_tag_name: nome.trim() }).select('id').single()
    id = (nova as { id: string } | null)?.id ?? null
  }
  if (id) cache.set(chave, id)
  return id
}

// Propriedades Notion a partir de uma tarefa da app.
function propsDeApp(t: TarefaSync, assigneeId: string): Record<string, unknown> {
  const status = t.arquivada_em ? 'Archived' : (ESTADO_STATUS[t.estado] ?? 'Not Started')
  return {
    'Task name': titleVal(t.task.titulo),
    'Description': richVal(t.task.descricao),
    'Status': statusVal(status),
    'Priority': selectVal(PRIO_PRIORITY[t.task.prioridade] ?? 'Medium'),
    'Due': dateVal(t.task.data_limite),
    'Completed on': dateVal(t.concluida_em),
    'Tags': multiVal(t.etiquetas.map((e) => e.notion_tag_name || e.nome)),
    'Assignee': peopleVal([assigneeId]),
  }
}

// Reescreve o corpo (notas) de uma página Notion.
async function reescreverNotas(token: string, pageId: string, notas: string | null) {
  const antigos = await lerBlocos(token, pageId)
  for (const b of antigos) { try { await apagarBloco(token, b.id) } catch { /* ignora */ } }
  await acrescentarBlocos(token, pageId, notasParaBlocos(notas))
}

// Cria/atualiza no Notion as subtarefas da app (só app→Notion).
async function empurrarSubtarefas(sb: SupabaseClient, token: string, t: TarefaSync, parentPageId: string) {
  for (const s of t.subtarefas) {
    const props = {
      'Task name': titleVal(s.titulo),
      'Status': statusVal(s.concluida ? 'Done' : 'Not Started'),
      'Parent-task': relationVal([parentPageId]),
      'Assignee': peopleVal([ANDREIA_NOTION_USER_ID]),
    }
    if (s.notion_page_id) {
      await atualizarPagina(token, s.notion_page_id, props)
    } else {
      const p = await criarPagina(token, props)
      await sb.from('user_task_subtarefas').update({ notion_page_id: p.id }).eq('id', s.id)
    }
  }
}

const t10 = (iso: string | null) => (iso ? iso.slice(0, 10) : null)
const antes = (a: string | null, b: string | null) => (a && b ? new Date(a).getTime() < new Date(b).getTime() : false)

// ─── Motor principal (um utilizador) ───────────────────────────────────────────
export async function sincronizar(
  sb: SupabaseClient,
  opts: { userId: string; origem: 'cron' | 'manual'; dryrun?: boolean },
): Promise<SyncResultado> {
  const dry = !!opts.dryrun
  const stats: SyncStats = { criadas_app: 0, atualizadas_app: 0, criadas_notion: 0, atualizadas_notion: 0, conflitos: 0 }
  const plano: string[] = []
  const token = tokenNotion()
  if (!token) return { ok: false, erro: 'NOTION_TOKEN não configurado no servidor.', dryrun: dry, ...stats }

  // Conta de sync (cria a predefinição se ainda não existir).
  let { data: conta } = await sb.from('notion_sync_contas').select('*').eq('user_id', opts.userId).maybeSingle()
  if (!conta) {
    const { data } = await sb.from('notion_sync_contas')
      .insert({ user_id: opts.userId, notion_user_id: ANDREIA_NOTION_USER_ID }).select('*').single()
    conta = data
  }
  const assigneeId = (conta as { notion_user_id: string | null }).notion_user_id || ANDREIA_NOTION_USER_ID
  const importRevisto = !!(conta as { import_revisto: boolean }).import_revisto

  const inicio = new Date().toISOString()
  try {
    await verificarToken(token)   // falha cedo e claro se o token for inválido

    const paginas = await queryTarefasAtribuidas(token, assigneeId)
    const app = await carregarTarefasApp(sb, opts.userId)
    const appPorNotion = new Map<string, TarefaSync>()
    for (const a of app) if (a.task.notion_page_id) appPorNotion.set(a.task.notion_page_id, a)
    const cacheEtq = new Map<string, string>()
    const agora = () => new Date().toISOString()

    // ── 1) App→Notion: criar as tarefas da app que ainda não existem no Notion ──
    for (const a of app) {
      if (a.task.notion_page_id) continue
      plano.push(`Criar no Notion: "${a.task.titulo}"`)
      stats.criadas_notion++
      if (dry) continue
      const p = await criarPagina(token, propsDeApp(a, assigneeId), notasParaBlocos(a.task.notas))
      await sb.from('user_tasks').update({ notion_page_id: p.id, notion_last_edited_at: p.last_edited_time, last_synced_at: agora() }).eq('id', a.task.id)
      await empurrarSubtarefas(sb, token, a, p.id)
      a.task.notion_page_id = p.id
      appPorNotion.set(p.id, a)
    }

    // ── 2) Reconciliação das tarefas ligadas + páginas novas do Notion ──────────
    for (const page of paginas) {
      const a = appPorNotion.get(page.id)
      const arquivadaNotion = !!page.archived || !!page.in_trash || statusName(page.properties['Status']) === 'Archived'

      if (!a) {
        // Página do Notion sem correspondência na app.
        if (!importRevisto) {
          plano.push(`Para importar (revisão): "${texto(page.properties['Task name'])}"`)
          if (!dry) {
            await sb.from('notion_sync_import_staging').upsert({
              user_id: opts.userId, notion_page_id: page.id,
              titulo: texto(page.properties['Task name']) || '(sem título)',
              estado_notion: statusName(page.properties['Status']),
              tags: multi(page.properties['Tags']),
            }, { onConflict: 'user_id,notion_page_id' })
          }
        } else if (!arquivadaNotion) {
          plano.push(`Criar na app (do Notion): "${texto(page.properties['Task name'])}"`)
          stats.criadas_app++
          if (!dry) await criarTarefaDaPagina(sb, opts.userId, page, cacheEtq)
        }
        continue
      }

      // Ligada nos dois lados → decidir sentido por data de edição.
      const appMudou = antes(a.task.last_synced_at, a.task.updated_at) || a.task.last_synced_at === null
      const notionMudou = antes(a.task.notion_last_edited_at, page.last_edited_time) || a.task.notion_last_edited_at === null

      if (!appMudou && !notionMudou) continue

      let vencedor: 'app' | 'notion'
      if (appMudou && notionMudou) {
        vencedor = new Date(a.task.updated_at).getTime() >= new Date(page.last_edited_time).getTime() ? 'app' : 'notion'
        await registarConflitos(sb, opts.userId, a, page, vencedor, dry, stats)
      } else {
        vencedor = appMudou ? 'app' : 'notion'
      }

      if (vencedor === 'app') {
        plano.push(`Atualizar Notion: "${a.task.titulo}"`)
        stats.atualizadas_notion++
        if (!dry) {
          await atualizarPagina(token, page.id, propsDeApp(a, assigneeId))
          await reescreverNotas(token, page.id, a.task.notas)
          await empurrarSubtarefas(sb, token, a, page.id)
          await sb.from('user_tasks').update({ notion_last_edited_at: page.last_edited_time, last_synced_at: agora() }).eq('id', a.task.id)
        }
      } else {
        plano.push(`Atualizar app (do Notion): "${texto(page.properties['Task name'])}"`)
        stats.atualizadas_app++
        if (!dry) await aplicarPaginaNaApp(sb, a, page, arquivadaNotion, cacheEtq)
      }
    }

    // ── 3) Guardar estado da conta + run OK ─────────────────────────────────────
    if (!dry) {
      await sb.from('notion_sync_contas').update({
        ultima_sync_at: agora(), ultima_sync_ok: true, ultimo_erro: null,
        falhas_seguidas: 0, tarefas_sincronizadas: app.length,
      }).eq('user_id', opts.userId)
      await sb.from('notion_sync_runs').insert({
        user_id: opts.userId, origem: opts.origem, iniciado_at: inicio, terminado_at: agora(), ok: true, ...stats,
      })
    }
    return { ok: true, dryrun: dry, plano: dry ? plano : undefined, ...stats }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Erro desconhecido na sincronização.'
    if (!dry) {
      const falhas = ((conta as { falhas_seguidas: number }).falhas_seguidas ?? 0) + 1
      await sb.from('notion_sync_contas').update({
        ultima_sync_at: inicio, ultima_sync_ok: false, ultimo_erro: erro, falhas_seguidas: falhas,
      }).eq('user_id', opts.userId)
      await sb.from('notion_sync_runs').insert({
        user_id: opts.userId, origem: opts.origem, iniciado_at: inicio, terminado_at: new Date().toISOString(), ok: false, erro, ...stats,
      })
      if (falhas >= 2) {
        await sb.from('user_notes').insert({
          to_user: opts.userId, from_user: null, urgente: true,
          mensagem: `⚠️ A sincronização com o Notion falhou ${falhas} vezes seguidas. Último erro: ${erro}`,
        })
      }
    }
    return { ok: false, erro, dryrun: dry, plano: dry ? plano : undefined, ...stats }
  }
}

// Regista conflitos por campo (valores diferentes) quando houve edição dos dois lados.
async function registarConflitos(
  sb: SupabaseClient, userId: string, a: TarefaSync, page: NotionPage, vencedor: 'app' | 'notion', dry: boolean, stats: SyncStats,
) {
  const pares: { campo: string; app: string; notion: string }[] = []
  const push = (campo: string, appV: string | null, notV: string | null) => {
    if ((appV ?? '') !== (notV ?? '')) pares.push({ campo, app: appV ?? '', notion: notV ?? '' })
  }
  push('titulo', a.task.titulo, texto(page.properties['Task name']))
  push('estado', a.arquivada_em ? 'Archived' : (ESTADO_STATUS[a.estado] ?? ''), statusName(page.properties['Status']))
  push('prioridade', PRIO_PRIORITY[a.task.prioridade] ?? '', selectName(page.properties['Priority']))
  push('data_limite', t10(a.task.data_limite), t10(dateStart(page.properties['Due'])))
  push('descricao', a.task.descricao, texto(page.properties['Description']))
  if (pares.length === 0) return
  stats.conflitos += pares.length
  if (dry) return
  await sb.from('notion_sync_conflitos').insert(pares.map((p) => ({
    user_id: userId, task_id: a.task.id, notion_page_id: page.id,
    campo: p.campo, valor_app: p.app, valor_notion: p.notion, vencedor,
  })))
}

// Aplica os dados de uma página do Notion numa tarefa da app já existente.
async function aplicarPaginaNaApp(sb: SupabaseClient, a: TarefaSync, page: NotionPage, arquivada: boolean, cacheEtq: Map<string, string>) {
  const status = statusName(page.properties['Status'])
  const estado = status && STATUS_ESTADO[status] ? STATUS_ESTADO[status] : a.estado
  const concluido = estado === 'concluida'
  await sb.from('user_tasks').update({
    titulo: texto(page.properties['Task name']) || a.task.titulo,
    descricao: texto(page.properties['Description']) || null,
    prioridade: PRIORITY_PRIO[selectName(page.properties['Priority']) ?? ''] ?? a.task.prioridade,
    data_limite: t10(dateStart(page.properties['Due'])),
    notion_last_edited_at: page.last_edited_time, last_synced_at: new Date().toISOString(),
  }).eq('id', a.task.id)
  await sb.from('user_task_assignees').update({
    estado,
    concluida_em: concluido ? (dateStart(page.properties['Completed on']) ?? new Date().toISOString()) : null,
    arquivada_em: arquivada ? (a.arquivada_em ?? new Date().toISOString()) : null,
  }).eq('id', a.assigneeId)
  await reconciliarTags(sb, a.task.id, multi(page.properties['Tags']), a.etiquetas, cacheEtq)
}

// Cria uma tarefa nova na app a partir de uma página do Notion (import / novo).
async function criarTarefaDaPagina(sb: SupabaseClient, userId: string, page: NotionPage, cacheEtq: Map<string, string>) {
  const status = statusName(page.properties['Status'])
  const estado = (status && STATUS_ESTADO[status]) ? STATUS_ESTADO[status] : 'pendente'
  const arquivada = !!page.archived || !!page.in_trash || status === 'Archived'
  const { data: tarefa } = await sb.from('user_tasks').insert({
    created_by: userId,
    titulo: texto(page.properties['Task name']) || '(sem título)',
    descricao: texto(page.properties['Description']) || null,
    prioridade: PRIORITY_PRIO[selectName(page.properties['Priority']) ?? ''] ?? 'normal',
    data_limite: t10(dateStart(page.properties['Due'])),
    notion_page_id: page.id, notion_last_edited_at: page.last_edited_time, last_synced_at: new Date().toISOString(),
  }).select('id').single()
  const taskId = (tarefa as { id: string } | null)?.id
  if (!taskId) return
  await sb.from('user_task_assignees').insert({
    task_id: taskId, user_id: userId, estado,
    concluida_em: estado === 'concluida' ? (dateStart(page.properties['Completed on']) ?? new Date().toISOString()) : null,
    arquivada_em: arquivada ? new Date().toISOString() : null,
  })
  await reconciliarTags(sb, taskId, multi(page.properties['Tags']), [], cacheEtq)
}

// Faz as etiquetas da app espelharem as tags do Notion (adiciona em falta, remove a mais).
async function reconciliarTags(sb: SupabaseClient, taskId: string, tagsNotion: string[], atuais: EtiquetaApp[], cacheEtq: Map<string, string>) {
  const alvo = new Set<string>()
  for (const nome of tagsNotion) {
    const id = await etiquetaPorNome(sb, nome, cacheEtq)
    if (id) alvo.add(id)
  }
  const atuaisIds = new Set(atuais.map((e) => e.id))
  const adicionar = [...alvo].filter((id) => !atuaisIds.has(id))
  const remover = [...atuaisIds].filter((id) => !alvo.has(id))
  if (adicionar.length) await sb.from('user_task_etiquetas').upsert(adicionar.map((etiqueta_id) => ({ task_id: taskId, etiqueta_id })), { onConflict: 'task_id,etiqueta_id' })
  for (const etiqueta_id of remover) await sb.from('user_task_etiquetas').delete().eq('task_id', taskId).eq('etiqueta_id', etiqueta_id)
}

// ─── Importação inicial: confirmar as linhas escolhidas na revisão ─────────────
export async function importarSelecionadas(sb: SupabaseClient, userId: string): Promise<{ ok: boolean; importadas: number; erro?: string }> {
  const token = tokenNotion()
  if (!token) return { ok: false, importadas: 0, erro: 'NOTION_TOKEN não configurado.' }
  try {
    const { data } = await sb.from('notion_sync_import_staging')
      .select('id, notion_page_id').eq('user_id', userId).eq('incluir', true).eq('importado', false)
    const linhas = (data as { id: string; notion_page_id: string }[]) ?? []
    const cacheEtq = new Map<string, string>()
    let n = 0
    for (const l of linhas) {
      // Salta se, entretanto, já foi ligada.
      const { data: existe } = await sb.from('user_tasks').select('id').eq('notion_page_id', l.notion_page_id).maybeSingle()
      if (!existe) { const page = await obterPagina(token, l.notion_page_id); await criarTarefaDaPagina(sb, userId, page, cacheEtq); n++ }
      await sb.from('notion_sync_import_staging').update({ importado: true }).eq('id', l.id)
    }
    await sb.from('notion_sync_contas').upsert({ user_id: userId, import_revisto: true, notion_user_id: ANDREIA_NOTION_USER_ID }, { onConflict: 'user_id' })
    return { ok: true, importadas: n }
  } catch (e) {
    return { ok: false, importadas: 0, erro: e instanceof Error ? e.message : 'Erro na importação.' }
  }
}
