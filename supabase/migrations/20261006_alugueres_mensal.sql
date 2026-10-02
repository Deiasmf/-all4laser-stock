-- Aluguer mensal recorrente: 1 linha que a lista projeta em todos os meses (do
-- início até à data de fim prevista, ou +12 meses se for aberto). Evita criar
-- uma linha por mês à mão. data_fim_prevista alimenta o lembrete de fim (cron).
alter table public.alugueres
  add column if not exists mensal boolean not null default false,
  add column if not exists data_fim_prevista date,
  add column if not exists lembrete_fim_enviado_em timestamptz;
create index if not exists alugueres_mensal_idx on public.alugueres(mensal) where mensal;
