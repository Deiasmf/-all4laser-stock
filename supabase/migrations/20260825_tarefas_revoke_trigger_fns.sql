-- ───────────────────────────────────────────────────────────────────────────
-- TAREFAS — trancar permissões das funções.
-- As funções de trigger correm com SECURITY DEFINER via triggers; não devem ser
-- chamáveis por RPC. O badge de novidades só para utilizadores autenticados.
-- ───────────────────────────────────────────────────────────────────────────

-- Funções de trigger não devem ser chamáveis por RPC (correm como triggers).
revoke all on function public.task_ator_nome() from public, anon, authenticated;
revoke all on function public.log_user_task_criacao() from public, anon, authenticated;
revoke all on function public.log_user_task_campos() from public, anon, authenticated;
revoke all on function public.log_user_task_assignee() from public, anon, authenticated;

-- Badge: só utilizadores autenticados (nunca anon).
revoke all on function public.contar_tarefas_novidades() from public, anon;
grant execute on function public.contar_tarefas_novidades() to authenticated;
