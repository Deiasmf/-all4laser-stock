-- ───────────────────────────────────────────────────────────────────────────
-- COFRE DE DOCUMENTOS — repositório de documentos importantes da empresa
-- (cartões, contas bancárias, certidões, contratos, seguros, ...).
-- Bucket privado, RLS admin+financeiro, log de acessos auditável (só admin lê).
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.financial_document_categories (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.financial_document_categories (nome, ordem) values
  ('Cartões', 1), ('Contas Bancárias', 2), ('Certidões', 3),
  ('Contratos', 4), ('Seguros', 5), ('Outros', 6)
on conflict (nome) do nothing;

create table if not exists public.financial_documents (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  categoria_id    uuid references public.financial_document_categories(id),
  descricao       text,
  data_validade   date,
  entidade_nome   text,
  arquivado       boolean not null default false,
  created_by      uuid,
  created_by_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_findoc_categoria on public.financial_documents(categoria_id);
create index if not exists idx_findoc_arquivado on public.financial_documents(arquivado);
create index if not exists idx_findoc_validade  on public.financial_documents(data_validade);

drop trigger if exists trg_findoc_touch on public.financial_documents;
create trigger trg_findoc_touch before update on public.financial_documents
  for each row execute function public.financeiro_touch_updated_at();

create table if not exists public.financial_document_files (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.financial_documents(id) on delete cascade,
  caminho      text not null,
  nome         text,
  tamanho      bigint,
  content_type text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_findoc_files_doc on public.financial_document_files(document_id);

create table if not exists public.financial_document_access_log (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid references public.financial_documents(id) on delete set null,
  document_titulo text,
  file_id         uuid,
  acao            text not null check (acao in ('view','download')),
  user_id         uuid,
  user_nome       text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_findoc_log_doc  on public.financial_document_access_log(document_id);
create index if not exists idx_findoc_log_data on public.financial_document_access_log(created_at);

-- RLS: categorias/documentos/ficheiros para admin+financeiro.
do $$
declare t text;
begin
  foreach t in array array['financial_document_categories','financial_documents','financial_document_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())',
      t || '_acesso', t
    );
  end loop;
end $$;

-- Log: insere admin/financeiro; LÊ só admin (auditoria).
alter table public.financial_document_access_log enable row level security;
grant select, insert on public.financial_document_access_log to authenticated;
grant all on public.financial_document_access_log to service_role;
drop policy if exists findoc_log_insert on public.financial_document_access_log;
drop policy if exists findoc_log_select on public.financial_document_access_log;
create policy findoc_log_insert on public.financial_document_access_log
  for insert to authenticated with check (public.has_financeiro_access());
create policy findoc_log_select on public.financial_document_access_log
  for select to authenticated using (public.is_admin());

-- Bucket privado + policies (só admin+financeiro).
insert into storage.buckets (id, name, public)
values ('financial-docs', 'financial-docs', false)
on conflict (id) do nothing;

drop policy if exists financial_docs_select on storage.objects;
drop policy if exists financial_docs_insert on storage.objects;
drop policy if exists financial_docs_update on storage.objects;
drop policy if exists financial_docs_delete on storage.objects;
create policy financial_docs_select on storage.objects
  for select to authenticated using (bucket_id = 'financial-docs' and public.has_financeiro_access());
create policy financial_docs_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'financial-docs' and public.has_financeiro_access());
create policy financial_docs_update on storage.objects
  for update to authenticated using (bucket_id = 'financial-docs' and public.has_financeiro_access())
  with check (bucket_id = 'financial-docs' and public.has_financeiro_access());
create policy financial_docs_delete on storage.objects
  for delete to authenticated using (bucket_id = 'financial-docs' and public.has_financeiro_access());
