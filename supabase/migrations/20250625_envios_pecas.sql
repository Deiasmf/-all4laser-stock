-- Módulo Pedidos de Envio de Peças (Logística + Administrativo)
-- Tabelas: envios_pecas (+ contador p/ numeração EP-YYYY-NNNN), envios_pecas_itens.
-- Segue os padrões dos módulos Notas de Encomenda / Folhas de Obra.

-- ── Colunas auxiliares noutras tabelas ──
alter table public.pecas    add column if not exists preco_venda numeric default 0;
alter table public.clientes add column if not exists email text;

-- ───────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL: envios_pecas
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.envios_pecas (
  id                   uuid primary key default gen_random_uuid(),
  numero               text unique,                       -- EP-YYYY-NNNN (trigger)
  estado               text not null default 'aberto'
                         check (estado in ('aberto','a_realizar','pronto_a_expedir','expedido','cancelado')),

  -- Cliente (id ligado + cópia desnormalizada / manual)
  cliente_id           uuid references public.clientes(id),
  cliente_nome         text,
  cliente_email        text,
  morada_envio         text,

  -- Transportadora
  transportadora       text check (transportadora in ('Nacex','UPS','FedEx','Outro')),
  transportadora_outro text,

  -- Dimensões e peso
  peso_kg              numeric,
  comprimento_cm       numeric,
  largura_cm           numeric,
  altura_cm            numeric,

  -- Faturação / pagamento
  valor_a_faturar      numeric,
  faturado             boolean not null default false,
  pago                 boolean not null default false,
  data_pagamento       date,

  -- Documentos
  fatura_url           text,
  fatura_caminho       text,
  carta_porte_url      text,
  carta_porte_caminho  text,

  notas                text,

  criado_por           uuid references auth.users(id),
  criado_por_nome      text,
  expedido_em          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── Itens do envio ──
create table if not exists public.envios_pecas_itens (
  id              uuid primary key default gen_random_uuid(),
  envio_id        uuid not null references public.envios_pecas(id) on delete cascade,
  peca_id         uuid references public.pecas(id),
  peca_nome       text,
  quantidade      integer not null default 1,
  preco_unitario  numeric not null default 0,
  preco_total     numeric generated always as (quantidade * preco_unitario) stored,
  created_at      timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- NUMERAÇÃO AUTOMÁTICA: EP-YYYY-NNNN (sequência por ano, reinicia em 0001)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.envios_pecas_contador (
  ano    int primary key,
  ultimo int not null default 0
);

create or replace function public.gerar_numero_envio_pecas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano int;
  v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.created_at, now()))::int;

  insert into public.envios_pecas_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'EP-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- ── Triggers ──
drop trigger if exists trg_envios_pecas_numero on public.envios_pecas;
create trigger trg_envios_pecas_numero
  before insert on public.envios_pecas
  for each row execute function public.gerar_numero_envio_pecas();

drop trigger if exists trg_envios_pecas_updated_at on public.envios_pecas;
create trigger trg_envios_pecas_updated_at
  before update on public.envios_pecas
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_envios_pecas_numero on public.envios_pecas(numero);
create index if not exists idx_envios_pecas_estado on public.envios_pecas(estado);
create index if not exists idx_envios_pecas_cliente on public.envios_pecas(cliente_id);
create index if not exists idx_envios_pecas_created on public.envios_pecas(created_at desc);
create index if not exists idx_epi_envio on public.envios_pecas_itens(envio_id);

-- ── RLS ──
alter table public.envios_pecas          enable row level security;
alter table public.envios_pecas_itens    enable row level security;
alter table public.envios_pecas_contador enable row level security; -- sem políticas: só via função

drop policy if exists envios_pecas_select on public.envios_pecas;
drop policy if exists envios_pecas_insert on public.envios_pecas;
drop policy if exists envios_pecas_update on public.envios_pecas;
drop policy if exists envios_pecas_delete on public.envios_pecas;
create policy envios_pecas_select on public.envios_pecas for select to authenticated using (true);
create policy envios_pecas_insert on public.envios_pecas for insert to authenticated with check (true);
create policy envios_pecas_update on public.envios_pecas for update to authenticated using (true) with check (true);
create policy envios_pecas_delete on public.envios_pecas for delete to authenticated using (is_admin());

drop policy if exists epi_select on public.envios_pecas_itens;
drop policy if exists epi_insert on public.envios_pecas_itens;
drop policy if exists epi_update on public.envios_pecas_itens;
drop policy if exists epi_delete on public.envios_pecas_itens;
create policy epi_select on public.envios_pecas_itens for select to authenticated using (true);
create policy epi_insert on public.envios_pecas_itens for insert to authenticated with check (true);
create policy epi_update on public.envios_pecas_itens for update to authenticated using (true) with check (true);
create policy epi_delete on public.envios_pecas_itens for delete to authenticated using (true);

grant select, insert, update, delete on public.envios_pecas       to authenticated;
grant select, insert, update, delete on public.envios_pecas_itens to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE: bucket para documentos (faturas e cartas de porte)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('envios-pecas-docs', 'envios-pecas-docs', true)
on conflict (id) do nothing;

drop policy if exists envios_docs_select on storage.objects;
drop policy if exists envios_docs_insert on storage.objects;
drop policy if exists envios_docs_update on storage.objects;
drop policy if exists envios_docs_delete on storage.objects;
create policy envios_docs_select on storage.objects for select to authenticated using (bucket_id = 'envios-pecas-docs');
create policy envios_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'envios-pecas-docs');
create policy envios_docs_update on storage.objects for update to authenticated using (bucket_id = 'envios-pecas-docs') with check (bucket_id = 'envios-pecas-docs');
create policy envios_docs_delete on storage.objects for delete to authenticated using (bucket_id = 'envios-pecas-docs');
