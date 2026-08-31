-- STOCK DE PEÇAS — fotografias por artigo (espelha o padrão dos equipamentos).
create table if not exists public.pecas_media (
  id              uuid primary key default gen_random_uuid(),
  peca_id         uuid not null references public.pecas(id) on delete cascade,
  url             text not null,
  caminho         text not null,
  nome            text,
  tipo            text not null default 'foto',
  ordem           integer not null default 0,
  capa            boolean not null default false,
  criado_por      uuid,
  criado_por_nome text,
  created_at      timestamptz not null default now()
);
-- Uma só capa por peça.
create unique index if not exists pecas_media_capa_uidx
  on public.pecas_media (peca_id) where capa;
create index if not exists pecas_media_peca_idx on public.pecas_media (peca_id);

alter table public.pecas_media enable row level security;
drop policy if exists pecas_media_rw on public.pecas_media;
create policy pecas_media_rw on public.pecas_media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.pecas_media to authenticated;

-- Bucket público (leitura), como o dos equipamentos; escrita só staff (políticas abaixo).
insert into storage.buckets (id, name, public) values ('pecas-media', 'pecas-media', true)
on conflict (id) do nothing;

drop policy if exists pecas_media_storage_insert on storage.objects;
create policy pecas_media_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'pecas-media' and public.is_staff());
drop policy if exists pecas_media_storage_update on storage.objects;
create policy pecas_media_storage_update on storage.objects
  for update to authenticated using (bucket_id = 'pecas-media' and public.is_staff())
  with check (bucket_id = 'pecas-media' and public.is_staff());
drop policy if exists pecas_media_storage_delete on storage.objects;
create policy pecas_media_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'pecas-media' and public.is_staff());
