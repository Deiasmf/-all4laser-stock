-- ───────────────────────────────────────────────────────────────────────────
-- RESTAURAR GRANTS DA service_role
-- Uma migração antiga de endurecimento revogou à service_role os privilégios de
-- dados (SELECT/INSERT/UPDATE/DELETE), deixando-a só com REFERENCES/TRIGGER/TRUNCATE.
-- Como a service_role é uma chave SÓ DE SERVIDOR (nunca vai ao browser) e é suposto
-- ter acesso total ignorando RLS, sem estes grants TODAS as rotas de servidor
-- falham com "permission denied" (ex.: 42501):
--   • /api/envios-pecas/enviar-documentos (ler envios_pecas)
--   • /api/reservas-portal/validar (ler profiles, atualizar reservas_portal) + SMS
--
-- Esta migração devolve os privilégios e ajusta os default privileges para que
-- tabelas futuras herdem o acesso automaticamente (evita repetir o problema).
-- ───────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                  on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables    to service_role;
alter default privileges in schema public
  grant usage, select                  on sequences to service_role;
