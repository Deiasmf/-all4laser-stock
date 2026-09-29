-- Notas internas da página de Cliente 360º (única secção com escrita própria).
-- Timeline de notas livres sobre o cliente (quem/quando). RLS: is_staff() lê e escreve.

create table if not exists public.cliente_notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  texto text not null,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);
create index if not exists cliente_notas_cliente_idx on public.cliente_notas (cliente_id, created_at desc);

alter table public.cliente_notas enable row level security;
grant select, insert, update, delete on public.cliente_notas to authenticated;
grant all on public.cliente_notas to service_role;

drop policy if exists cliente_notas_staff on public.cliente_notas;
create policy cliente_notas_staff on public.cliente_notas
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
