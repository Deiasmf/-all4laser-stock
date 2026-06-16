-- Bucket público para as fotos das folhas de obra
insert into storage.buckets (id, name, public)
values ('folhas-obra-fotos', 'folhas-obra-fotos', true)
on conflict (id) do nothing;

drop policy if exists folhas_obra_fotos_insert on storage.objects;
drop policy if exists folhas_obra_fotos_delete on storage.objects;

create policy folhas_obra_fotos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'folhas-obra-fotos');
create policy folhas_obra_fotos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'folhas-obra-fotos');
