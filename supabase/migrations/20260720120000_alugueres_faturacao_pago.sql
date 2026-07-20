-- Estado de pagamento por mês de faturação de cada aluguer.
-- true  = cliente já pagou (aparece a verde na Lista)
-- false = ainda não pagou (aparece a vermelho na Lista)
alter table public.alugueres_faturacao_mensal
  add column if not exists pago boolean not null default false;
