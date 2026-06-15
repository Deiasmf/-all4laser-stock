-- Módulo Alugueres — Ponto 2: Catálogo de modelos, Packs e Disponibilidade
-- A disponibilidade é calculada DENTRO da app: frota (equipamentos) menos
-- reservas que se sobrepõem ao intervalo pedido.

-- CATÁLOGO de modelos de aluguer (canónicos)
create table if not exists public.modelos_aluguer (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,        -- nome canónico (ex.: 'GentleMax Pro Plus')
  marca         text not null,
  requer_zimmer boolean not null default false, -- pack com Zimmer Cryo 6
  alugavel      boolean not null default true,  -- aparece como opção de aluguer (false = equipamento de pack, ex. Zimmer)
  match_ilike   text[] not null default '{}',   -- padrões ILIKE p/ contar a frota em equipamentos
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz default now()
);

-- RESERVAS / ocupação (fonte da disponibilidade)
create table if not exists public.reservas (
  id             uuid primary key default gen_random_uuid(),
  modelo_id      uuid references public.modelos_aluguer(id),
  modelo_nome    text not null,
  cliente_id     uuid references public.clientes(id),
  cliente_nome   text,
  modalidade     text check (modalidade in ('diario','2dias','semanal','mensal')),
  data_inicio    date not null,
  data_fim       date not null,
  com_zimmer     boolean not null default false,  -- ocupa 1 Zimmer Cryo 6
  estado         text not null default 'pendente_validacao'
                   check (estado in ('pendente_validacao','confirmada','cancelada','concluida')),
  nota           text,
  criado_por     uuid,
  criado_por_nome text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_reservas_datas  on public.reservas(data_inicio, data_fim);
create index if not exists idx_reservas_modelo on public.reservas(modelo_id);
create index if not exists idx_reservas_estado on public.reservas(estado);

-- RLS
alter table public.modelos_aluguer enable row level security;
alter table public.reservas enable row level security;

drop policy if exists modelos_aluguer_select on public.modelos_aluguer;
drop policy if exists modelos_aluguer_write  on public.modelos_aluguer;
create policy modelos_aluguer_select on public.modelos_aluguer for select to authenticated using (true);
create policy modelos_aluguer_write  on public.modelos_aluguer for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists reservas_select on public.reservas;
drop policy if exists reservas_insert on public.reservas;
drop policy if exists reservas_update on public.reservas;
drop policy if exists reservas_delete on public.reservas;
create policy reservas_select on public.reservas for select to authenticated using (true);
create policy reservas_insert on public.reservas for insert to authenticated with check (true);
create policy reservas_update on public.reservas for update to authenticated using (true) with check (true);
create policy reservas_delete on public.reservas for delete to authenticated using (is_admin());

grant select, insert, update, delete on public.modelos_aluguer to authenticated;
grant select, insert, update, delete on public.reservas to authenticated;

-- VIEW: frota (nº de unidades) por modelo do catálogo, a partir dos equipamentos
create or replace view public.v_frota_modelos as
select
  m.id, m.nome, m.marca, m.requer_zimmer, m.alugavel, m.ordem,
  (select count(*) from public.equipamentos e
     where m.match_ilike <> '{}' and e.modelo ilike any (m.match_ilike)) as frota
from public.modelos_aluguer m
where m.ativo;

alter view public.v_frota_modelos set (security_invoker = on);
grant select on public.v_frota_modelos to authenticated;
