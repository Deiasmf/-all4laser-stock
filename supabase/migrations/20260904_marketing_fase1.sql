-- ───────────────────────────────────────────────────────────────────────────
-- MÓDULO MARKETING E PUBLICAÇÕES — Fase 1 (organização e aprovação)
--
-- Tudo ADITIVO: só cria tabelas novas com prefixo marketing_*. Não altera nem
-- migra dados existentes. Reutiliza entidades da app (equipamentos, clientes,
-- profiles) e os helpers de RLS (is_staff, has_financeiro_access, is_admin) e
-- o trigger set_updated_at().
--
-- Acesso: todo o staff (is_staff) gere o conteúdo. A ÚNICA ação restrita é a
-- APROVAÇÃO de orçamento de promoção paga → has_financeiro_access() (admin/
-- financeiro), garantida por trigger na BD (proteção real, não só na UI).
--
-- Publicação real e campanhas pagas ficam para a Fase 2/3 (aqui não há).
-- ───────────────────────────────────────────────────────────────────────────

-- ═══ 1. CAMPANHAS ═══════════════════════════════════════════════════════════
create table if not exists public.marketing_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  numero             text unique,                        -- CAMP-YYYY-NNNN (trigger)
  nome               text not null,
  objetivo_comercial text,
  linha_negocio      text check (linha_negocio in
                       ('venda','aluguer','assistencia','formacao','institucional')),
  oferta             text,
  mercados           text[] not null default '{}',
  publicos           text,
  data_inicio        date,
  data_fim           date,
  idiomas            text[] not null default '{}',
  canais             text[] not null default '{}',
  landing_url        text,
  kpi_principal      text,
  kpis_secundarios   text,
  responsavel_id     uuid references public.profiles(id) on delete set null,
  responsavel_nome   text,
  estado             text not null default 'rascunho'
                       check (estado in ('rascunho','ativa','encerrada')),
  notas              text,
  criado_por         uuid references public.profiles(id) on delete set null,
  criado_por_nome    text,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id) on delete set null,
  deleted_by_nome    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ═══ 2. PUBLICAÇÕES (conteúdo editorial) ════════════════════════════════════
create table if not exists public.marketing_posts (
  id                 uuid primary key default gen_random_uuid(),
  numero             text unique,                        -- PUB-YYYY-NNNN (trigger)
  titulo_interno     text not null,
  campaign_id        uuid references public.marketing_campaigns(id) on delete set null,
  linha_negocio      text check (linha_negocio in
                       ('venda','aluguer','assistencia','formacao','institucional')),
  objetivo           text check (objetivo in
                       ('notoriedade','educacao','prova','captacao','conversao','retencao')),
  mercados           text[] not null default '{}',
  idioma_base        text,
  publico_alvo       text,
  responsavel_id     uuid references public.profiles(id) on delete set null,
  responsavel_nome   text,
  prioridade         text not null default 'normal'
                       check (prioridade in ('baixa','normal','alta')),
  notas_internas     text,
  canva_url          text,
  estrategia_promocao text not null default 'organica'
                       check (estrategia_promocao in ('organica','candidata_paga','paga_aprovada')),
  estado_global      text not null default 'idea'
                       check (estado_global in
                       ('idea','draft','in_review','approved','scheduled',
                        'publishing','published','changes_requested','failed',
                        'cancelled','archived')),
  criado_por         uuid references public.profiles(id) on delete set null,
  criado_por_nome    text,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id) on delete set null,
  deleted_by_nome    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ═══ 3. VARIANTES POR PLATAFORMA ════════════════════════════════════════════
