-- ───────────────────────────────────────────────────────────────────────────
-- TRACKING — Upload de carta de porte com extração AI.
-- 1) Permite origem='upload' nos envios criados a partir de um documento.
-- 2) Guarda o JSON extraído + confiança por campo (auditoria de qualidade).
-- 3) Log de extrações (sucesso/erro) consultável na área administrativa.
-- Acesso: admin + administrativo (has_administrativo_access()).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Nova origem 'upload' no CHECK de shipments_tracking.origem ─────────────
alter table public.shipments_tracking drop constraint if exists shipments_tracking_origem_check;
alter table public.shipments_tracking add constraint shipments_tracking_origem_check
  check (origem in ('manual','ep','expedicao','encomenda','recolha','equipamento','upload'));

-- ── 2. Auditoria da extração no próprio envio ────────────────────────────────
-- extracao_json: objeto bruto devolvido pela IA (campos + valores);
-- extracao_confianca: nível de confiança por campo ('alta'|'media'|'baixa').
alter table public.shipments_tracking
  add column if not exists extracao_json      jsonb,
  add column if not exists extracao_confianca jsonb;

-- ── 3. Log de extrações (sucesso e erro) ─────────────────────────────────────
create table if not exists public.tracking_extracao_log (
  id            uuid primary key default gen_random_uuid(),
  ficheiro_nome text,
  content_type  text,
  tamanho       bigint,
  sucesso       boolean not null default false,
  modelo        text,                 -- modelo de IA usado
  erro          text,                 -- mensagem de erro (quando sucesso=false)
  extracao_json jsonb,                -- JSON bruto devolvido pela IA (auditoria)
  duplicado_de  uuid references public.shipments_tracking(id) on delete set null,  -- envio já existente detetado
  tracking_id   uuid references public.shipments_tracking(id) on delete set null,  -- envio criado a partir deste upload
  user_id       uuid,
  user_nome     text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_tracking_extracao_log_data    on public.tracking_extracao_log(created_at desc);
create index if not exists idx_tracking_extracao_log_sucesso on public.tracking_extracao_log(sucesso);

-- RLS: admin + administrativo (mesmo perímetro do módulo Tracking).
alter table public.tracking_extracao_log enable row level security;
grant select, insert on public.tracking_extracao_log to authenticated;
grant all on public.tracking_extracao_log to service_role;

drop policy if exists tracking_extracao_log_select on public.tracking_extracao_log;
drop policy if exists tracking_extracao_log_insert on public.tracking_extracao_log;
create policy tracking_extracao_log_select on public.tracking_extracao_log
  for select to authenticated using (public.has_administrativo_access());
create policy tracking_extracao_log_insert on public.tracking_extracao_log
  for insert to authenticated with check (public.has_administrativo_access());
