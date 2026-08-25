-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS — estados numa tabela editável (nome, cor, ordem).
-- Objetivo: o admin pode acrescentar/renomear estados e cores sem código.
-- Acrescenta o estado "Aguarda informação" e, por destinatário, um campo
-- opcional "a aguardar o quê/de quem".
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.task_estados (
  slug         text primary key,
  label        text not null,
  cor          text not null default '#374151',
  bg           text not null default '#E5E7EB',
  ordem        int  not null default 0,
  is_concluido boolean not null default false,   -- conta como "feito"
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.task_estados (slug, label, cor, bg, ordem, is_concluido) values
  ('pendente',     'Pendente',           '#374151', '#E5E7EB', 0, false),
  ('em_curso',     'Em andamento',       '#92400E', '#FEF3C7', 1, false),
  ('aguarda_info', 'Aguarda informação', '#3730A3', '#E0E7FF', 2, false),
  ('concluida',    'Concluída',          '#065F46', '#D1FAE5', 3, true)
on conflict (slug) do nothing;

grant select on public.task_estados to authenticated;
grant all on public.task_estados to service_role;

alter table public.task_estados enable row level security;
drop policy if exists task_estados_select on public.task_estados;
create policy task_estados_select on public.task_estados for select to authenticated
  using (public.is_staff());
drop policy if exists task_estados_admin on public.task_estados;
create policy task_estados_admin on public.task_estados for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- estado deixa de ser check-constraint e passa a FK à tabela de estados.
alter table public.user_task_assignees
  drop constraint if exists user_task_assignees_estado_check;
alter table public.user_task_assignees
  add constraint user_task_assignees_estado_fk
  foreign key (estado) references public.task_estados(slug) on update cascade;

-- "a aguardar o quê/de quem" (por destinatário, junto do estado aguarda_info).
alter table public.user_task_assignees
  add column if not exists aguarda_o_que text;
