-- ───────────────────────────────────────────────────────────────────────────
-- MÓDULO TRACKING — separador central de envios (Área Administrativa).
-- Centraliza todos os envios com tracking number / AWB / carta de porte,
-- sincronizado automaticamente a partir dos outros módulos (envios_pecas,
-- equipamentos) por triggers. Preparado para integração futura com API
-- agregadora de tracking (17track/Ship24) — campos incluídos, sem ativar.
-- Acesso: admin + administrativo (has_administrativo_access()).
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Transportadoras / companhias (tabela gerível) ─────────────────────────
create table if not exists public.carriers (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  tipo            text not null default 'expresso'
                    check (tipo in ('expresso','companhia_aerea','outro')),
  codigo          text,               -- código curto interno (ex.: 'UPS','TAP')
  prefixo_awb     text,               -- prefixo IATA (só companhias aéreas), ex.: '074'
  url_template    text,               -- template de tracking: usa {tracking} (expresso) ou {awb} (aérea)
  deteta_regex    text,               -- regex para auto-deteção pelo formato do número
  carrier_code_api text,              -- código para API agregadora futura (17track/Ship24)
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Prefixo IATA único (para deteção determinística por prefixo).
create unique index if not exists carriers_prefixo_awb_uk
  on public.carriers(prefixo_awb) where prefixo_awb is not null;
create index if not exists carriers_tipo_idx on public.carriers(tipo) where ativo;

drop trigger if exists trg_carriers_updated_at on public.carriers;
create trigger trg_carriers_updated_at before update on public.carriers
  for each row execute function public.set_updated_at();

-- ── 2. Envios / tracking ─────────────────────────────────────────────────────
create table if not exists public.shipments_tracking (
  id                uuid primary key default gen_random_uuid(),
  tracking_number   text,             -- nº de tracking expresso (nullable: aéreo pode ter só AWB)
  awb               text,             -- Air Waybill XXX-XXXXXXXX (nullable)
  awb_check_valido  boolean,          -- resultado da validação do dígito de controlo (null = n/a)
  tipo_transporte   text not null default 'expresso'
                    check (tipo_transporte in ('expresso','carga_aerea','outro')),
  carrier_id        uuid references public.carriers(id) on delete set null,
  carrier_nome      text,             -- desnormalizado (histórico/fallback)
  direcao           text not null default 'envio' check (direcao in ('envio','rececao')),
  descricao_conteudo text,
  -- entidade (mesmo padrão de envios_pecas)
  entidade_tipo     text check (entidade_tipo in ('cliente','fornecedor')),
  cliente_id        uuid references public.clientes(id) on delete set null,
  supplier_id       uuid references public.fornecedores(id) on delete set null,
  entidade_nome     text,
  -- origem (primária) + referência ao documento de origem
  origem            text not null default 'manual'
                    check (origem in ('manual','ep','expedicao','encomenda','recolha','equipamento')),
  source_type       text,             -- ex.: 'envios_pecas','equipamentos'
  source_id         uuid,
  origem_anulada    boolean not null default false,   -- doc de origem apagado/anulado (mantém histórico)
  -- anexo carta de porte (bucket privado)
  carta_porte_url   text,
  carta_porte_caminho text,
  -- estado + datas
  estado            text not null default 'registado'
                    check (estado in ('registado','em_transito','entregue','problema','devolvido')),
  data_expedicao    date,
  entrega_prevista  date,
  entrega_efetiva   date,
  notas             text,
  -- extras de carga aérea
  aeroporto_origem  text,
  aeroporto_destino text,
  num_volumes       integer,
  peso_kg           numeric,
  -- preparação para tracking automático (não ativado)
  last_status_raw   text,
  last_status_at    timestamptz,
  carrier_code_api  text,
  auto_tracking_enabled boolean not null default false,
  -- meta
  criado_por        uuid,
  criado_por_nome   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- chave de deduplicação: mesmo tracking/AWB => uma só entrada (ponto 5)
  dedup_key         text generated always as
                    (lower(coalesce(nullif(trim(tracking_number),''), nullif(trim(awb),'')))) stored
);

create unique index if not exists shipments_tracking_dedup_uk
  on public.shipments_tracking(dedup_key) where dedup_key is not null;
create unique index if not exists shipments_tracking_source_uk
  on public.shipments_tracking(source_type, source_id) where source_id is not null;
create index if not exists shipments_tracking_estado_idx on public.shipments_tracking(estado);
create index if not exists shipments_tracking_tipo_idx on public.shipments_tracking(tipo_transporte);
create index if not exists shipments_tracking_direcao_idx on public.shipments_tracking(direcao);
create index if not exists shipments_tracking_data_idx on public.shipments_tracking(data_expedicao desc);

drop trigger if exists trg_shipments_tracking_updated_at on public.shipments_tracking;
create trigger trg_shipments_tracking_updated_at before update on public.shipments_tracking
  for each row execute function public.set_updated_at();

-- ── 3. Origens adicionais (mesmo tracking vindo de >1 sítio) ──────────────────
-- A entrada principal guarda a origem primária (source_type/source_id acima);
-- esta tabela regista TODAS as origens que apontam ao mesmo envio (ponto 5).
create table if not exists public.shipments_tracking_sources (
  id            uuid primary key default gen_random_uuid(),
  tracking_id   uuid not null references public.shipments_tracking(id) on delete cascade,
  origem        text not null,
  source_type   text not null,
  source_id     uuid not null,
  anulada       boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists shipments_tracking_sources_uk
  on public.shipments_tracking_sources(source_type, source_id);
create index if not exists shipments_tracking_sources_tid_idx
  on public.shipments_tracking_sources(tracking_id);

-- ── 4. RLS: admin + administrativo ───────────────────────────────────────────
alter table public.carriers enable row level security;
alter table public.shipments_tracking enable row level security;
alter table public.shipments_tracking_sources enable row level security;

grant select, insert, update, delete on public.carriers to authenticated;
grant select, insert, update, delete on public.shipments_tracking to authenticated;
grant select, insert, update, delete on public.shipments_tracking_sources to authenticated;
grant all on public.carriers to service_role;
grant all on public.shipments_tracking to service_role;
grant all on public.shipments_tracking_sources to service_role;

-- carriers: leitura por qualquer staff (é lookup usado noutros módulos);
-- gestão (escrita) só admin/administrativo.
drop policy if exists carriers_select on public.carriers;
create policy carriers_select on public.carriers
  for select to authenticated using (public.is_staff());
drop policy if exists carriers_write on public.carriers;
create policy carriers_write on public.carriers
  for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());

drop policy if exists shipments_tracking_acesso on public.shipments_tracking;
create policy shipments_tracking_acesso on public.shipments_tracking
  for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());

