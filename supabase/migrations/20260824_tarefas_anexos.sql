-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS — anexos (ficheiros/fotos) na tarefa e nos comentários.
-- Bucket privado (URLs sempre assinadas). A RLS do Storage impede o acesso pelo
-- URL direto a quem não é participante da tarefa.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.user_task_attachments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.user_tasks(id) on delete cascade,
  comment_id uuid references public.user_task_comments(id) on delete cascade,
  caminho    text not null,          -- caminho no bucket (task_id/...)
  nome       text not null,
  mime       text,
  tamanho    bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_uta_att_task on public.user_task_attachments(task_id);
create index if not exists idx_uta_att_comment on public.user_task_attachments(comment_id);

grant select, insert, delete on public.user_task_attachments to authenticated;
grant all on public.user_task_attachments to service_role;
alter table public.user_task_attachments enable row level security;

drop policy if exists uta_att_select on public.user_task_attachments;
create policy uta_att_select on public.user_task_attachments for select to authenticated
  using (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id));

drop policy if exists uta_att_insert on public.user_task_attachments;
create policy uta_att_insert on public.user_task_attachments for insert to authenticated
  with check (created_by = auth.uid()
    and (public.is_admin() or public.is_task_creator(task_id) or public.is_task_assignee(task_id)));

drop policy if exists uta_att_delete on public.user_task_attachments;
create policy uta_att_delete on public.user_task_attachments for delete to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_task_creator(task_id));

-- Bucket privado — URLs sempre assinadas.
insert into storage.buckets (id, name, public)
  values ('tarefas-anexos', 'tarefas-anexos', false)
  on conflict (id) do nothing;

-- Storage RLS: a 1ª pasta do caminho é o task_id; só participantes da tarefa
-- (criador/destinatário) ou admin acedem — mesmo pelo URL assinado.
drop policy if exists tarefas_anexos_select on storage.objects;
create policy tarefas_anexos_select on storage.objects for select to authenticated
  using (bucket_id = 'tarefas-anexos' and (public.is_admin()
    or public.is_task_creator((storage.foldername(name))[1]::uuid)
    or public.is_task_assignee((storage.foldername(name))[1]::uuid)));

drop policy if exists tarefas_anexos_insert on storage.objects;
create policy tarefas_anexos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tarefas-anexos' and (public.is_admin()
    or public.is_task_creator((storage.foldername(name))[1]::uuid)
    or public.is_task_assignee((storage.foldername(name))[1]::uuid)));

drop policy if exists tarefas_anexos_delete on storage.objects;
create policy tarefas_anexos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tarefas-anexos' and (public.is_admin()
    or public.is_task_creator((storage.foldername(name))[1]::uuid)
    or public.is_task_assignee((storage.foldername(name))[1]::uuid)));
