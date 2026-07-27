-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS: várias pessoas por tarefa (cada uma com o SEU estado) + comentários.
--   • user_task_assignees: destinatários (N por tarefa), estado por pessoa.
--   • user_task_comments: fio de respostas visível a criador + destinatários.
-- A fonte de verdade do estado passa a ser user_task_assignees (o assigned_to /
-- estado em user_tasks ficam como legado; deixam de ser obrigatórios/usados).
-- Helpers SECURITY DEFINER evitam recursão nas políticas RLS.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.user_task_assignees (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.user_tasks(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  estado       text not null default 'pendente' check (estado in ('pendente','em_curso','concluida')),
  concluida_em timestamptz,
  created_at   timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists idx_uta_task on public.user_task_assignees(task_id);
create index if not exists idx_uta_user on public.user_task_assignees(user_id, estado);

create table if not exists public.user_task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.user_tasks(id) on delete cascade,
  autor_id   uuid references public.profiles(id) on delete set null,
  autor_nome text,
  mensagem   text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_utc_task on public.user_task_comments(task_id, created_at);

-- ── Backfill: cada tarefa atual -> um destinatário com o estado atual ────────
insert into public.user_task_assignees (task_id, user_id, estado, concluida_em)
select id, assigned_to, estado, concluida_em from public.user_tasks
where assigned_to is not null
on conflict (task_id, user_id) do nothing;

-- assigned_to deixa de ser obrigatório (fonte de verdade = user_task_assignees).
alter table public.user_tasks alter column assigned_to drop not null;

-- ── Helpers (SECURITY DEFINER: correm como owner, sem passar pelas políticas) ─
create or replace function public.is_task_creator(p_task uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.user_tasks t where t.id = p_task and t.created_by = auth.uid());
$$;

create or replace function public.is_task_assignee(p_task uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.user_task_assignees a where a.task_id = p_task and a.user_id = auth.uid());
$$;

grant execute on function public.is_task_creator(uuid) to authenticated;
grant execute on function public.is_task_assignee(uuid) to authenticated;

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.user_task_assignees to authenticated;
grant select, insert, update, delete on public.user_task_comments to authenticated;
grant all on public.user_task_assignees, public.user_task_comments to service_role;

-- ── RLS: destinatários ───────────────────────────────────────────────────────
alter table public.user_task_assignees enable row level security;

drop policy if exists uta_select on public.user_task_assignees;
create policy uta_select on public.user_task_assignees for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));

-- Inserir destinatários: admin a qualquer um; o criador só pode incluir-se a si
-- próprio (um não-admin cria tarefas apenas para si).
drop policy if exists uta_insert on public.user_task_assignees;
create policy uta_insert on public.user_task_assignees for insert to authenticated
  with check (public.is_admin() or (public.is_task_creator(task_id) and user_id = auth.uid()));

-- Atualizar estado: o próprio destinatário (o seu) ou admin.
drop policy if exists uta_update on public.user_task_assignees;
create policy uta_update on public.user_task_assignees for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Remover destinatário: admin ou o criador da tarefa.
drop policy if exists uta_delete on public.user_task_assignees;
create policy uta_delete on public.user_task_assignees for delete to authenticated
  using (public.is_admin() or public.is_task_creator(task_id));

-- ── RLS: comentários ─────────────────────────────────────────────────────────
alter table public.user_task_comments enable row level security;

drop policy if exists utc_select on public.user_task_comments;
create policy utc_select on public.user_task_comments for select to authenticated
  using (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));

drop policy if exists utc_insert on public.user_task_comments;
create policy utc_insert on public.user_task_comments for insert to authenticated
  with check (autor_id = auth.uid() and (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id)));

drop policy if exists utc_update on public.user_task_comments;
create policy utc_update on public.user_task_comments for update to authenticated
  using (autor_id = auth.uid() or public.is_admin())
  with check (autor_id = auth.uid() or public.is_admin());

drop policy if exists utc_delete on public.user_task_comments;
create policy utc_delete on public.user_task_comments for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());

-- ── RLS: user_tasks passa a usar os destinatários ───────────────────────────
drop policy if exists user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks for select to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_task_assignee(id));

-- Criar tarefa: qualquer autenticado (created_by = próprio). Quem pode ser
-- destinatário é decidido em uta_insert (não-admin só se inclui a si).
drop policy if exists user_tasks_insert on public.user_tasks;
create policy user_tasks_insert on public.user_tasks for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists user_tasks_update on public.user_tasks;
create policy user_tasks_update on public.user_tasks for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists user_tasks_delete on public.user_tasks;
create policy user_tasks_delete on public.user_tasks for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());
