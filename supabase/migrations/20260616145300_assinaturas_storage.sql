-- Bucket público para assinaturas das folhas de obra (técnico + cliente)
insert into storage.buckets (id, name, public)
values ('assinaturas', 'assinaturas', true)
on conflict (id) do nothing;

-- Inserção por autenticados; leitura é pública (bucket público); eliminar só admin
drop policy if exists assinaturas_insert on storage.objects;
drop policy if exists assinaturas_update on storage.objects;
drop policy if exists assinaturas_delete on storage.objects;

create policy assinaturas_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'assinaturas');
create policy assinaturas_update on storage.objects
  for update to authenticated using (bucket_id = 'assinaturas') with check (bucket_id = 'assinaturas');
create policy assinaturas_delete on storage.objects
  for delete to authenticated using (bucket_id = 'assinaturas' and is_admin());
