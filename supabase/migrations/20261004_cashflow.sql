-- Mapa de Cashflow (previsão mensal de tesouraria). As entradas/saídas derivadas
-- (Laserix, alugueres, faturas, despesas de alugueres) são lidas AO VIVO dos
-- módulos existentes — não se duplicam aqui. Estas tabelas guardam só o que NÃO
-- tem módulo próprio: planos manuais, despesas fixas, pontuais e a configuração.
-- Tudo é dos dados mais sensíveis → RLS has_financeiro_access().

-- A) Categorias de despesa fixa (geríveis)
create table if not exists public.cashflow_expense_categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- B) Despesas fixas / recorrentes
create table if not exists public.cashflow_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria_id uuid references public.cashflow_expense_categories(id),
  valor numeric(14,2) not null,
  moeda text not null default 'EUR',
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','trimestral','anual')),
  dia_mes int check (dia_mes between 1 and 31),
  data_inicio date not null,
  data_fim date,
  ativo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists cashflow_rec_exp_ativo_idx on public.cashflow_recurring_expenses(ativo);

-- C) Planos de pagamento manuais (clientes sem módulo próprio, ex.: Weldon)
create table if not exists public.cashflow_payment_plans (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id),
  cliente_nome text,
  descricao text,
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','trimestral','datas_especificas')),
  valor_prestacao numeric(14,2),
  moeda text not null default 'EUR',
  data_inicio date,
  n_prestacoes int,
  data_fim date,
  estado text not null default 'ativo' check (estado in ('ativo','concluido','cancelado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

create table if not exists public.cashflow_payment_plan_prest (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.cashflow_payment_plans(id) on delete cascade,
  numero int not null,
  data_prevista date not null,
  valor numeric(14,2) not null,
  moeda text not null default 'EUR',
  estado text not null default 'previsto' check (estado in ('previsto','parcial','recebido')),
  valor_recebido numeric(14,2) not null default 0,
  data_recebimento date,
  bank_movement_id uuid references public.bank_movements(id) on delete set null,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists cashflow_plan_prest_plan_idx on public.cashflow_payment_plan_prest(plan_id);
create index if not exists cashflow_plan_prest_data_idx on public.cashflow_payment_plan_prest(data_prevista);

-- D) Entradas/saídas pontuais (previstas avulsas)
create table if not exists public.cashflow_manual_entries (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada','saida')),
  descricao text not null,
  cliente_id uuid references public.clientes(id),
  entidade_nome text,
  categoria text,
  valor numeric(14,2) not null,
  moeda text not null default 'EUR',
  data_prevista date not null,
  confianca text not null default 'confirmada' check (confianca in ('confirmada','provavel')),
  estado text not null default 'previsto' check (estado in ('previsto','realizado')),
  data_realizado date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);
create index if not exists cashflow_manual_data_idx on public.cashflow_manual_entries(data_prevista);

-- E) Configuração (singleton): caixa inicial, horizonte e prazo das faturas
create table if not exists public.cashflow_config (
  id int primary key default 1 check (id = 1),
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date,
  horizonte_meses int not null default 6 check (horizonte_meses between 1 and 24),
  prazo_fatura_dias int not null default 30,
  updated_at timestamptz not null default now(),
  updated_by_nome text
);
insert into public.cashflow_config (id, data_saldo_inicial) values (1, current_date)
  on conflict (id) do nothing;

-- Categorias-semente
insert into public.cashflow_expense_categories (nome, ordem) values
  ('Salários',1),('Renda',2),('Seguros',3),('Comunicações',4),('Contabilidade',5),
  ('Software/Subscrições',6),('Financiamentos',7),('Outras',8)
  on conflict (nome) do nothing;

-- updated_at automático
create or replace function public.cashflow_touch() returns trigger as $$
begin new.updated_at := now(); return new; end $$ language plpgsql;
do $$
declare t text;
begin
  foreach t in array array['cashflow_recurring_expenses','cashflow_payment_plans','cashflow_manual_entries'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.cashflow_touch()', t, t);
  end loop;
end $$;

-- RLS + GRANTS (admin/financeiro)
do $$
declare t text;
begin
  foreach t in array array[
    'cashflow_expense_categories','cashflow_recurring_expenses','cashflow_payment_plans',
    'cashflow_payment_plan_prest','cashflow_manual_entries','cashflow_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_fin on public.%I', t, t);
    execute format('create policy %I_fin on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
