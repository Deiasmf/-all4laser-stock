-- A Minha Área: permitir editar tarefas e recados.
-- Tarefas: além do criador e admin, os destinatários também podem editar os
-- campos da tarefa (título/descrição/prioridade/prazo).
drop policy if exists user_tasks_update on public.user_tasks;
create policy user_tasks_update on public.user_tasks for update to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.is_task_assignee(id))
  with check (created_by = auth.uid() or public.is_admin() or public.is_task_assignee(id));

-- Recados: quem enviou pode editar a mensagem (além de o destinatário marcar lido).
drop policy if exists user_notes_update on public.user_notes;
create policy user_notes_update on public.user_notes for update to authenticated
  using (to_user = auth.uid() or from_user = auth.uid())
  with check (to_user = auth.uid() or from_user = auth.uid());
