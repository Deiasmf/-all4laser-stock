-- As tabelas novas da Fichas v2 tinham RLS ativa mas faltavam os GRANT base à
-- role authenticated (a RLS filtra as linhas; o GRANT dá acesso à tabela ao
-- PostgREST). Sem isto: "permission denied for table ...".
grant select, insert, update, delete on public.equipment_model_descriptions to authenticated;
grant select, insert, update, delete on public.acessorio_catalogo to authenticated;
grant select on public.ficha_traducoes to authenticated;