create table if not exists public.marketing_post_variants (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.marketing_posts(id) on delete cascade,
  plataforma         text not null check (plataforma in
                       ('instagram_feed','instagram_story','instagram_reel','facebook','linkedin')),
  account_ref        text,                               -- Fase 2: fk a marketing_social_accounts
  idioma             text,
  texto              text,
  titulo             text,
  cta                text,
  url_destino        text,
  utm                jsonb,
  hashtags           text[] not null default '{}',
  primeiro_comentario text,
  alt_text           text,
  formato            text check (formato in
                       ('imagem','carrossel','video','reel','story','documento','texto')),
  data_agendada      timestamptz,                        -- UTC; UI mostra Europe/Lisbon
  estado             text not null default 'draft'
                       check (estado in
                       ('draft','in_review','approved','scheduled','publishing',
                        'published','changes_requested','failed','cancelled')),
  criado_por         uuid references public.profiles(id) on delete set null,
  criado_por_nome    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ═══ 4. BIBLIOTECA DE MEDIA ═════════════════════════════════════════════════
create table if not exists public.marketing_media_assets (
  id                 uuid primary key default gen_random_uuid(),
  nome_interno       text not null,
  tipo               text not null check (tipo in ('imagem','video','documento','canva_link')),
  caminho            text,                               -- bucket marketing-media
  thumbnail_caminho  text,
  canva_url          text,
  marca              text,
  modelo             text,
  campaign_id        uuid references public.marketing_campaigns(id) on delete set null,
  mercado            text,
  idioma             text,
  origem             text,
  proprietario_id    uuid references public.profiles(id) on delete set null,
  proprietario_nome  text,
  direitos           text,
  direitos_validade  date,
  versao             text,
  hash               text,
  etiquetas          text[] not null default '{}',
  estado             text not null default 'rascunho'
                       check (estado in ('rascunho','aprovado','expirado','arquivado')),
  criado_por         uuid references public.profiles(id) on delete set null,
  criado_por_nome    text,
  deleted_at         timestamptz,
  deleted_by         uuid references public.profiles(id) on delete set null,
  deleted_by_nome    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ═══ 5. MEDIA DE UMA VARIANTE (ordem) ═══════════════════════════════════════
create table if not exists public.marketing_post_media (
  id                 uuid primary key default gen_random_uuid(),
  variant_id         uuid not null references public.marketing_post_variants(id) on delete cascade,
  asset_id           uuid not null references public.marketing_media_assets(id) on delete restrict,
  ordem              int not null default 0,
  created_at         timestamptz not null default now(),
  unique (variant_id, asset_id)
);

-- ═══ 6. EQUIPAMENTOS DE UMA PUBLICAÇÃO (1..N) ═══════════════════════════════
create table if not exists public.marketing_post_equipment (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.marketing_posts(id) on delete cascade,
  equipamento_id     uuid references public.equipamentos(id) on delete set null,
  marca              text,
  modelo             text,
  created_at         timestamptz not null default now(),
  unique (post_id, equipamento_id)
);

-- ═══ 7. APROVAÇÕES / REVISÕES (audit do fluxo editorial) ════════════════════
create table if not exists public.marketing_post_approvals (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.marketing_posts(id) on delete cascade,
  variant_id         uuid references public.marketing_post_variants(id) on delete cascade,
  acao               text not null check (acao in
                       ('submeteu','pediu_alteracoes','aprovou','rejeitou','publicou','cancelou')),
  por_id             uuid references public.profiles(id) on delete set null,
  por_nome           text,
  comentario         text,
  created_at         timestamptz not null default now()
);

-- ═══ 8. CHECKLIST DE CONFORMIDADE ═══════════════════════════════════════════
create table if not exists public.marketing_compliance_checks (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.marketing_posts(id) on delete cascade,
  item               text not null,
  estado             text not null default 'pendente'
                       check (estado in ('confirmado','nao_aplicavel','pendente')),
  justificacao       text,
  por_id             uuid references public.profiles(id) on delete set null,
  por_nome           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (post_id, item)
);

-- ═══ 9. PROPOSTAS DE PROMOÇÃO PAGA (aprovação de orçamento restrita) ═════════
create table if not exists public.marketing_paid_proposals (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.marketing_posts(id) on delete cascade,
  motivo              text,
  objetivo            text check (objetivo in ('alcance','trafego','leads','conversao')),
  mercado             text,
  publico             text,
  periodo_inicio      date,
  periodo_fim         date,
  orcamento_proposto  numeric(12,2),
  estado              text not null default 'proposta'
                        check (estado in ('proposta','aprovada','rejeitada')),
  aprovado_por_id     uuid references public.profiles(id) on delete set null,
  aprovado_por_nome   text,
  aprovado_em         timestamptz,
  campanha_externa_ref text,
  observacoes         text,
  criado_por          uuid references public.profiles(id) on delete set null,
  criado_por_nome     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ═══ NUMERAÇÃO AUTOMÁTICA ═══════════════════════════════════════════════════
create table if not exists public.marketing_campaigns_contador (ano int primary key, ultimo int not null default 0);
create table if not exists public.marketing_posts_contador     (ano int primary key, ultimo int not null default 0);

create or replace function public.gerar_numero_marketing_campaign()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ano int; v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then return new; end if;
  v_ano := extract(year from coalesce(new.created_at, now()))::int;
  insert into public.marketing_campaigns_contador as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1 returning ultimo into v_seq;
  new.numero := 'CAMP-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end; $$;

create or replace function public.gerar_numero_marketing_post()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ano int; v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then return new; end if;
  v_ano := extract(year from coalesce(new.created_at, now()))::int;
  insert into public.marketing_posts_contador as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1 returning ultimo into v_seq;
  new.numero := 'PUB-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end; $$;

drop trigger if exists trg_marketing_campaign_numero on public.marketing_campaigns;
create trigger trg_marketing_campaign_numero before insert on public.marketing_campaigns
  for each row execute function public.gerar_numero_marketing_campaign();

drop trigger if exists trg_marketing_post_numero on public.marketing_posts;
create trigger trg_marketing_post_numero before insert on public.marketing_posts
  for each row execute function public.gerar_numero_marketing_post();

-- ═══ TRIGGERS updated_at ════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'marketing_campaigns','marketing_posts','marketing_post_variants',
    'marketing_media_assets','marketing_compliance_checks','marketing_paid_proposals'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ═══ GUARDA: aprovar orçamento pago exige has_financeiro_access() ════════════
create or replace function public.marketing_guarda_aprovacao_paga()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Só quando a transição é PARA 'aprovada' e vinda de outro estado.
  if new.estado = 'aprovada' and coalesce(old.estado,'') <> 'aprovada' then
    if not public.has_financeiro_access() then
      raise exception 'Só a administração/financeiro pode aprovar orçamento de promoção paga.';
    end if;
    if new.aprovado_em is null then new.aprovado_em := now(); end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_marketing_paid_aprovacao on public.marketing_paid_proposals;
create trigger trg_marketing_paid_aprovacao before update on public.marketing_paid_proposals
  for each row execute function public.marketing_guarda_aprovacao_paga();

-- ═══ ÍNDICES ════════════════════════════════════════════════════════════════
create index if not exists idx_mkt_campaigns_estado   on public.marketing_campaigns(estado);
create index if not exists idx_mkt_campaigns_created  on public.marketing_campaigns(created_at desc);
create index if not exists idx_mkt_posts_estado       on public.marketing_posts(estado_global);
create index if not exists idx_mkt_posts_campaign     on public.marketing_posts(campaign_id);
create index if not exists idx_mkt_posts_created      on public.marketing_posts(created_at desc);
create index if not exists idx_mkt_variants_post      on public.marketing_post_variants(post_id);
create index if not exists idx_mkt_variants_plataforma on public.marketing_post_variants(plataforma);
create index if not exists idx_mkt_variants_agendada  on public.marketing_post_variants(data_agendada);
create index if not exists idx_mkt_variants_estado    on public.marketing_post_variants(estado);
create index if not exists idx_mkt_assets_estado      on public.marketing_media_assets(estado);
create index if not exists idx_mkt_equip_post         on public.marketing_post_equipment(post_id);
create index if not exists idx_mkt_approvals_post     on public.marketing_post_approvals(post_id);
create index if not exists idx_mkt_checks_post        on public.marketing_compliance_checks(post_id);
create index if not exists idx_mkt_paid_post          on public.marketing_paid_proposals(post_id);

-- ═══ RLS + GRANTS ═══════════════════════════════════════════════════════════
-- Todo o staff gere (select/insert/update/delete). Os _contador não têm
-- políticas (só via função security definer). A restrição de orçamento pago é
-- feita pelo trigger acima, não pela RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'marketing_campaigns','marketing_posts','marketing_post_variants',
    'marketing_media_assets','marketing_post_media','marketing_post_equipment',
    'marketing_post_approvals','marketing_compliance_checks','marketing_paid_proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff())', t || '_delete', t);
  end loop;
end $$;

alter table public.marketing_campaigns_contador enable row level security; -- sem políticas
alter table public.marketing_posts_contador     enable row level security; -- sem políticas

-- ═══ STORAGE: bucket privado para media de marketing ════════════════════════
insert into storage.buckets (id, name, public)
values ('marketing-media', 'marketing-media', false)
on conflict (id) do nothing;

drop policy if exists marketing_media_select on storage.objects;
drop policy if exists marketing_media_insert on storage.objects;
drop policy if exists marketing_media_update on storage.objects;
drop policy if exists marketing_media_delete on storage.objects;
create policy marketing_media_select on storage.objects for select to authenticated using (bucket_id = 'marketing-media' and public.is_staff());
create policy marketing_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'marketing-media' and public.is_staff());
create policy marketing_media_update on storage.objects for update to authenticated using (bucket_id = 'marketing-media' and public.is_staff()) with check (bucket_id = 'marketing-media' and public.is_staff());
create policy marketing_media_delete on storage.objects for delete to authenticated using (bucket_id = 'marketing-media' and public.is_staff());
