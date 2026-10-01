-- Equipamentos de um plano de pagamento (ex.: bundle "15 máquinas" da Laserix).
-- Um plano pode cobrir várias máquinas enviadas; estas ficam listadas aqui (com
-- a data de envio) e são EXCLUÍDAS das Consignações/Processos (por nº de série)
-- para não haver dupla contagem — a máquina é paga pelo plano, não como
-- consignação individual. Dados financeiros do plano → RLS has_financeiro_access.

create table if not exists public.cc_plano_equipamentos (
  id              uuid primary key default gen_random_uuid(),
  plano_id        uuid not null references public.cc_planos_pagamento(id) on delete cascade,
  equipamento_id  uuid references public.equipamentos(id),
  numero_serie    text,
  modelo          text,
  data_envio      date,
  notas           text,
  created_at      timestamptz not null default now(),
  criado_por      uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists cc_plano_equipamentos_plano_idx on public.cc_plano_equipamentos(plano_id);
create index if not exists cc_plano_equipamentos_serie_idx on public.cc_plano_equipamentos(numero_serie);

alter table public.cc_plano_equipamentos enable row level security;
drop policy if exists cc_plano_equipamentos_financeiro on public.cc_plano_equipamentos;
create policy cc_plano_equipamentos_financeiro on public.cc_plano_equipamentos
  for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access());

grant select, insert, update, delete on public.cc_plano_equipamentos to authenticated;
grant all on public.cc_plano_equipamentos to service_role;
