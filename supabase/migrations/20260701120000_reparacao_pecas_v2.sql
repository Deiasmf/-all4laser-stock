-- Reparação de Peças v2 — processo completo
-- Expande a tabela reparacao_pecas e cria tabelas de apoio (itens sem SN,
-- movimentos, fornecedores de reparação) + numeração automática RPC-YYYY-NNNN.
-- (Nome do ficheiro com data 2026-07 para ordenar DEPOIS da criação da tabela
--  base em 20260630120000_reparacao_pecas.sql.)

-- ── Colunas novas em reparacao_pecas ──
alter table public.reparacao_pecas add column if not exists numero text unique;
alter table public.reparacao_pecas add column if not exists tipo_dono text check (tipo_dono in ('nossa','cliente')) default 'nossa';
alter table public.reparacao_pecas add column if not exists cliente_id uuid references public.clientes(id);
alter table public.reparacao_pecas add column if not exists cliente_nome text;
alter table public.reparacao_pecas add column if not exists equipamento_sn text;
alter table public.reparacao_pecas add column if not exists peca_id uuid references public.pecas(id);
alter table public.reparacao_pecas add column if not exists tem_sn boolean default false;
alter table public.reparacao_pecas add column if not exists sn_avariado text;
alter table public.reparacao_pecas add column if not exists sn_substituto text;
alter table public.reparacao_pecas add column if not exists qr_code text;
alter table public.reparacao_pecas add column if not exists tipo_garantia text check (tipo_garantia in ('sem_garantia','garantia_nossa','garantia_fabricante','garantia_fornecedor_servico'));
alter table public.reparacao_pecas add column if not exists responsavel_pagamento text check (responsavel_pagamento in ('cliente','all4laser','fabricante','fornecedor_servico'));
alter table public.reparacao_pecas add column if not exists valor_reparacao numeric;
alter table public.reparacao_pecas add column if not exists faturado_cliente boolean default false;
alter table public.reparacao_pecas add column if not exists substituta_enviada boolean default false;
alter table public.reparacao_pecas add column if not exists substituta_peca_id uuid references public.pecas(id);
alter table public.reparacao_pecas add column if not exists substituta_sn text;
alter table public.reparacao_pecas add column if not exists cliente_enviou_avariada boolean default false;
alter table public.reparacao_pecas add column if not exists data_cliente_enviou date;
alter table public.reparacao_pecas add column if not exists notas text;
alter table public.reparacao_pecas add column if not exists criado_por_nome text;

create index if not exists idx_reparacao_pecas_numero    on public.reparacao_pecas(numero);
create index if not exists idx_reparacao_pecas_tipo_dono on public.reparacao_pecas(tipo_dono);
create index if not exists idx_reparacao_pecas_cliente   on public.reparacao_pecas(cliente_id);

-- ── Itens de reparação (várias peças sem SN, ex.: 3 fibras) ──
create table if not exists public.reparacao_pecas_itens (
  id                 uuid primary key default gen_random_uuid(),
  reparacao_id       uuid references public.reparacao_pecas(id) on delete cascade,
  descricao          text not null,
  peca_id            uuid references public.pecas(id),
  quantidade_saida   integer default 1,
  quantidade_entrada integer default 0,
  estado             text check (estado in ('em_reparacao','reparada','nao_reparavel')) default 'em_reparacao',
  created_at         timestamptz default now()
);
create index if not exists idx_rep_itens_reparacao on public.reparacao_pecas_itens(reparacao_id);

-- ── Movimentos (log de saídas/entradas) ──
create table if not exists public.reparacao_pecas_movimentos (
  id             uuid primary key default gen_random_uuid(),
  reparacao_id   uuid references public.reparacao_pecas(id) on delete cascade,
  tipo           text check (tipo in ('saida','entrada','substituta_enviada','avariada_recebida')),
  data           date not null default current_date,
  quantidade     integer default 1,
  sn             text,
  notas          text,
  criado_por     uuid references auth.users(id),
  criado_por_nome text,
  created_at     timestamptz default now()
);
create index if not exists idx_rep_mov_reparacao on public.reparacao_pecas_movimentos(reparacao_id);

-- ── Fornecedores de reparação ──
create table if not exists public.fornecedores_reparacao (
  id         uuid primary key default gen_random_uuid(),
  nome       text unique not null,
  email      text,
  telefone   text,
  notas      text,
  ativo      boolean default true,
  created_at timestamptz default now()
);

insert into public.fornecedores_reparacao (nome) values
  ('Meditek'), ('Repair4Laser'), ('Physio Equip')
on conflict (nome) do nothing;

-- ── Contador para numeração automática ──
create table if not exists public.reparacao_pecas_contador (
  ano    integer primary key,
  ultimo integer default 0
);

-- ── Função + trigger: número RPC-YYYY-NNNN ──
create or replace function public.gerar_numero_reparacao_peca()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ano_atual integer := extract(year from now());
  proximo   integer;
begin
  insert into public.reparacao_pecas_contador (ano, ultimo)
  values (ano_atual, 1)
  on conflict (ano) do update set ultimo = public.reparacao_pecas_contador.ultimo + 1
  returning ultimo into proximo;
  new.numero := 'RPC-' || ano_atual || '-' || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trigger_numero_reparacao_peca on public.reparacao_pecas;
create trigger trigger_numero_reparacao_peca
  before insert on public.reparacao_pecas
  for each row
  when (new.numero is null)
  execute function public.gerar_numero_reparacao_peca();

-- ── RLS: SELECT/INSERT/UPDATE para autenticados nas novas tabelas ──
alter table public.reparacao_pecas_itens      enable row level security;
alter table public.reparacao_pecas_movimentos enable row level security;
alter table public.fornecedores_reparacao     enable row level security;
alter table public.reparacao_pecas_contador   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'reparacao_pecas_itens','reparacao_pecas_movimentos','fornecedores_reparacao','reparacao_pecas_contador'
  ] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
