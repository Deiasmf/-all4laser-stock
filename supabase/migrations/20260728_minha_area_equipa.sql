-- ───────────────────────────────────────────────────────────────────────────
-- A MINHA ÁREA — painel de equipa.
-- Objetivo: toda a equipa (staff) passa a VER as tarefas de todos e o progresso
-- de cada pessoa (acompanhamento de desempenho). Empresa pequena, transparência.
--
-- O que muda:
--   • SELECT de user_tasks / user_task_assignees / user_task_comments passa a
--     ser permitido a qualquer staff (public.is_staff()), não só criador/
--     destinatário/admin.
--   • Novo RPC staff_colaboradores(): devolve id/nome/email/role de todos os
--     colaboradores a qualquer staff — sem alterar a política de profiles
--     (que continua "só o próprio ou admin").
--
-- O que NÃO muda:
--   • Escrita: criar/editar/apagar tarefas e comentar continua reservado a
--     criador / destinatário / admin (as políticas de insert/update/delete
--     ficam intactas).
--   • Recados (user_notes): continuam privados (só remetente e destinatário).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) Colaboradores visíveis a toda a equipa (para mostrar nomes no painel) ──
-- SECURITY DEFINER: corre como owner e ignora a RLS de profiles; o gate é
-- is_staff() — clientes do portal (sem perfil) não recebem linhas.
create or replace function public.staff_colaboradores()
returns table (id uuid, nome text, email text, role text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.nome, p.email, p.role
  from public.profiles p
  where public.is_staff()
  order by p.nome nulls last;
$$;

grant execute on function public.staff_colaboradores() to authenticated;

-- ── 2) Leitura das tarefas alargada a toda a equipa ──────────────────────────
drop policy if exists user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks for select to authenticated
  using (public.is_staff());

drop policy if exists uta_select on public.user_task_assignees;
create policy uta_select on public.user_task_assignees for select to authenticated
  using (public.is_staff());

drop policy if exists utc_select on public.user_task_comments;
create policy utc_select on public.user_task_comments for select to authenticated
  using (public.is_staff());
