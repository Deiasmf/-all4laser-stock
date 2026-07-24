-- ───────────────────────────────────────────────────────────────────────────
-- MÓDULO FINANCEIRO — tabelas base (mínimas, a crescer nos próximos prompts)
-- Todas com RLS: acesso só a admin + financeiro via has_financeiro_access().
-- A proteção real está aqui (RLS), não em esconder menus no frontend.
-- ───────────────────────────────────────────────────────────────────────────

-- Contas correntes (saldo por entidade: cliente ou fornecedor)
create table if not exists public.financeiro_contas_correntes (
  id            uuid primary key default gen_random_uuid(),
  entidade_tipo text not null check (entidade_tipo in ('cliente','fornecedor')),
  entidade_id   uuid,
  entidade_nome text,
  saldo         numeric(12,2) not null default 0,
  moeda         text not null default 'EUR',
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Documentos financeiros (faturas, recibos, notas de crédito, ...)
create table if not exists public.financeiro_documentos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text,
  numero        text,
  entidade_nome text,
  valor         numeric(12,2),
  data          date,
  estado        text,
  ficheiro_url  text,
  created_at    timestamptz not null default now()
);

-- Integração Keyinvoice (log/estado de sincronização)
create table if not exists public.financeiro_keyinvoice_sync (
  id                 uuid primary key default gen_random_uuid(),
  recurso            text,
  referencia_externa text,
  estado             text,
  payload            jsonb,
  sincronizado_em    timestamptz,
  created_at         timestamptz not null default now()
);

-- Recolhas (cobranças / recolha de valores)
create table if not exists public.financeiro_recolhas (
  id         uuid primary key default gen_random_uuid(),
  descricao  text,
  valor      numeric(12,2),
  data       date,
  estado     text,
  created_at timestamptz not null default now()
);

-- Alertas financeiros (vencimentos, saldos, divergências, ...)
create table if not exists public.financeiro_alertas (
  id         uuid primary key default gen_random_uuid(),
  tipo       text,
  mensagem   text,
  severidade text not null default 'info',
  resolvido  boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS + grants para todas as tabelas financeiro_*.
-- O GRANT ao authenticated é necessário (senão dá "permission denied" antes da
-- RLS), mas a barreira efetiva é a política has_financeiro_access().
do $$
declare t text;
begin
  foreach t in array array[
    'financeiro_contas_correntes',
    'financeiro_documentos',
    'financeiro_keyinvoice_sync',
    'financeiro_recolhas',
    'financeiro_alertas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())',
      t || '_acesso', t
    );
  end loop;
end $$;
