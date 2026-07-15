-- Fase 1 do formulário público de registo de clientes.
-- Tabelas de suporte: submissões (staging/revisão) e moradas de entrega múltiplas.

-- 1) Submissões do formulário (staging / revisão). Nada entra em clientes sem aprovação.
create table if not exists public.registos_cliente (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                                   -- nome empresa / cliente
  nif text,
  email text,
  telefone text,
  contacto_nome text,
  morada text,                                          -- morada de faturação
  cidade text,
  codigo_postal text,
  pais text default 'Portugal',
  moradas_entrega jsonb not null default '[]'::jsonb,   -- [{etiqueta, morada, cidade, codigo_postal, pais}]
  observacoes text,
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','rejeitado')),
  cliente_id uuid references public.clientes(id) on delete set null,  -- preenchido ao aprovar
  motivo_rejeicao text,
  revisto_por uuid,
  revisto_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists registos_cliente_estado_idx on public.registos_cliente (estado, created_at desc);

-- 2) Moradas de entrega múltiplas por cliente (um espaço = uma linha)
create table if not exists public.cliente_moradas_entrega (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  etiqueta text,                                        -- nome do espaço (ex.: "Clínica Porto")
  morada text,
  cidade text,
  codigo_postal text,
  pais text default 'Portugal',
  created_at timestamptz not null default now()
);
create index if not exists cliente_moradas_entrega_cliente_idx on public.cliente_moradas_entrega (cliente_id);

-- RLS
alter table public.registos_cliente enable row level security;
alter table public.cliente_moradas_entrega enable row level security;

-- registos_cliente: só staff autenticado lê/gere. Submissões do formulário entram via API (service key, ignora RLS).
create policy registos_cliente_select on public.registos_cliente for select to authenticated using (true);
create policy registos_cliente_update on public.registos_cliente for update to authenticated using (true) with check (true);
create policy registos_cliente_delete on public.registos_cliente for delete to authenticated using (public.is_admin());

-- cliente_moradas_entrega: mesma lógica de acesso das clientes (staff autenticado)
create policy cme_select on public.cliente_moradas_entrega for select to authenticated using (true);
create policy cme_insert on public.cliente_moradas_entrega for insert to authenticated with check (true);
create policy cme_update on public.cliente_moradas_entrega for update to authenticated using (true) with check (true);
create policy cme_delete on public.cliente_moradas_entrega for delete to authenticated using (true);

-- Grants (service_role já herda via default privileges; garantir explicitamente authenticated)
grant select, insert, update, delete on public.registos_cliente to authenticated;
grant select, insert, update, delete on public.cliente_moradas_entrega to authenticated;
grant select, insert, update, delete on public.registos_cliente to service_role;
grant select, insert, update, delete on public.cliente_moradas_entrega to service_role;
