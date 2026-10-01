-- Fase 2 dos Processos de Equipamentos (parceria, ex.: Laserix): incidências e
-- dossiê documental por processo (= por consignação/equipamento).
--
-- Ao contrário dos valores financeiros (cc_* = has_financeiro_access), o dossiê
-- é OPERACIONAL (avarias, transporte, fotos, documentos) e não expõe custos nem
-- margens → RLS is_staff() (todo o staff pode gerir), conforme decidido na Fase 1.
-- As fotos/documentos ficam num bucket PRIVADO com signed URLs.

-- ── Incidências ──────────────────────────────────────────────────────────────
create table if not exists public.cc_incidencias (
  id              uuid primary key default gen_random_uuid(),
  consignacao_id  uuid not null references public.cc_consignacoes(id) on delete cascade,
  titulo          text not null,
  descricao       text,
  tipo            text not null default 'outro'
                    check (tipo in ('avaria','transporte','pagamento','documentacao','outro')),
  gravidade       text not null default 'media'
                    check (gravidade in ('baixa','media','alta')),
  estado          text not null default 'aberta'
                    check (estado in ('aberta','em_resolucao','resolvida','fechada')),
  data_abertura   date not null default current_date,
  data_resolucao  date,
  resolucao       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  criado_por      uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists cc_incidencias_consignacao_idx on public.cc_incidencias(consignacao_id);
create index if not exists cc_incidencias_estado_idx on public.cc_incidencias(estado);

create table if not exists public.cc_incidencia_fotos (
  id             uuid primary key default gen_random_uuid(),
  incidencia_id  uuid not null references public.cc_incidencias(id) on delete cascade,
  url            text not null,
  caminho        text not null,
  nome           text,
  created_at     timestamptz not null default now()
);
create index if not exists cc_incidencia_fotos_incidencia_idx on public.cc_incidencia_fotos(incidencia_id);

-- ── Documentos do processo (uploads manuais do dossiê) ───────────────────────
create table if not exists public.cc_processo_documentos (
  id              uuid primary key default gen_random_uuid(),
  consignacao_id  uuid not null references public.cc_consignacoes(id) on delete cascade,
  url             text not null,
  caminho         text not null,
  nome            text,
  tipo            text not null default 'documento'
                    check (tipo in ('foto','documento')),
  created_at      timestamptz not null default now(),
  criado_por      uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists cc_processo_documentos_consignacao_idx on public.cc_processo_documentos(consignacao_id);

-- ── RLS: todo o staff gere o dossiê ──────────────────────────────────────────
alter table public.cc_incidencias enable row level security;
alter table public.cc_incidencia_fotos enable row level security;
alter table public.cc_processo_documentos enable row level security;

drop policy if exists cc_incidencias_staff on public.cc_incidencias;
create policy cc_incidencias_staff on public.cc_incidencias
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists cc_incidencia_fotos_staff on public.cc_incidencia_fotos;
create policy cc_incidencia_fotos_staff on public.cc_incidencia_fotos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists cc_processo_documentos_staff on public.cc_processo_documentos;
create policy cc_processo_documentos_staff on public.cc_processo_documentos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- GRANTs ao papel authenticated (sem isto, a RLS não chega: "permission denied")
do $$
declare t text;
begin
  foreach t in array array['cc_incidencias','cc_incidencia_fotos','cc_processo_documentos'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- updated_at automático nas incidências (reutiliza o trigger genérico se existir)
create or replace function public.cc_incidencias_touch() returns trigger as $$
begin new.updated_at := now(); return new; end $$ language plpgsql;
drop trigger if exists cc_incidencias_touch on public.cc_incidencias;
create trigger cc_incidencias_touch before update on public.cc_incidencias
  for each row execute function public.cc_incidencias_touch();

-- ── Bucket privado para fotos/documentos do dossiê (signed URLs) ─────────────
insert into storage.buckets (id, name, public)
  values ('cc-processos-docs', 'cc-processos-docs', false)
  on conflict (id) do nothing;

drop policy if exists cc_docs_select on storage.objects;
create policy cc_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'cc-processos-docs' and public.is_staff());

drop policy if exists cc_docs_insert on storage.objects;
create policy cc_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cc-processos-docs' and public.is_staff());

drop policy if exists cc_docs_update on storage.objects;
create policy cc_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'cc-processos-docs' and public.is_staff())
  with check (bucket_id = 'cc-processos-docs' and public.is_staff());

drop policy if exists cc_docs_delete on storage.objects;
create policy cc_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'cc-processos-docs' and public.is_staff());
