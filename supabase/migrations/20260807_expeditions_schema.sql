-- EXPEDIÇÕES AGRUPADAS — agrupar Notas de Encomenda (NE) num envio único.
-- Uma expedição (EXP-YYYY-NNNN) agrupa várias NEs do mesmo cliente/morada.
-- Sobe para a expedição: transporte, carta de porte, tracking, packing list,
-- datas. A NE mantém folha de obra, conteúdo, valores e histórico.
-- Acesso: admin + administrativo (has_administrativo_access()).

create table if not exists public.expeditions (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                                   -- EXP-YYYY-NNNN (trigger)
  cliente_id uuid references public.clientes(id),
  cliente_nome text,
  -- morada de entrega escolhida (cópia desnormalizada de cliente_moradas_entrega)
  morada_entrega_id uuid references public.cliente_moradas_entrega(id) on delete set null,
  morada_etiqueta text, morada text, cidade text, codigo_postal text, pais text,
  estado text not null default 'em_preparacao'
    check (estado in ('em_preparacao','pronta','expedida','entregue','cancelada')),
  tipo_transporte text not null default 'expresso'
    check (tipo_transporte in ('expresso','carga_aerea','outro')),
  transportadora text, tracking_numero text, awb_numero text,
  carta_porte_url text, carta_porte_caminho text,
  data_prevista date, data_expedicao date, data_entrega date, notas text,
  criado_por uuid references auth.users(id), criado_por_nome text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_expeditions_cliente on public.expeditions(cliente_id);
create index if not exists idx_expeditions_estado on public.expeditions(estado);

-- Numeração EXP-YYYY-NNNN (mesmo padrão das NEs)
create table if not exists public.expeditions_contador (ano int primary key, ultimo int not null default 0);
create or replace function public.gerar_numero_expedition() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ano int; v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then return new; end if;
  v_ano := extract(year from coalesce(new.created_at, now()))::int;
  insert into public.expeditions_contador as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1 returning ultimo into v_seq;
  new.numero := 'EXP-' || v_ano || '-' || lpad(v_seq::text, 4, '0'); return new;
end $$;
drop trigger if exists trg_expeditions_numero on public.expeditions;
create trigger trg_expeditions_numero before insert on public.expeditions
  for each row execute function public.gerar_numero_expedition();
drop trigger if exists trg_expeditions_updated_at on public.expeditions;
create trigger trg_expeditions_updated_at before update on public.expeditions
  for each row execute function public.set_updated_at();

-- Junção NE↔expedição (soft-remove p/ histórico; 1 NE ativa numa só expedição)
create table if not exists public.expedition_notas (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  nota_id uuid not null references public.notas_encomenda(id) on delete cascade,
  ordem int not null default 0, removida_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_expedition_notas_ativa
  on public.expedition_notas(nota_id) where removida_em is null;
create index if not exists idx_expedition_notas_exp on public.expedition_notas(expedition_id);

-- Auditoria (ponto 14)
create table if not exists public.expedition_eventos (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  tipo text not null, nota_id uuid, detalhe text,
  user_id uuid, user_nome text, created_at timestamptz not null default now()
);
create index if not exists idx_expedition_eventos_exp on public.expedition_eventos(expedition_id, created_at desc);

-- Packing list ao nível da expedição (reutiliza módulo PL existente)
alter table public.packing_lists add column if not exists expedition_id uuid references public.expeditions(id) on delete set null;
create index if not exists idx_packing_lists_expedition on public.packing_lists(expedition_id);

-- RLS admin+administrativo
alter table public.expeditions_contador enable row level security;  -- sem políticas: só via função
do $$ declare t text; begin
  foreach t in array array['expeditions','expedition_notas','expedition_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t||'_acesso', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_administrativo_access()) with check (public.has_administrativo_access())', t||'_acesso', t);
  end loop; end $$;

-- Bucket privado da carta de porte da expedição
insert into storage.buckets (id,name,public) values ('expedicoes-docs','expedicoes-docs',false) on conflict (id) do nothing;
drop policy if exists expedicoes_docs_all on storage.objects;
create policy expedicoes_docs_all on storage.objects for all to authenticated
  using (bucket_id='expedicoes-docs' and public.has_administrativo_access())
  with check (bucket_id='expedicoes-docs' and public.has_administrativo_access());
