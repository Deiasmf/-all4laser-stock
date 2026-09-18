-- Agenda de Transportes (Fase A): paragens derivadas dos eventos dos calendários.
-- Cada evento Google = uma paragem. Zona e equipamento herdados do calendário
-- (fonte primária). Idempotência por google_event_id. Nada desaparece: o que não
-- for interpretável fica 'por_classificar'. RLS is_staff().
create table if not exists public.transport_stops (
  id                uuid primary key default gen_random_uuid(),
  google_event_id   text unique,
  calendar_id       uuid references public.transport_calendars(id) on delete set null,
  zona              text,
  equipamento_id    uuid references public.equipamentos(id) on delete set null,
  data              date,
  janela_inicio     timestamptz,
  janela_fim        timestamptz,
  tipo              text not null default 'indefinido' check (tipo in ('entrega','recolha','indefinido')),
  cliente_nome      text,
  cliente_id        uuid references public.clientes(id) on delete set null,
  morada            text,
  notas             text,
  titulo_raw        text,
  descricao_raw     text,
  estado            text not null default 'por_classificar'
                    check (estado in ('por_classificar','planeada','confirmada','concluida','cancelada')),
  confianca         text,               -- alta | media | baixa
  aviso_morada      boolean not null default false,  -- morada não bate com a zona do calendário
  alterado          boolean not null default false,  -- alterado desde a última revisão
  hash_evento       text,               -- deteta alterações no Google
  link_evento       text,
  sincronizado_em   timestamptz,
  criado_em         timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists transport_stops_data_idx on public.transport_stops(data);
create index if not exists transport_stops_zona_idx on public.transport_stops(zona);
create index if not exists transport_stops_estado_idx on public.transport_stops(estado);
create index if not exists transport_stops_cal_idx on public.transport_stops(calendar_id);

alter table public.transport_stops enable row level security;
grant select, insert, update, delete on public.transport_stops to authenticated;
grant all on public.transport_stops to service_role;

drop policy if exists transport_stops_acesso on public.transport_stops;
create policy transport_stops_acesso on public.transport_stops
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists trg_transport_stops_updated_at on public.transport_stops;
create trigger trg_transport_stops_updated_at before update on public.transport_stops
  for each row execute function public.set_updated_at();
