-- ───────────────────────────────────────────────────────────────────────────
-- CONTAS CORRENTES — view de alertas (Fase 3)
-- Calcula em SQL os alertas da spec. security_invoker=on → respeita a RLS das
-- tabelas base (staff vê tudo; o portal não lê esta view). O job diário lê-a e
-- envia email interno; o back-office mostra-a ao vivo.
-- ───────────────────────────────────────────────────────────────────────────

create or replace view public.v_cc_alertas with (security_invoker = on) as
-- 1. Prestação atrasada: vencida há mais de 3 dias, ainda por pagar.
select
  c.id as conta_id, c.nome as conta_nome,
  'prestacao_atrasada'::text as tipo, 'alta'::text as severidade,
  ('Prestação ' || pr.numero || ' vencida em ' || to_char(pr.data_vencimento, 'DD/MM/YYYY')) as mensagem,
  pr.valor, pr.moeda, pr.data_vencimento as data_ref
from public.cc_prestacoes pr
join public.cc_planos_pagamento pl on pl.id = pr.plano_id
join public.cc_contas c on c.id = pl.conta_id
where pr.estado in ('pendente', 'atrasada')
  and pr.data_vencimento < current_date - 3

union all
-- 2. Venda por receber: confirmada há mais de prazo_pagamento_dias sem recebido.
select
  c.id, c.nome, 'venda_por_receber', 'alta',
  ('Venda de ' || coalesce(cs.numero_serie, 'equipamento') || ' confirmada em ' || to_char(v.data_venda, 'DD/MM/YYYY') || ' por receber'),
  v.valor_devido, v.moeda_venda, v.data_venda
from public.cc_vendas v
join public.cc_consignacoes cs on cs.id = v.consignacao_id
join public.cc_contas c on c.id = cs.conta_id
where v.estado = 'confirmada'
  and v.data_venda < current_date - coalesce(c.prazo_pagamento_dias, 30)
  and not exists (
    select 1 from public.cc_movimentos m
    where m.origem_tipo = 'venda' and m.origem_id = v.id and m.tipo = 'recebido'
  )

union all
-- 3. Máquina parada no parceiro: em stock há mais de 120 dias.
select
  c.id, c.nome, 'maquina_parada', 'media',
  ('Máquina ' || coalesce(cs.numero_serie, 'sem SN') || ' em stock há mais de 120 dias'),
  cs.custo_declarado, cs.moeda_custo, cs.data_envio
from public.cc_consignacoes cs
join public.cc_contas c on c.id = cs.conta_id
where cs.estado = 'em_stock'
  and cs.data_envio is not null
  and cs.data_envio < current_date - 120

union all
-- 4. Reconciliação em atraso: sem importação há mais de 45 dias (só consignação).
select
  c.id, c.nome, 'reconciliacao_atraso', 'media',
  (case when r.ultima is null then 'Sem nenhuma reconciliação importada'
        else 'Última reconciliação há mais de 45 dias (' || to_char(r.ultima, 'DD/MM/YYYY') || ')' end),
  null::numeric, c.moeda, r.ultima::date
from public.cc_contas c
left join lateral (
  select max(data_import) as ultima from public.cc_reconciliacoes rc where rc.conta_id = c.id
) r on true
where c.tipo in ('consignacao', 'mista') and c.ativa
  and (r.ultima is null or r.ultima < current_date - 45)

union all
-- 5. Saldo acima do limite de exposição.
select
  c.id, c.nome, 'saldo_acima_limite', 'alta',
  ('Saldo em aberto acima do limite de exposição (' || to_char(c.limite_exposicao, 'FM999G999G990') || ' ' || c.moeda || ')'),
  s.saldo_moeda, c.moeda, null::date
from public.cc_contas c
join public.v_cc_saldo_conta s on s.conta_id = c.id
where c.limite_exposicao is not null and s.saldo_moeda > c.limite_exposicao;

revoke all on public.v_cc_alertas from anon, authenticated;
grant select on public.v_cc_alertas to authenticated;
