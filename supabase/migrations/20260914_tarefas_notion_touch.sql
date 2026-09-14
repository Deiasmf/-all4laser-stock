-- ───────────────────────────────────────────────────────────────────────────
-- Sync Notion: manter user_tasks.updated_at como relógio fiável de "última
-- edição na app". O estado vive no destinatário e as etiquetas/subtarefas em
-- tabelas-filhas — mudá-las tem de "tocar" a tarefa, senão a deteção de
-- alterações (updated_at vs last_synced_at) não vê essas mudanças.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.touch_user_task()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare tid uuid;
begin
  tid := coalesce(new.task_id, old.task_id);
  if tid is not null then
    update public.user_tasks set updated_at = now() where id = tid;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_task_assignee on public.user_task_assignees;
create trigger trg_touch_task_assignee
  after insert or update or delete on public.user_task_assignees
  for each row execute function public.touch_user_task();

drop trigger if exists trg_touch_task_etiqueta on public.user_task_etiquetas;
create trigger trg_touch_task_etiqueta
  after insert or delete on public.user_task_etiquetas
  for each row execute function public.touch_user_task();

drop trigger if exists trg_touch_task_subtarefa on public.user_task_subtarefas;
create trigger trg_touch_task_subtarefa
  after insert or update or delete on public.user_task_subtarefas
  for each row execute function public.touch_user_task();
