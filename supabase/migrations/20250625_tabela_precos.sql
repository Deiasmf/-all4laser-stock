-- Tabela de preços (preçário) — itens faturáveis (peças e consumíveis) com preço.
-- Usada no formulário de Envios de Encomendas, em conjunto com o Stock de Peças.
create table if not exists public.tabela_precos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text,
  referencia  text,
  preco       numeric not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_tabela_precos_updated_at on public.tabela_precos;
create trigger trg_tabela_precos_updated_at
  before update on public.tabela_precos
  for each row execute function public.set_updated_at();

create index if not exists idx_tabela_precos_nome on public.tabela_precos(nome);
create index if not exists idx_tabela_precos_categoria on public.tabela_precos(categoria);

alter table public.tabela_precos enable row level security;
drop policy if exists tabela_precos_select on public.tabela_precos;
drop policy if exists tabela_precos_insert on public.tabela_precos;
drop policy if exists tabela_precos_update on public.tabela_precos;
drop policy if exists tabela_precos_delete on public.tabela_precos;
create policy tabela_precos_select on public.tabela_precos for select to authenticated using (true);
create policy tabela_precos_insert on public.tabela_precos for insert to authenticated with check (is_admin());
create policy tabela_precos_update on public.tabela_precos for update to authenticated using (is_admin()) with check (is_admin());
create policy tabela_precos_delete on public.tabela_precos for delete to authenticated using (is_admin());

grant select, insert, update, delete on public.tabela_precos to authenticated;
