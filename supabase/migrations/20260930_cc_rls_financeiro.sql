-- Aperta o acesso aos dados financeiros da parceria (Contas Correntes cc_*):
-- custos, margens, valor_devido e pagamentos são dos dados mais sensíveis da
-- empresa. Passa de is_staff() (todo o staff) para has_financeiro_access()
-- (admin/financeiro). O dossiê documental (fotos/FOs/incidências não-valor) fica
-- em is_staff nas suas próprias tabelas (criadas nas fases seguintes).
-- O portal do cliente lê via funções/vistas SECURITY DEFINER (não é afetado).

do $$
declare t text;
begin
  foreach t in array array[
    'cc_contas','cc_consignacoes','cc_vendas','cc_movimentos',
    'cc_planos_pagamento','cc_prestacoes','cc_reconciliacoes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_interno', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())',
      t || '_financeiro', t
    );
  end loop;
end $$;
