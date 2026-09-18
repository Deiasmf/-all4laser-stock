-- Agenda de Transportes (Fase B): motoristas, parceiros externos, carrinhas.
-- Gestão por qualquer staff (is_staff()).

create table if not exists public.transport_drivers (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  user_id        uuid references public.profiles(id) on delete set null,
  zona_principal text check (zona_principal in ('lisboa','norte','algarve')),
  tipo           text not null default 'principal' check (tipo in ('principal','reforco')),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.external_partners (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text,
  zona       text check (zona in ('lisboa','norte','algarve')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  matricula        text,
  capacidade_notas text,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.vehicle_unavailability (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  de         date not null,
  ate        date not null,
  motivo     text,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_unavailability_vid_idx on public.vehicle_unavailability(vehicle_id, de);

alter table public.transport_drivers       enable row level security;
alter table public.external_partners       enable row level security;
alter table public.vehicles                enable row level security;
alter table public.vehicle_unavailability  enable row level security;
grant select, insert, update, delete on public.transport_drivers      to authenticated;
grant select, insert, update, delete on public.external_partners      to authenticated;
grant select, insert, update, delete on public.vehicles               to authenticated;
grant select, insert, update, delete on public.vehicle_unavailability to authenticated;
grant all on public.transport_drivers      to service_role;
grant all on public.external_partners      to service_role;
grant all on public.vehicles               to service_role;
grant all on public.vehicle_unavailability to service_role;

drop policy if exists transport_drivers_acesso on public.transport_drivers;
create policy transport_drivers_acesso on public.transport_drivers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists external_partners_acesso on public.external_partners;
create policy external_partners_acesso on public.external_partners
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists vehicles_acesso on public.vehicles;
create policy vehicles_acesso on public.vehicles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists vehicle_unavailability_acesso on public.vehicle_unavailability;
create policy vehicle_unavailability_acesso on public.vehicle_unavailability
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop trigger if exists trg_transport_drivers_updated_at on public.transport_drivers;
create trigger trg_transport_drivers_updated_at before update on public.transport_drivers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_external_partners_updated_at on public.external_partners;
create trigger trg_external_partners_updated_at before update on public.external_partners
  for each row execute function public.set_updated_at();
drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

insert into public.transport_drivers (nome, zona_principal, tipo) values
  ('José', 'norte', 'principal'),
  ('Nuno', 'lisboa', 'principal'),
  ('Artur', null, 'reforco'),
  ('Rafael', null, 'reforco')
on conflict do nothing;

insert into public.external_partners (nome, zona, email) values
  ('Gonçalo', 'algarve', null)
on conflict do nothing;
