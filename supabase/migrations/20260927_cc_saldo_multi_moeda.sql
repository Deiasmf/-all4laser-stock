-- ───────────────────────────────────────────────────────────────────────────
-- CONTAS CORRENTES — saldo multi-moeda
-- Uma conta pode ter movimentos em várias moedas (ex.: consignação em AED +
-- plano de prestações em EUR). O saldo na moeda da conta deve contar SÓ os
-- movimentos nessa moeda; o saldo_eur converte tudo (via valor_eur) e é o total
-- fiável.
-- ───────────────────────────────────────────────────────────────────────────

create or replace view public.v_cc_saldo_conta with (security_invoker = on) as
select
  c.id   as conta_id, c.nome, c.moeda,
  coalesce(sum(case when m.moeda = c.moeda then
    (case m.tipo when 'esperado' then m.valor when 'ajuste' then m.valor
                 when 'recebido' then -m.valor when 'nota_credito' then -m.valor end) else 0 end), 0) as saldo_moeda,
  coalesce(sum(case m.tipo when 'esperado' then m.valor_eur when 'ajuste' then m.valor_eur
                           when 'recebido' then -m.valor_eur when 'nota_credito' then -m.valor_eur end), 0) as saldo_eur,
  coalesce(sum(case when m.tipo in ('esperado','ajuste') then m.valor_eur else 0 end), 0) as total_esperado_eur,
  coalesce(sum(case when m.tipo in ('recebido','nota_credito') then m.valor_eur else 0 end), 0) as total_recebido_eur,
  (select count(*) from public.cc_consignacoes cs where cs.conta_id = c.id and cs.estado = 'em_stock') as maquinas_em_stock,
  (select min(pr.data_vencimento) from public.cc_prestacoes pr
     join public.cc_planos_pagamento pl on pl.id = pr.plano_id
    where pl.conta_id = c.id and pr.estado in ('pendente','atrasada','parcial')) as proximo_vencimento
from public.cc_contas c
left join public.cc_movimentos m on m.conta_id = c.id
group by c.id, c.nome, c.moeda;