drop policy if exists shipments_tracking_sources_acesso on public.shipments_tracking_sources;
create policy shipments_tracking_sources_acesso on public.shipments_tracking_sources
  for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());

-- ── 5. Função central de sincronização (SECURITY DEFINER) ────────────────────
-- Chamada pelos triggers das tabelas de origem. Faz upsert idempotente:
--   1) se já existe entrada para (source_type, source_id) -> atualiza-a;
--   2) senão, se o tracking/AWB já existe (dedup_key) -> anexa esta origem;
--   3) senão -> cria nova entrada.
-- Garante sempre um registo em shipments_tracking_sources para cada origem.
create or replace function public.sync_shipment_tracking(
  p_origem        text,
  p_source_type   text,
  p_source_id     uuid,
  p_direcao       text,
  p_tipo          text,
  p_tracking      text,
  p_awb           text,
  p_carrier_nome  text,
  p_entidade_tipo text,
  p_cliente_id    uuid,
  p_supplier_id   uuid,
  p_entidade_nome text,
  p_descricao     text,
  p_carta_url     text,
  p_carta_caminho text,
  p_data_exped    date,
  p_anulada       boolean
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id       uuid;
  v_key      text := lower(coalesce(nullif(trim(p_tracking),''), nullif(trim(p_awb),'')));
  v_carrier  uuid;
begin
  -- Resolver a transportadora pelo nome (se conhecida).
  if p_carrier_nome is not null and btrim(p_carrier_nome) <> '' then
    select id into v_carrier from public.carriers
      where lower(nome) = lower(btrim(p_carrier_nome)) or lower(codigo) = lower(btrim(p_carrier_nome))
      limit 1;
  end if;

  -- 1) Já existe entrada para esta origem?
  select id into v_id from public.shipments_tracking
    where source_type = p_source_type and source_id = p_source_id;

  if v_id is not null then
    update public.shipments_tracking set
      tracking_number = coalesce(nullif(trim(p_tracking),''), tracking_number),
      awb             = coalesce(nullif(trim(p_awb),''), awb),
      tipo_transporte = coalesce(p_tipo, tipo_transporte),
      direcao         = coalesce(p_direcao, direcao),
      carrier_id      = coalesce(v_carrier, carrier_id),
      carrier_nome    = coalesce(nullif(trim(p_carrier_nome),''), carrier_nome),
      entidade_tipo   = coalesce(p_entidade_tipo, entidade_tipo),
      cliente_id      = coalesce(p_cliente_id, cliente_id),
      supplier_id     = coalesce(p_supplier_id, supplier_id),
      entidade_nome   = coalesce(nullif(trim(p_entidade_nome),''), entidade_nome),
      descricao_conteudo = coalesce(nullif(trim(p_descricao),''), descricao_conteudo),
      carta_porte_url = coalesce(p_carta_url, carta_porte_url),
      carta_porte_caminho = coalesce(p_carta_caminho, carta_porte_caminho),
      data_expedicao  = coalesce(p_data_exped, data_expedicao),
      origem_anulada  = p_anulada
    where id = v_id;

    update public.shipments_tracking_sources
      set anulada = p_anulada
      where source_type = p_source_type and source_id = p_source_id;
    return v_id;
  end if;

  -- 2) Dedup por tracking/AWB.
  if v_key is not null then
    select id into v_id from public.shipments_tracking where dedup_key = v_key limit 1;
  end if;

  -- 3) Criar nova entrada se não houver dedup.
  if v_id is null then
    insert into public.shipments_tracking (
      tracking_number, awb, tipo_transporte, carrier_id, carrier_nome, direcao,
      descricao_conteudo, entidade_tipo, cliente_id, supplier_id, entidade_nome,
      origem, source_type, source_id, origem_anulada,
      carta_porte_url, carta_porte_caminho, data_expedicao
    ) values (
      nullif(trim(p_tracking),''), nullif(trim(p_awb),''), coalesce(p_tipo,'expresso'),
      v_carrier, nullif(trim(p_carrier_nome),''), coalesce(p_direcao,'envio'),
      nullif(trim(p_descricao),''), p_entidade_tipo, p_cliente_id, p_supplier_id,
      nullif(trim(p_entidade_nome),''), coalesce(p_origem,'manual'), p_source_type, p_source_id,
      p_anulada, p_carta_url, p_carta_caminho, p_data_exped
    ) returning id into v_id;
  end if;

  -- Garantir o registo de origem (para "referência a ambas as origens").
  insert into public.shipments_tracking_sources (tracking_id, origem, source_type, source_id, anulada)
    values (v_id, coalesce(p_origem,'manual'), p_source_type, p_source_id, p_anulada)
    on conflict (source_type, source_id) do update set anulada = excluded.anulada;

  return v_id;
