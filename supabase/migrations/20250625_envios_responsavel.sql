-- Funcionário responsável por um envio de encomenda (quem está a tratar).
alter table public.envios_pecas add column if not exists responsavel_id uuid references public.profiles(id);
alter table public.envios_pecas add column if not exists responsavel_nome text;
create index if not exists idx_envios_pecas_responsavel on public.envios_pecas(responsavel_id);
