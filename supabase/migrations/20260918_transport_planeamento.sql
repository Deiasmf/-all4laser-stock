-- Agenda de Transportes (Fase C): planeamento diário.
-- Atribuição de paragem a motorista + carrinha/estado por motorista e dia.

alter table public.transport_stops
  add column if not exists motorista_id uuid references public.transport_drivers(id) on delete set null;
create index if not exists transport_stops_motorista_idx on public.transport_stops(motorista_id);

create table if not exists public.transport_driver_days (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  driver_id  uuid not null references public.transport_drivers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  estado     text not null default 'provisorio' check (estado in ('provisorio','publicado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data, driver_id)
);
create index if not exists transport_driver_days_data_idx on public.transport_driver_days(data);

alter table public.transport_driver_days enable row level security;
grant select, insert, update, delete on public.transport_driver_days to authenticated;
grant all on public.transport_driver_days to service_role;
drop policy if exists transport_driver_days_acesso on public.transport_driver_days;
create policy transport_driver_days_acesso on public.transport_driver_days
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop trigger if exists trg_transport_driver_days_updated_at on public.transport_driver_days;
create trigger trg_transport_driver_days_updated_at before update on public.transport_driver_days
  for each row execute function public.set_updated_at();
