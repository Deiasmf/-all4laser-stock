-- ───────────────────────────────────────────────────────────────────────────
-- A MINHA ÁREA — Sincronização bidirecional com o Notion · PARTE B
--   • Estado "Adiada / noutra altura" (↔ Notion "Another time")
--   • Arquivar (ortogonal ao estado, ↔ Notion "Archived") + restaurar
--   • Ligação de cada tarefa ao Notion (page id, last_edited, last_synced)
--   • Conta de sync por utilizador (token fica em env var, NÃO na BD)
--   • Log de conflitos, log de execuções, staging da importação inicial
-- Âmbito: só as MINHAS tarefas (Assignee = eu no Notion).
-- ───────────────────────────────────────────────────────────────────────────

-- Estado novo (não conta como concluída; é reversível).
insert into public.task_estados (slug, label, cor, bg, ordem, is_concluido) values
  ('adiada', 'Adiada / noutra altura', '#6B7280', '#F3F4F6', 4, false)
on conflict (slug) do nothing;

-- Arquivar: por destinatário (coerente com o estado, que é por destinatário).
alter table public.user_task_assignees add column if not exists arquivada_em timestamptz;

-- Ligação ao Notion (na tarefa partilhada).
alter table public.user_tasks
  add column if not exists notion_page_id text,
  add column if not exists notion_last_edited_at timestamptz,
  add column if not exists last_synced_at timestamptz;
create unique index if not exists user_tasks_notion_page_uq
  on public.user_tasks (notion_page_id) where notion_page_id is not null;

-- Conta de sync por utilizador (preparado p/ multi-utilizador; agora só Andreia).
-- O TOKEN do Notion vive numa env var no Vercel (NOTION_TOKEN), nunca aqui.
create table if not exists public.notion_sync_contas (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  notion_user_id         text,        -- id do Assignee no Notion (filtro do âmbito)
  ativo                  boolean not null default true,
  import_revisto         boolean not null default false,  -- já passou a revisão inicial?
  ultima_sync_at         timestamptz,
  ultima_sync_ok         boolean,
  ultimo_erro            text,
  falhas_seguidas        int not null default 0,
  tarefas_sincronizadas  int not null default 0,
  created_at             timestamptz not null default now()
  -- futuro: notion_token_encriptado text  (token por utilizador)
);

-- Log de conflitos (editado nos dois lados no mesmo intervalo). Nunca perder nada.
create table if not exists public.notion_sync_conflitos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade,
  task_id        uuid references public.user_tasks(id) on delete set null,
  notion_page_id text,
  campo          text not null,          -- 'titulo' | 'estado' | 'prioridade' | 'data_limite' | 'descricao'
  valor_app      text,
  valor_notion   text,
  vencedor       text not null,          -- 'app' | 'notion'
  resolvido      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists notion_sync_conflitos_user_idx on public.notion_sync_conflitos(user_id, resolvido);

-- Histórico de execuções (para o painel + alerta ao falhar 2x seguidas).
create table if not exists public.notion_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  origem          text,                  -- 'cron' | 'manual'
  iniciado_at     timestamptz not null default now(),
  terminado_at    timestamptz,
  ok              boolean,
  criadas_app     int default 0,
  atualizadas_app int default 0,
  criadas_notion  int default 0,
  atualizadas_notion int default 0,
  conflitos       int default 0,
  erro            text
);
create index if not exists notion_sync_runs_user_idx on public.notion_sync_runs(user_id, iniciado_at desc);

-- Staging da importação inicial (revisão com checkbox antes de entrar na app).
create table if not exists public.notion_sync_import_staging (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade,
  notion_page_id text not null,
  titulo         text,
  estado_notion  text,
  tags           text[],
  incluir        boolean not null default true,
  importado      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, notion_page_id)
);

-- Grants
grant select, insert, update, delete on
  public.notion_sync_contas, public.notion_sync_conflitos,
  public.notion_sync_runs, public.notion_sync_import_staging to authenticated;
grant all on
  public.notion_sync_contas, public.notion_sync_conflitos,
  public.notion_sync_runs, public.notion_sync_import_staging to service_role;

-- RLS: cada um vê/gere a sua sync; o admin vê tudo. As escritas do cron usam a
-- service role (ignora RLS). O painel lê as linhas do próprio utilizador.
alter table public.notion_sync_contas enable row level security;
drop policy if exists notion_sync_contas_own on public.notion_sync_contas;
create policy notion_sync_contas_own on public.notion_sync_contas for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

alter table public.notion_sync_conflitos enable row level security;
drop policy if exists notion_sync_conflitos_own on public.notion_sync_conflitos;
create policy notion_sync_conflitos_own on public.notion_sync_conflitos for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

alter table public.notion_sync_runs enable row level security;
drop policy if exists notion_sync_runs_own on public.notion_sync_runs;
create policy notion_sync_runs_own on public.notion_sync_runs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

alter table public.notion_sync_import_staging enable row level security;
drop policy if exists notion_sync_import_staging_own on public.notion_sync_import_staging;
create policy notion_sync_import_staging_own on public.notion_sync_import_staging for all to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
