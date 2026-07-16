-- Fotos dos envios (várias por envio), preenchidas na ficha depois de criar.
-- Os ficheiros ficam no bucket já existente 'envios-pecas-docs' com prefixo fotos/.
create table if not exists public.envios_pecas_fotos (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios_pecas(id) on delete cascade,
  url text not null,
  caminho text not null,
  created_at timestamptz not null default now()
);
create index if not exists envios_pecas_fotos_envio_idx on public.envios_pecas_fotos (envio_id);

alter table public.envios_pecas_fotos enable row level security;
create policy epf_select on public.envios_pecas_fotos for select to authenticated using (true);
create policy epf_insert on public.envios_pecas_fotos for insert to authenticated with check (true);
create policy epf_delete on public.envios_pecas_fotos for delete to authenticated using (true);

grant select, insert, update, delete on public.envios_pecas_fotos to authenticated;
grant select, insert, update, delete on public.envios_pecas_fotos to service_role;
