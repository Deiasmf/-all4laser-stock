-- ───────────────────────────────────────────────────────────────────────────
-- A MINHA ÁREA — Lista de tarefas mais completa (estilo Notion) · PARTE A
--   • Etiquetas (multi, geríveis, com cor) — tags iniciais adotadas do Notion
--   • Subtarefas (checklist dentro da tarefa, com progresso)
--   • Notas/anotações (texto rico simples) na tarefa
--   • Ordem manual da MINHA lista (por destinatário)
--   • Preferência de vista (tabela | lista) por utilizador
-- Sem áreas restritas novas: continua tudo em is_staff() (o próprio nas prefs).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) ETIQUETAS ─────────────────────────────────────────────────────────────
create table if not exists public.task_etiquetas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cor              text not null default '#6366F1',
  notion_tag_name  text,                 -- nome exato da tag no Notion (Parte B)
  ordem            int  not null default 0,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now()
);
-- Um nome de etiqueta (ativa) é único, sem distinção de maiúsculas.
create unique index if not exists task_etiquetas_nome_uq
  on public.task_etiquetas (lower(nome)) where ativo;

create table if not exists public.user_task_etiquetas (
  task_id     uuid not null references public.user_tasks(id) on delete cascade,
  etiqueta_id uuid not null references public.task_etiquetas(id) on delete cascade,
  primary key (task_id, etiqueta_id)
);
create index if not exists user_task_etiquetas_task_idx on public.user_task_etiquetas(task_id);

-- Tags do Notion adotadas como etiquetas iniciais (cores aproximadas às do Notion).
insert into public.task_etiquetas (nome, cor, notion_tag_name, ordem) values
  ('Marketing',        '#16A34A', 'Marketing',        0),
  ('Sales',            '#CA8A04', 'Sales',            1),
  ('Rental',           '#DC2626', 'Rental',           2),
  ('Finance',          '#374151', 'Finance',          3),
  ('Team',             '#374151', 'Team',             4),
  ('Purchases',        '#DB2777', 'Purchases',        5),
  ('Mobile',           '#7C3AED', 'Mobile',           6),
  ('Website',          '#2563EB', 'Website',          7),
  ('Improvement',      '#DB2777', 'Improvement',      8),
  ('Research',         '#6B7280', 'Research',         9),
  ('Branding',         '#374151', 'Branding',        10),
  ('Video production', '#DC2626', 'Video production', 11),
  ('Metrics',          '#92400E', 'Metrics',         12),
  ('Contracts',        '#EA580C', 'Contracts',       13)
on conflict do nothing;

-- ── 2) SUBTAREFAS (checklist) ────────────────────────────────────────────────
create table if not exists public.user_task_subtarefas (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.user_tasks(id) on delete cascade,
  titulo         text not null,
  concluida      boolean not null default false,
  concluida_em   timestamptz,
  ordem          int not null default 0,
  notion_page_id text,                 -- ligação à Sub-task nativa do Notion (Parte B)
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists user_task_subtarefas_task_idx on public.user_task_subtarefas(task_id);

-- ── 3) NOTAS ricas + ORDEM MANUAL por destinatário ──────────────────────────
alter table public.user_tasks          add column if not exists notas text;         -- HTML simples (autosave)
alter table public.user_task_assignees add column if not exists ordem_manual int;   -- ordem da MINHA lista

-- ── 4) PREFERÊNCIA de vista por utilizador ──────────────────────────────────
create table if not exists public.user_task_prefs (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  vista      text not null default 'tabela' check (vista in ('tabela','lista')),
  updated_at timestamptz not null default now()
);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.task_etiquetas       to authenticated;
grant select, insert, delete         on public.user_task_etiquetas   to authenticated;
grant select, insert, update, delete on public.user_task_subtarefas  to authenticated;
grant select, insert, update, delete on public.user_task_prefs       to authenticated;
grant all on public.task_etiquetas, public.user_task_etiquetas,
             public.user_task_subtarefas, public.user_task_prefs to service_role;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Etiquetas: qualquer staff vê e gere (criar/renomear/cor). Segue o modelo do
-- resto da app — só Financeiro e Gestão de Utilizadores são restritos.
alter table public.task_etiquetas enable row level security;
drop policy if exists task_etiquetas_all on public.task_etiquetas;
create policy task_etiquetas_all on public.task_etiquetas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Ligação etiqueta↔tarefa: staff que já vê a tarefa (mesma visibilidade das tarefas).
alter table public.user_task_etiquetas enable row level security;
drop policy if exists user_task_etiquetas_all on public.user_task_etiquetas;
create policy user_task_etiquetas_all on public.user_task_etiquetas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Subtarefas: idem — staff.
alter table public.user_task_subtarefas enable row level security;
drop policy if exists user_task_subtarefas_all on public.user_task_subtarefas;
create policy user_task_subtarefas_all on public.user_task_subtarefas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Preferências: cada um só a sua.
alter table public.user_task_prefs enable row level security;
drop policy if exists user_task_prefs_own on public.user_task_prefs;
create policy user_task_prefs_own on public.user_task_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