end;
$$;

-- ── 6. Trigger: envios_pecas → shipments_tracking ────────────────────────────
create or replace function public.trg_sync_envios_pecas_tracking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Só sincroniza quando já há informação de expedição (transportadora/tracking/AWB).
  if coalesce(new.transportadora,'') = ''
     and coalesce(new.tracking_numero,'') = ''
     and coalesce(new.awb_numero,'') = '' then
    return new;
  end if;

  perform public.sync_shipment_tracking(
    p_origem        => 'ep',
    p_source_type   => 'envios_pecas',
    p_source_id     => new.id,
    p_direcao       => 'envio',
    p_tipo          => case when coalesce(new.awb_numero,'') <> '' then 'carga_aerea' else 'expresso' end,
    p_tracking      => new.tracking_numero,
    p_awb           => new.awb_numero,
    p_carrier_nome  => coalesce(nullif(new.transportadora,'Outro'), new.transportadora_outro),
    p_entidade_tipo => coalesce(new.destinatario_tipo,'cliente'),
    p_cliente_id    => new.cliente_id,
    p_supplier_id   => new.fornecedor_id,
    p_entidade_nome => coalesce(new.cliente_nome, new.fornecedor_nome),
    p_descricao     => new.numero,
    p_carta_url     => new.carta_porte_url,
    p_carta_caminho => new.carta_porte_caminho,
    p_data_exped    => (new.expedido_em)::date,
    p_anulada       => (new.estado = 'cancelado')
  );
  return new;
