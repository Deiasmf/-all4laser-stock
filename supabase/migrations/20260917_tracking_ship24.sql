-- ───────────────────────────────────────────────────────────────────────────
-- MÓDULO TRACKING — atualizações automáticas de estado via Ship24.
-- Aditiva: não apaga nada. Respeita a RLS existente (has_administrativo_access()).
-- O webhook e o cron correm com service_role (bypass RLS).
--   Ship24 é conhecido APENAS pelo adaptador (src/lib/trackingProvider.ts) e
--   pela rota de webhook. Trocar de fornecedor = novo adaptador, zero mudanças
--   no schema.
-- ───────────────────────────────────────────────────────────────────────────

-- ── A. Colunas novas em shipments_tracking (tracker Ship24 + último evento) ───
alter table public.shipments_tracking
  add column if not exists ship24_tracker_id     text,        -- trackerId do Ship24 (null até registar)
  add column if not exists ship24_registado_em   timestamptz, -- quando criámos o tracker
  add column if not exists last_status_milestone text,        -- milestone cru do Ship24
  add column if not exists last_event_descricao  text,        -- texto do último evento
  add column if not exists last_event_local      text,        -- localização do último evento
  add column if not exists last_event_em         timestamptz, -- occurrenceDatetime do último evento
  add column if not exists estado_manual         boolean not null default false; -- override manual
-- (last_status_raw, last_status_at, carrier_code_api, auto_tracking_enabled já existem)

create index if not exists shipments_tracking_ship24_uk
  on public.shipments_tracking(ship24_tracker_id) where ship24_tracker_id is not null;
-- Envios "ativos" a seguir = auto ligado, não terminado, não eliminado, não anulado
create index if not exists shipments_tracking_auto_idx
  on public.shipments_tracking(auto_tracking_enabled)
  where auto_tracking_enabled and deleted_at is null and origem_anulada = false;

-- ── B. carriers: marcar cobertura Ship24 ──────────────────────────────────────
alter table public.carriers
  add column if not exists suporta_ship24 boolean not null default false;
-- (carrier_code_api / suporta_ship24 são atualizados por código após GET /couriers)

-- ── C. Histórico de eventos (linha temporal do envio) ─────────────────────────
create table if not exists public.tracking_updates (
  id               uuid primary key default gen_random_uuid(),
  tracking_id      uuid not null references public.shipments_tracking(id) on delete cascade,
  event_id         text,          -- eventId do Ship24 (idempotência)
  status_milestone text,          -- milestone cru
  status_category  text,          -- data | transit | delivery
  estado_mapeado   text,          -- o nosso EstadoEnvio
  descricao        text,          -- texto cru do evento
  local            text,          -- localização
  courier_code     text,
  ocorrido_em      timestamptz,   -- occurrenceDatetime
  recebido_por     text check (recebido_por in ('webhook','cron')),
  created_at       timestamptz not null default now()
);
-- Idempotência: o mesmo evento não duplica
create unique index if not exists tracking_updates_event_uk
  on public.tracking_updates(tracking_id, event_id) where event_id is not null;
create index if not exists tracking_updates_tid_idx
  on public.tracking_updates(tracking_id, ocorrido_em desc);

-- ── D. Estado/config da integração (painel + quota do free tier) ──────────────
create table if not exists public.tracking_integracao (
  id                   int primary key default 1 check (id = 1),
  ativo                boolean not null default false,
  plano                text not null default 'free',   -- free | paid
  quota_limite         int  not null default 10,        -- free tier: 10/mês
  quota_consumida      int  not null default 0,         -- trackers criados no período
  quota_periodo_inicio date,
  ultimo_cron_em       timestamptz,
  ultimo_cron_ok       boolean,
  ultimo_cron_erro     text,
  ultimo_webhook_em    timestamptz,
  falhas_consecutivas  int not null default 0,          -- alerta se >= 2
  updated_at           timestamptz not null default now()
);
insert into public.tracking_integracao (id) values (1) on conflict do nothing;

-- ── E. RLS ────────────────────────────────────────────────────────────────────
alter table public.tracking_updates    enable row level security;
alter table public.tracking_integracao enable row level security;
grant select, insert, update, delete on public.tracking_updates    to authenticated;
grant select, insert, update, delete on public.tracking_integracao to authenticated;
grant all on public.tracking_updates    to service_role;
grant all on public.tracking_integracao to service_role;

drop policy if exists tracking_updates_acesso on public.tracking_updates;
create policy tracking_updates_acesso on public.tracking_updates
  for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());

-- Estado da integração: leitura por qualquer staff; escrita só admin/administrativo
drop policy if exists tracking_integracao_select on public.tracking_integracao;
create policy tracking_integracao_select on public.tracking_integracao
  for select to authenticated using (public.is_staff());
drop policy if exists tracking_integracao_write on public.tracking_integracao;
create policy tracking_integracao_write on public.tracking_integracao
  for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());

drop trigger if exists trg_tracking_integracao_updated_at on public.tracking_integracao;
create trigger trg_tracking_integracao_updated_at before update on public.tracking_integracao
  for each row execute function public.set_updated_at();
