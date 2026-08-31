-- =====================================================================
-- Cotações de Transporte — Parte A: transitários e grupos
-- =====================================================================

-- Transitários -------------------------------------------------------
create table if not exists public.freight_forwarders (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,                 -- nome da empresa
  pessoa_contacto text,
  emails         text[] not null default '{}',  -- pode ter mais do que um
  telefone       text,
  pais           text,
  notas          text,
  ativo          boolean not null default true,
  fornecedor_id  uuid references public.fornecedores(id) on delete set null, -- link opcional
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Grupos -------------------------------------------------------------
create table if not exists public.forwarder_groups (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,                    -- ex: "Transitários Portugal"
  idioma     text not null default 'pt' check (idioma in ('pt','en')),
  notas      text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- N:N grupos <-> transitários ---------------------------------------
create table if not exists public.forwarder_group_members (
  group_id     uuid not null references public.forwarder_groups(id) on delete cascade,
  forwarder_id uuid not null references public.freight_forwarders(id) on delete cascade,
  primary key (group_id, forwarder_id)
);

create index if not exists idx_fgm_group     on public.forwarder_group_members(group_id);
create index if not exists idx_fgm_forwarder on public.forwarder_group_members(forwarder_id);

-- RLS: admin + administrativo ---------------------------------------
alter table public.freight_forwarders      enable row level security;
alter table public.forwarder_groups        enable row level security;
alter table public.forwarder_group_members enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'freight_forwarders','forwarder_groups','forwarder_group_members'
  ] loop
    execute format(
      'create policy %1$s_rw on public.%1$s for all to authenticated
         using (public.has_administrativo_access())
         with check (public.has_administrativo_access());', t);
    execute format(
      'grant select, insert, update, delete on public.%s to authenticated;', t);
  end loop;
end $$;
