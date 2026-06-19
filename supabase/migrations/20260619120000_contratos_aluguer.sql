-- Contratos de aluguer — documentos (PDF/imagem) dos contratos, separados por
-- mercado: nacional e internacional. Segue os padrões dos módulos Folhas de
-- Obra / Notas de Encomenda (tabela + bucket público com caminho aleatório).

-- ───────────────────────────────────────────────────────────────────────────
-- contratos_aluguer — uma linha por contrato (com o respetivo ficheiro)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.contratos_aluguer (
  id               uuid primary key default gen_random_uuid(),
  nacional         boolean not null default true,
  titulo           text not null,
  cliente_nome     text,
  serial_number    text,
  notas            text,
  ficheiro_url     text,
  ficheiro_caminho text,
  ficheiro_nome    text,
  criado_por       uuid references auth.users(id),
  criado_por_nome  text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_contratos_aluguer_nacional on public.contratos_aluguer(nacional);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — leitura/escrita (select/insert/update) para autenticados; apagar admin
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contratos_aluguer enable row level security;

drop policy if exists contratos_aluguer_select on public.contratos_aluguer;
drop policy if exists contratos_aluguer_insert on public.contratos_aluguer;
drop policy if exists contratos_aluguer_update on public.contratos_aluguer;
drop policy if exists contratos_aluguer_delete on public.contratos_aluguer;

create policy contratos_aluguer_select on public.contratos_aluguer
  for select to authenticated using (true);
create policy contratos_aluguer_insert on public.contratos_aluguer
  for insert to authenticated with check (true);
create policy contratos_aluguer_update on public.contratos_aluguer
  for update to authenticated using (true) with check (true);
create policy contratos_aluguer_delete on public.contratos_aluguer
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on public.contratos_aluguer to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE — bucket público para os ficheiros dos contratos
-- (URL com caminho aleatório; mesmo padrão das folhas de obra)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('contratos-aluguer', 'contratos-aluguer', true)
on conflict (id) do nothing;

drop policy if exists contratos_aluguer_storage_select on storage.objects;
drop policy if exists contratos_aluguer_storage_insert on storage.objects;
drop policy if exists contratos_aluguer_storage_delete on storage.objects;

create policy contratos_aluguer_storage_select on storage.objects
  for select using (bucket_id = 'contratos-aluguer');
create policy contratos_aluguer_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'contratos-aluguer');
create policy contratos_aluguer_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'contratos-aluguer' and is_admin());
