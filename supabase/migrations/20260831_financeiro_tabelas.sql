-- ───────────────────────────────────────────────────────────────────────────
-- FINANCEIRO — Folhas de Cálculo (tabelas criadas na app)
-- Permite ao financeiro criar tabelas do zero (definir colunas e linhas,
-- escrever nas células), guardar/editar, exportar (Excel/PDF), anexar um
-- ficheiro e enviar por email. Não substitui a importação — complementa-a.
--
-- Estrutura livre guardada em jsonb:
--   colunas: [{ "id": "c1", "nome": "Descrição" }, ...]
--   linhas:  [{ "c1": "texto", "c2": "123" }, ...]
--
-- RLS: só admin + financeiro (has_financeiro_access), como o resto do módulo.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.financeiro_tabelas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null default 'Nova tabela',
  colunas           jsonb not null default '[]'::jsonb,
  linhas            jsonb not null default '[]'::jsonb,
  notas             text,
  ficheiro_url      text,
  ficheiro_caminho  text,
  ficheiro_nome     text,
  criado_por        uuid references public.profiles(id) on delete set null,
  criado_por_nome   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_financeiro_tabelas_updated_at on public.financeiro_tabelas;
create trigger trg_financeiro_tabelas_updated_at
  before update on public.financeiro_tabelas
  for each row execute function public.set_updated_at();

create index if not exists idx_financeiro_tabelas_created on public.financeiro_tabelas(created_at desc);

-- RLS + grants (barreira efetiva = has_financeiro_access()).
alter table public.financeiro_tabelas enable row level security;
grant select, insert, update, delete on public.financeiro_tabelas to authenticated;
grant all on public.financeiro_tabelas to service_role;

drop policy if exists financeiro_tabelas_acesso on public.financeiro_tabelas;
create policy financeiro_tabelas_acesso on public.financeiro_tabelas
  for all to authenticated
  using (public.has_financeiro_access())
  with check (public.has_financeiro_access());

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE: bucket para anexos das tabelas (privado; acesso via signed URL)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('financeiro-tabelas-docs', 'financeiro-tabelas-docs', false)
on conflict (id) do nothing;

drop policy if exists financeiro_tabelas_docs_select on storage.objects;
drop policy if exists financeiro_tabelas_docs_insert on storage.objects;
drop policy if exists financeiro_tabelas_docs_update on storage.objects;
drop policy if exists financeiro_tabelas_docs_delete on storage.objects;
create policy financeiro_tabelas_docs_select on storage.objects for select to authenticated using (bucket_id = 'financeiro-tabelas-docs' and public.has_financeiro_access());
create policy financeiro_tabelas_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'financeiro-tabelas-docs' and public.has_financeiro_access());
create policy financeiro_tabelas_docs_update on storage.objects for update to authenticated using (bucket_id = 'financeiro-tabelas-docs' and public.has_financeiro_access()) with check (bucket_id = 'financeiro-tabelas-docs' and public.has_financeiro_access());
create policy financeiro_tabelas_docs_delete on storage.objects for delete to authenticated using (bucket_id = 'financeiro-tabelas-docs' and public.has_financeiro_access());
