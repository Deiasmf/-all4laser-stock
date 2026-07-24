-- Endurecimento: o Postgres concede EXECUTE a PUBLIC por omissão. Retira o
-- acesso do anon/public à helper has_financeiro_access() (só authenticated
-- precisa — para a RLS e para o auth context). admin_set_role já tinha
-- revoke from public na migração dos roles.
revoke execute on function public.has_financeiro_access() from public, anon;
grant execute on function public.has_financeiro_access() to authenticated;