end;
$$;

drop trigger if exists trg_envios_pecas_tracking on public.envios_pecas;
create trigger trg_envios_pecas_tracking
  after insert or update on public.envios_pecas
  for each row execute function public.trg_sync_envios_pecas_tracking();

-- ── 7. Trigger: equipamentos (awb_dau) → shipments_tracking ──────────────────
create or replace function public.trg_sync_equipamentos_tracking()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.awb_dau,'') = '' then
    return new;
  end if;

  perform public.sync_shipment_tracking(
    p_origem        => 'equipamento',
    p_source_type   => 'equipamentos',
    p_source_id     => new.id,
    p_direcao       => 'envio',
    p_tipo          => 'carga_aerea',
    p_tracking      => null,
    p_awb           => new.awb_dau,
    p_carrier_nome  => null,
    p_entidade_tipo => 'cliente',
    p_cliente_id    => null,
    p_supplier_id   => null,
    p_entidade_nome => new.destino,
    p_descricao     => trim(coalesce(new.marca,'') || ' ' || coalesce(new.modelo,'') || ' · SN ' || coalesce(new.serial_number,'')),
    p_carta_url     => null,
    p_carta_caminho => new.awb_dau_caminho,
    p_data_exped    => new.data_saida,
    p_anulada       => false
  );
  return new;
end;
$$;

drop trigger if exists trg_equipamentos_tracking on public.equipamentos;
create trigger trg_equipamentos_tracking
  after insert or update on public.equipamentos
  for each row execute function public.trg_sync_equipamentos_tracking();

-- ── 8. Seed de transportadoras ───────────────────────────────────────────────
-- Expresso (com url_template de tracking atual; {tracking} = número).
insert into public.carriers (nome, tipo, codigo, url_template, deteta_regex, carrier_code_api) values
  ('UPS',   'expresso', 'UPS',   'https://www.ups.com/track?loc=pt_PT&tracknum={tracking}',                     '^1Z[0-9A-Z]{16}$', 'ups'),
  ('FedEx', 'expresso', 'FEDEX', 'https://www.fedex.com/fedextrack/?trknbr={tracking}',                          '^(\d{12}|\d{15})$', 'fedex'),
  ('DHL',   'expresso', 'DHL',   'https://www.dhl.com/pt-pt/home/tracking.html?tracking-id={tracking}&submit=1', '^\d{10}$',          'dhl'),
  ('Nacex', 'expresso', 'NACEX', 'https://www.nacex.pt/seguimientoDetalle.do?agencia_origen=&numero_albaran={tracking}', null,       'nacex'),
  ('CTT',   'expresso', 'CTT',   'https://appserver2.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects={tracking}&request_locale=pt', '^[A-Z]{2}\d{9}PT$', 'ctt')
on conflict do nothing;

-- Companhias de carga aérea (prefixo IATA). url_template null => usa track-trace.com.
insert into public.carriers (nome, tipo, prefixo_awb) values
  ('TAP Air Portugal',      'companhia_aerea', '047'),
  ('Lufthansa Cargo',       'companhia_aerea', '020'),
  ('Air France Cargo',      'companhia_aerea', '057'),
  ('KLM Cargo',             'companhia_aerea', '074'),
  ('Emirates SkyCargo',     'companhia_aerea', '176'),
  ('Turkish Cargo',         'companhia_aerea', '235'),
  ('Qatar Airways Cargo',   'companhia_aerea', '157'),
  ('Iberia (IAG Cargo)',    'companhia_aerea', '075'),
  ('British Airways (IAG)', 'companhia_aerea', '125'),
  ('Swiss WorldCargo',      'companhia_aerea', '724'),
  ('Brussels Airlines',     'companhia_aerea', '082'),
  ('Cargolux',              'companhia_aerea', '172'),
  ('Etihad Cargo',          'companhia_aerea', '607'),
  ('Singapore Airlines Cargo','companhia_aerea','618'),
  ('United Airlines Cargo', 'companhia_aerea', '016'),
  ('American Airlines Cargo','companhia_aerea','001'),
  ('Delta Cargo',           'companhia_aerea', '006')
on conflict do nothing;
