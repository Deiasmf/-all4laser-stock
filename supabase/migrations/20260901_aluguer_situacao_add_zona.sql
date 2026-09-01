-- Campo "zona" na ficha da Situação atual: agrupa os nacionais por zona
-- (Lisboa, Norte, Algarve, Mensais…). Os internacionais agrupam pelo país do cliente.
alter table public.aluguer_situacao add column if not exists zona text;
create index if not exists aluguer_situacao_zona_idx on public.aluguer_situacao (zona) where zona is not null;
