-- Fotos dos pedidos de compra
-- Permite anexar fotos a um pedido de compra (ex.: foto da peça a comprar).
-- Bucket publico dedicado + tabela ligada ao pedido. Gestao por is_staff().

create table if not exists public.pedidos_compra_fotos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_compra(id) on delete cascade,
  url text not null,
  caminho text not null,
  created_at timestamptz not null default now()
);
create index if not exists pedidos_compra_fotos_pedido_idx on public.pedidos_compra_fotos (pedido_id);

alter table public.pedidos_compra_fotos enable row level security;
grant select, insert, update, delete on public.pedidos_compra_fotos to authenticated;
grant all on public.pedidos_compra_fotos to service_role;

drop policy if exists pedidos_compra_fotos_staff on public.pedidos_compra_fotos;
create policy pedidos_compra_fotos_staff on public.pedidos_compra_fotos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Bucket publico dedicado as fotos de compras.
insert into storage.buckets (id, name, public)
values ('compras-fotos','compras-fotos', true)
on conflict (id) do nothing;

drop policy if exists compras_fotos_storage_staff on storage.objects;
create policy compras_fotos_storage_staff on storage.objects for all to authenticated
  using (bucket_id = 'compras-fotos' and public.is_staff())
  with check (bucket_id = 'compras-fotos' and public.is_staff());
