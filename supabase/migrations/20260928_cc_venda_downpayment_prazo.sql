-- ───────────────────────────────────────────────────────────────────────────
-- CONTAS CORRENTES — plano de pagamento por venda: downpayment + prazo (meses)
-- "meses pagos" deriva dos movimentos recebidos ligados à venda (no frontend);
-- "meses em falta" = prazo_meses − meses_pagos.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cc_vendas add column if not exists downpayment numeric(14,2) not null default 0;
comment on column public.cc_vendas.downpayment is 'Entrada/adiantamento inicial (na moeda_venda). "teve downpayment" = > 0.';

alter table public.cc_vendas add column if not exists prazo_meses integer;
comment on column public.cc_vendas.prazo_meses is 'Nº total de meses acordado para pagar. meses_em_falta = prazo_meses - meses_pagos.';
