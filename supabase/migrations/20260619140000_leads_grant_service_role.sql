-- Correção: o endpoint público de leads (/api/leads/website e /api/leads/meta)
-- corre com a SERVICE ROLE, mas a migração original (002_leads.sql) só concedeu
-- privilégios ao role 'authenticated'. Sem isto, a inserção via service role
-- falha com "permission denied for table leads".

grant select, insert, update, delete on public.leads to service_role;
