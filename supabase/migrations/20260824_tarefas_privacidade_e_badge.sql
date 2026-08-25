-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS — repor isolamento de visibilidade + badge de "comentário novo".
-- Cada colaborador vê só as tarefas que criou/atribuiu ou que lhe foram
-- atribuídas; o admin vê todas. Reverte a visibilidade total de toda a equipa
-- introduzida em 20260728_minha_area_equipa.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks for select to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_task_assignee(id));

drop policy if exists uta_select on public.user_task_assignees;
create policy uta_select on public.user_task_assignees for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));

drop policy if exists utc_select on public.user_task_comments;
create policy utc_select on public.user_task_comments for select to authenticated
  using (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));

-- Badge de comentário novo: marca de leitura por tarefa/pessoa.
create table if not exists public.user_task_comment_reads (
  task_id      uuid not null references public.user_tasks(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
grant select, insert, update on public.user_task_comment_reads to authenticated;
grant all on public.user_task_comment_reads to service_role;
alter table public.user_task_comment_reads enable row level security;
drop policy if exists utcr_all on public.user_task_comment_reads;
create policy utcr_all on public.user_task_comment_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nº de tarefas com comentários novos (de outros) para o utilizador atual.
create or replace function public.contar_tarefas_novidades()
returns int language sql stable security definer set search_path to 'public' as $$
  select count(distinct c.task_id)::int
  from public.user_task_comments c
  join public.user_task_assignees a on a.task_id = c.task_id and a.user_id = auth.uid()
  left join public.user_task_comment_reads r on r.task_id = c.task_id and r.user_id = auth.uid()
  where c.autor_id is distinct from auth.uid()
    and c.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz);
$$;
revoke all on function public.contar_tarefas_novidades() from public, anon;
grant execute on function public.contar_tarefas_novidades() to authenticated;
