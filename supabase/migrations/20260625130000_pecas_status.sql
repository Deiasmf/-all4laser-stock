-- Campo Status nas peças (Stock / Em Reparação / Avariado / ...).
-- Texto livre, como o status dos equipamentos. Null = sem estado definido.
alter table public.pecas add column if not exists status text;

create index if not exists idx_pecas_status on public.pecas(status);
