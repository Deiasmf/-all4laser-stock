-- Módulo Alugueres — Central de Leads
-- Tabela para centralizar pedidos de novos clientes (vários canais).

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  email            text,
  telefone         text,
  cidade           text,
  mensagem         text,
  canal            text not null default 'website'
                     check (canal in ('website','email','facebook','instagram')),
  modelo_interesse text,
  data_inicio      date,                       -- data pretendida (início)
  data_fim         date,                       -- data pretendida (fim)
  estado           text not null default 'nova'
                     check (estado in ('nova','contactada','proposta_enviada','convertida','perdida')),
  nota_interna     text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists idx_leads_estado on public.leads(estado);
create index if not exists idx_leads_canal  on public.leads(canal);
create index if not exists idx_leads_data   on public.leads(created_at desc);

-- RLS: a equipa autenticada lê e gere as leads; eliminar só admin.
alter table public.leads enable row level security;

drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

create policy leads_select on public.leads
  for select to authenticated using (true);
create policy leads_insert on public.leads
  for insert to authenticated with check (true);
create policy leads_update on public.leads
  for update to authenticated using (true) with check (true);
create policy leads_delete on public.leads
  for delete to authenticated using (is_admin());

-- GRANTs: tabelas criadas por SQL não recebem privilégios automáticos.
-- (A submissão pública do website usará a service role no servidor, que
--  ignora a RLS — não é preciso conceder nada ao anon.)
grant select, insert, update, delete on public.leads to authenticated;
