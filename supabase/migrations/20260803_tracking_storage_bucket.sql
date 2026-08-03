-- Bucket privado para cartas de porte carregadas manualmente no separador
-- Tracking. Acesso (RLS em storage.objects) só a admin + administrativo.
insert into storage.buckets (id, name, public)
  values ('tracking-docs', 'tracking-docs', false)
  on conflict (id) do nothing;

drop policy if exists tracking_docs_select on storage.objects;
create policy tracking_docs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tracking-docs' and public.has_administrativo_access());

drop policy if exists tracking_docs_insert on storage.objects;
create policy tracking_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tracking-docs' and public.has_administrativo_access());

drop policy if exists tracking_docs_update on storage.objects;
create policy tracking_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'tracking-docs' and public.has_administrativo_access())
  with check (bucket_id = 'tracking-docs' and public.has_administrativo_access());

drop policy if exists tracking_docs_delete on storage.objects;
create policy tracking_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tracking-docs' and public.has_administrativo_access());
