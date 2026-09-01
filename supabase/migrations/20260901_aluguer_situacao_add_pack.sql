-- Campo "pack" na ficha da Situação atual: junta laser + Zimmer (mesmo nome = mesmo pack).
-- O preço mensal do pack é partilhado pelos equipamentos do mesmo pack.
alter table public.aluguer_situacao add column if not exists pack text;
create index if not exists aluguer_situacao_pack_idx on public.aluguer_situacao (pack) where pack is not null;
