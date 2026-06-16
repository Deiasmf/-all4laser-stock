-- Bucket público para os PDFs das folhas de obra
insert into storage.buckets (id, name, public)
values ('folhas-obra-docs', 'folhas-obra-docs', true)
on conflict (id) do nothing;

drop policy if exists folhas_obra_docs_insert on storage.objects;
drop policy if exists folhas_obra_docs_update on storage.objects;
drop policy if exists folhas_obra_docs_delete on storage.objects;

create policy folhas_obra_docs_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'folhas-obra-docs');
create policy folhas_obra_docs_update on storage.objects
  for update to authenticated using (bucket_id = 'folhas-obra-docs') with check (bucket_id = 'folhas-obra-docs');
create policy folhas_obra_docs_delete on storage.objects
  for delete to authenticated using (bucket_id = 'folhas-obra-docs' and is_admin());
