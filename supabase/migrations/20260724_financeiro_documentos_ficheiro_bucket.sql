-- ───────────────────────────────────────────────────────────────────────────
-- DOCUMENTOS FINANCEIROS — PDF anexo a cada movimento (fatura/recibo/NC).
-- Um documento financeiro é uma linha de financeiro_movimentos; aqui só se
-- acrescenta o ficheiro. Bucket privado, acesso só admin+financeiro.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.financeiro_movimentos
  add column if not exists ficheiro_caminho text,
  add column if not exists ficheiro_nome text;

-- Placeholder vazio da fase base, substituído por esta vista sobre os movimentos.
drop table if exists public.financeiro_documentos;

-- Bucket privado para os PDFs (o URL é sempre assinado; nada público).
insert into storage.buckets (id, name, public)
values ('financeiro-docs', 'financeiro-docs', false)
on conflict (id) do nothing;

-- RLS do Storage: só admin+financeiro mexem neste bucket.
drop policy if exists financeiro_docs_select on storage.objects;
drop policy if exists financeiro_docs_insert on storage.objects;
drop policy if exists financeiro_docs_update on storage.objects;
drop policy if exists financeiro_docs_delete on storage.objects;

create policy financeiro_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'financeiro-docs' and public.has_financeiro_access());
create policy financeiro_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'financeiro-docs' and public.has_financeiro_access());
create policy financeiro_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'financeiro-docs' and public.has_financeiro_access())
  with check (bucket_id = 'financeiro-docs' and public.has_financeiro_access());
create policy financeiro_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'financeiro-docs' and public.has_financeiro_access());
