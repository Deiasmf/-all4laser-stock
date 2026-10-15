-- Ultraformer III pay-per-use — PARTE B: cartuchos geríveis + registo de pulsos (entrega/recolha).
-- RLS: tudo gerível por staff (is_staff). As assinaturas da clínica reutilizam o bucket
-- 'assinaturas' (via AssinaturaPad); fotos do ecrã de contadores e PDF da folha vão para
-- o bucket privado novo 'ultraformer-docs' (signed URLs).

-- 1) Catálogo de cartuchos (consumíveis, substituíveis: ativo/inativo). Cada físico tem S/N.
create table if not exists public.ultraformer_cartuchos (
  id              uuid primary key default gen_random_uuid(),
  area            text not null check (area in ('rosto','corpo')),
  profundidade_mm numeric(4,1) not null,
  serial_number   text,
  ativo           boolean not null default true,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists uf_cartuchos_ativo_idx on public.ultraformer_cartuchos(ativo);

-- Seed conforme a folha atual (S/N por preencher pelo staff). Só corre se vazio.
insert into public.ultraformer_cartuchos (area, profundidade_mm)
select v.area, v.prof
  from (values
    ('rosto', 1.5),('rosto', 2.0),('rosto', 3.0),('rosto', 4.5),
    ('corpo', 6.0),('corpo', 9.0),('corpo', 13.0)
  ) as v(area, prof)
 where not exists (select 1 from public.ultraformer_cartuchos);

-- 2) Registo por reserva (liga entrega + recolha da mesma reserva/aluguer).
create table if not exists public.ultraformer_registos (
  id                       uuid primary key default gen_random_uuid(),
  aluguer_id               uuid references public.alugueres(id) on delete set null,
  equipamento_id           uuid references public.equipamentos(id) on delete set null,
  serial_number            text,
  cliente_id               uuid references public.clientes(id) on delete set null,
  cliente_nome             text,
  stop_entrega_id          uuid references public.transport_stops(id) on delete set null,
  stop_recolha_id          uuid references public.transport_stops(id) on delete set null,
  estado                   text not null default 'entrega'
                           check (estado in ('entrega','recolhido','faturado')),
  -- entrega
  data_entrega             timestamptz,
  responsavel_entrega_id   uuid references public.profiles(id) on delete set null,
  responsavel_entrega_nome text,
  clinica_resp_entrega     text,
  clinica_validacao_entrega boolean not null default false,  -- checkbox presencial (quando sem assinatura)
  assinatura_entrega_caminho text,                            -- bucket 'assinaturas'
  foto_entrega_caminho     text,                              -- bucket 'ultraformer-docs'
  obs_entrega              text,
  -- recolha
  data_recolha             timestamptz,
  responsavel_recolha_id   uuid references public.profiles(id) on delete set null,
  responsavel_recolha_nome text,
  clinica_resp_recolha     text,
  clinica_validacao_recolha boolean not null default false,
  assinatura_recolha_caminho text,
  foto_recolha_caminho     text,
  obs_recolha              text,
  -- totais + cálculo (snapshot na recolha → recolhas passadas intactas)
  total_pulsos_rosto       int,
  total_pulsos_corpo       int,
  total_pulsos_geral       int,
  dias_aluguer             int,     -- nº de dias de aluguer desta reserva
  dias_mes_antes           int,     -- dias já acumulados do cliente no mês antes desta reserva (escalão)
  tarifario_id             uuid references public.ultraformer_tarifario(id) on delete set null,
  valor_total              numeric(12,2),
  valor_detalhe            jsonb,    -- breakdown por dia/escalão + mínimos aplicados
  pdf_caminho              text,     -- bucket 'ultraformer-docs'
  pedido_fatura_id         uuid references public.pedidos_fatura(id) on delete set null,
  criado_por               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists uf_registos_stop_entrega_uidx
  on public.ultraformer_registos(stop_entrega_id) where stop_entrega_id is not null;
create index if not exists uf_registos_aluguer_idx  on public.ultraformer_registos(aluguer_id);
create index if not exists uf_registos_cliente_idx  on public.ultraformer_registos(cliente_id);
create index if not exists uf_registos_equip_idx    on public.ultraformer_registos(equipamento_id);

-- 3) Linhas por cartucho a bordo (contadores entrega/recolha + pulsos usados).
create table if not exists public.ultraformer_registo_linhas (
  id                uuid primary key default gen_random_uuid(),
  registo_id        uuid not null references public.ultraformer_registos(id) on delete cascade,
  cartucho_id       uuid references public.ultraformer_cartuchos(id) on delete set null,
  area              text not null check (area in ('rosto','corpo')),  -- snapshot
  profundidade_mm   numeric(4,1),                                     -- snapshot
  serial_number     text,                                             -- snapshot
  contador_entrega  int not null,
  contador_recolha  int,
  pulsos_utilizados int generated always as
     (case when contador_recolha is null then null else contador_recolha - contador_entrega end) stored,
  override_regressao boolean not null default false,  -- contador recuou (troca de cartucho / reset)
  override_motivo    text,
  pulsos_corrigido   int,   -- usados efetivos quando o cálculo automático não se aplica
  ordem              int,
  created_at         timestamptz not null default now()
);
create index if not exists uf_registo_linhas_registo_idx on public.ultraformer_registo_linhas(registo_id);

