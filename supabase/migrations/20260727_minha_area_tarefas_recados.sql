-- ───────────────────────────────────────────────────────────────────────────
-- A MINHA ÁREA — tarefas pendentes e recados por colaborador.
-- Área única por colaborador, visível APENAS pelo próprio. A gerência (admin)
-- atribui tarefas/recados a qualquer colaborador.
--
-- RLS (crítico):
--   • Colaborador vê só o que é seu (assigned_to / to_user = auth.uid()).
--   • TAREFAS: admin vê e acompanha TODAS (follow-up).
--   • RECADOS: admin vê só os que ele próprio enviou (from_user = auth.uid());
--     mais pessoais — ninguém vê os recados de outros pares.
--   • Ninguém vê a área de outro colaborador.
-- ───────────────────────────────────────────────────────────────────────────

-- Trigger genérico de updated_at (idempotente).
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 1) Tarefas ───────────────────────────────────────────────────────────────
create table if not exists public.user_tasks (
  id            uuid primary key default gen_random_uuid(),
  assigned_to   uuid not null references public.profiles(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  titulo        text not null,
  descricao     text,
  prioridade    text not null default 'normal' check (prioridade in ('baixa','normal','alta')),
  data_limite   date,
  estado        text not null default 'pendente' check (estado in ('pendente','em_curso','concluida')),
  concluida_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_user_tasks_assigned on public.user_tasks(assigned_to, estado);
create index if not exists idx_user_tasks_created_by on public.user_tasks(created_by);

drop trigger if exists trg_user_tasks_touch on public.user_tasks;
create trigger trg_user_tasks_touch before update on public.user_tasks
  for each row execute function public.touch_updated_at();

-- ── 2) Recados ───────────────────────────────────────────────────────────────
create table if not exists public.user_notes (
  id          uuid primary key default gen_random_uuid(),
  to_user     uuid not null references public.profiles(id) on delete cascade,
  from_user   uuid references public.profiles(id) on delete set null,
  mensagem    text not null,
  urgente     boolean not null default false,
  lida        boolean not null default false,
  lida_em     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_user_notes_to on public.user_notes(to_user, lida);
create index if not exists idx_user_notes_from on public.user_notes(from_user);

drop trigger if exists trg_user_notes_touch on public.user_notes;
create trigger trg_user_notes_touch before update on public.user_notes
  for each row execute function public.touch_updated_at();

-- ── 3) Preferências de notificação (opt-in, desligado por default) ───────────
create table if not exists public.user_notification_prefs (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  notif_recado_urgente  boolean not null default false,   -- avisar por email de recados urgentes
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_user_notif_prefs_touch on public.user_notification_prefs;
create trigger trg_user_notif_prefs_touch before update on public.user_notification_prefs
  for each row execute function public.touch_updated_at();

-- ── 4) Grants (a RLS é a barreira real; sem grant dá "permission denied") ─────
grant select, insert, update, delete on public.user_tasks to authenticated;
grant select, insert, update, delete on public.user_notes to authenticated;
grant select, insert, update, delete on public.user_notification_prefs to authenticated;
grant all on public.user_tasks, public.user_notes, public.user_notification_prefs to service_role;

-- ── 5) RLS ───────────────────────────────────────────────────────────────────
alter table public.user_tasks enable row level security;
alter table public.user_notes enable row level security;
alter table public.user_notification_prefs enable row level security;

-- TAREFAS: colaborador vê as suas; admin vê todas (acompanhamento).
drop policy if exists user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());

-- Inserir: admin atribui a qualquer um; um colaborador pode criar tarefas para
-- si próprio. Em qualquer caso, created_by tem de ser o próprio.
drop policy if exists user_tasks_insert on public.user_tasks;
create policy user_tasks_insert on public.user_tasks
  for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or assigned_to = auth.uid()));

-- Atualizar: o dono (para mudar estado/concluir) ou admin. Um não-admin não
-- pode reatribuir a tarefa para outra pessoa (assigned_to continua a ser ele).
drop policy if exists user_tasks_update on public.user_tasks;
create policy user_tasks_update on public.user_tasks
  for update to authenticated
  using (assigned_to = auth.uid() or public.is_admin())
  with check (public.is_admin() or assigned_to = auth.uid());

-- Apagar: só admin.
drop policy if exists user_tasks_delete on public.user_tasks;
create policy user_tasks_delete on public.user_tasks
  for delete to authenticated
  using (public.is_admin());

-- RECADOS: o destinatário vê os seus; o remetente vê os que enviou.
drop policy if exists user_notes_select on public.user_notes;
create policy user_notes_select on public.user_notes
  for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());

-- Inserir: só admin envia recados; from_user tem de ser o próprio.
drop policy if exists user_notes_insert on public.user_notes;
create policy user_notes_insert on public.user_notes
  for insert to authenticated
  with check (public.is_admin() and from_user = auth.uid());

-- Atualizar: o destinatário (marca como lido). O remetente não edita depois.
drop policy if exists user_notes_update on public.user_notes;
create policy user_notes_update on public.user_notes
  for update to authenticated
  using (to_user = auth.uid())
  with check (to_user = auth.uid());

-- Apagar: quem enviou ou admin.
drop policy if exists user_notes_delete on public.user_notes;
create policy user_notes_delete on public.user_notes
  for delete to authenticated
  using (from_user = auth.uid() or public.is_admin());

-- PREFERÊNCIAS: cada um gere as suas; admin pode ler (para saber se notifica).
drop policy if exists user_notif_prefs_select on public.user_notification_prefs;
create policy user_notif_prefs_select on public.user_notification_prefs
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_notif_prefs_insert on public.user_notification_prefs;
create policy user_notif_prefs_insert on public.user_notification_prefs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_notif_prefs_update on public.user_notification_prefs;
create policy user_notif_prefs_update on public.user_notification_prefs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
