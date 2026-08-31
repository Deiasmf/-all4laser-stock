-- Notifica (por recado) quem CRIOU a tarefa quando um destinatário a conclui.
-- Não notifica se for a própria pessoa a concluir a sua tarefa (criador = quem
-- conclui). SECURITY DEFINER porque um destinatário não-admin não pode inserir
-- recados diretamente (RLS user_notes_insert exige is_admin()).
create or replace function public.notificar_conclusao_tarefa(p_task uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_criador uuid;
  v_titulo  text;
  v_nome    text;
begin
  select created_by, titulo into v_criador, v_titulo
  from public.user_tasks where id = p_task;

  -- Sem criador, ou o próprio criador a concluir → não notifica.
  if v_criador is null or v_criador = auth.uid() then
    return;
  end if;

  -- Só quem é destinatário da tarefa pode disparar o aviso (evita uso indevido).
  if not exists (
    select 1 from public.user_task_assignees a
    where a.task_id = p_task and a.user_id = auth.uid()
  ) then
    return;
  end if;

  select coalesce(nullif(nome, ''), email, 'Alguém') into v_nome
  from public.profiles where id = auth.uid();

  insert into public.user_notes (to_user, from_user, mensagem, urgente)
  values (
    v_criador, auth.uid(),
    format('%s concluiu a tarefa: %s', coalesce(v_nome, 'Alguém'), coalesce(nullif(v_titulo, ''), '(sem título)')),
    false
  );
end;
$$;

grant execute on function public.notificar_conclusao_tarefa(uuid) to authenticated;
