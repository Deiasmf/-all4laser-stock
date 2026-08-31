-- FICHAS DE PRODUTO v2 — catálogo gerível de acessórios (para o dropdown).
create table if not exists public.acessorio_catalogo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists acessorio_catalogo_nome_uidx
  on public.acessorio_catalogo (lower(btrim(nome)));

alter table public.acessorio_catalogo enable row level security;
drop policy if exists acessorio_catalogo_rw on public.acessorio_catalogo;
create policy acessorio_catalogo_rw on public.acessorio_catalogo
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Semear com os acessórios já usados nos equipamentos (distintos, normalizados).
insert into public.acessorio_catalogo (nome)
select distinct on (lower(btrim(descricao))) btrim(descricao)
from public.equipamento_acessorios
where btrim(coalesce(descricao, '')) <> ''
order by lower(btrim(descricao))
on conflict do nothing;
