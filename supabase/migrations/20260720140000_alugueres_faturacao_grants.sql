-- A tabela alugueres_faturacao_mensal tinha as políticas RLS corretas mas
-- faltavam-lhe os GRANT de tabela ao role "authenticated". Sem eles, qualquer
-- utilizador autenticado (inclusive admin) recebia
-- "permission denied for table alugueres_faturacao_mensal" ao gravar
-- (Valor a Faturar, Pago, Validado ou Fatura). A autorização fica garantida
-- pelas políticas RLS já existentes; o GRANT apenas permite a operação.
grant select, insert, update, delete
  on public.alugueres_faturacao_mensal
  to authenticated;