-- RLS: operações geríveis por todo o staff.
alter table public.ultraformer_cartuchos        enable row level security;
alter table public.ultraformer_registos         enable row level security;
alter table public.ultraformer_registo_linhas   enable row level security;
grant select, insert, update, delete on public.ultraformer_cartuchos      to authenticated;
grant select, insert, update, delete on public.ultraformer_registos       to authenticated;
grant select, insert, update, delete on public.ultraformer_registo_linhas to authenticated;
grant all on public.ultraformer_cartuchos      to service_role;
grant all on public.ultraformer_registos       to service_role;
grant all on public.ultraformer_registo_linhas to service_role;

drop policy if exists uf_cartuchos_acesso on public.ultraformer_cartuchos;
create policy uf_cartuchos_acesso on public.ultraformer_cartuchos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists uf_registos_acesso on public.ultraformer_registos;
create policy uf_registos_acesso on public.ultraformer_registos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists uf_registo_linhas_acesso on public.ultraformer_registo_linhas;
create policy uf_registo_linhas_acesso on public.ultraformer_registo_linhas
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop trigger if exists trg_uf_cartuchos_updated_at on public.ultraformer_cartuchos;
create trigger trg_uf_cartuchos_updated_at before update on public.ultraformer_cartuchos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_uf_registos_updated_at on public.ultraformer_registos;
create trigger trg_uf_registos_updated_at before update on public.ultraformer_registos
  for each row execute function public.set_updated_at();

-- 4) Bucket privado para fotos do ecrã de contadores + PDF da folha (signed URLs).
insert into storage.buckets (id, name, public)
values ('ultraformer-docs', 'ultraformer-docs', false)
on conflict (id) do nothing;

drop policy if exists ultraformer_docs_select on storage.objects;
drop policy if exists ultraformer_docs_insert on storage.objects;
drop policy if exists ultraformer_docs_update on storage.objects;
drop policy if exists ultraformer_docs_delete on storage.objects;

create policy ultraformer_docs_select on storage.objects
  for select to authenticated using (bucket_id = 'ultraformer-docs' and public.is_staff());
create policy ultraformer_docs_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'ultraformer-docs' and public.is_staff());
create policy ultraformer_docs_update on storage.objects
  for update to authenticated using (bucket_id = 'ultraformer-docs' and public.is_staff())
  with check (bucket_id = 'ultraformer-docs' and public.is_staff());
create policy ultraformer_docs_delete on storage.objects
  for delete to authenticated using (bucket_id = 'ultraformer-docs' and public.is_staff());
