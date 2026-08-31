-- ───────────────────────────────────────────────────────────────────────────
-- PEDIDOS DE FATURA / PRÓ-FORMA
-- Fluxo: um colega pede um documento (fatura ou pró-forma) ao departamento
-- financeiro, indicando cliente, descrição e valor. O financeiro emite,
-- anexa o documento e (opcionalmente) envia-o direto ao cliente por email.
-- Monitorização por estado: não realizado → a realizar → realizado →
-- enviado ao cliente. Confirmação de pagamento à parte (pago + data).
--
-- RLS:
--   • Qualquer staff (is_staff) vê os pedidos e pode criar os seus.
--   • O criador pode editar/apagar enquanto o pedido é seu.
--   • O financeiro (has_financeiro_access) trata de tudo (emitir, anexar,
--     mudar estado, confirmar pagamento).
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.pedidos_fatura (
  id                uuid primary key default gen_random_uuid(),
  numero            text unique,                       -- PF-YYYY-NNNN (trigger)
  tipo              text not null default 'fatura'
                      check (tipo in ('fatura','pro_forma')),
  estado            text not null default 'nao_realizado'
                      check (estado in ('nao_realizado','a_realizar','realizado','enviado_cliente')),
  -- Preenchido por quem pede
  cliente_id        uuid references public.clientes(id) on delete set null,
  cliente_nome      text not null,
  cliente_email     text,
  descricao         text not null,
  valor             numeric(12,2),
  -- Documento emitido pelo financeiro
  documento_url     text,
  documento_caminho text,
  -- Envio ao cliente
  enviado_em        timestamptz,
  -- Pagamento
  pago              boolean not null default false,
  data_pagamento    date,
  -- Metadados
  notas             text,
  criado_por        uuid references public.profiles(id) on delete set null,
  criado_por_nome   text,
  responsavel_id    uuid references public.profiles(id) on delete set null,
  responsavel_nome  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Numeração automática: PF-YYYY-NNNN (sequência por ano, reinicia em 0001) ──
create table if not exists public.pedidos_fatura_contador (
  ano    int primary key,
  ultimo int not null default 0
);

create or replace function public.gerar_numero_pedido_fatura()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano int;
  v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.created_at, now()))::int;

  insert into public.pedidos_fatura_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'PF-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_pedidos_fatura_numero on public.pedidos_fatura;
create trigger trg_pedidos_fatura_numero
  before insert on public.pedidos_fatura
  for each row execute function public.gerar_numero_pedido_fatura();

drop trigger if exists trg_pedidos_fatura_updated_at on public.pedidos_fatura;
create trigger trg_pedidos_fatura_updated_at
  before update on public.pedidos_fatura
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_pedidos_fatura_numero  on public.pedidos_fatura(numero);
create index if not exists idx_pedidos_fatura_estado  on public.pedidos_fatura(estado);
create index if not exists idx_pedidos_fatura_criado  on public.pedidos_fatura(criado_por);
create index if not exists idx_pedidos_fatura_created on public.pedidos_fatura(created_at desc);

-- ── RLS ──
alter table public.pedidos_fatura          enable row level security;
alter table public.pedidos_fatura_contador enable row level security; -- sem políticas: só via função

grant select, insert, update, delete on public.pedidos_fatura to authenticated;
grant all on public.pedidos_fatura to service_role;

drop policy if exists pedidos_fatura_select on public.pedidos_fatura;
drop policy if exists pedidos_fatura_insert on public.pedidos_fatura;
drop policy if exists pedidos_fatura_update on public.pedidos_fatura;
drop policy if exists pedidos_fatura_delete on public.pedidos_fatura;

-- Ver: qualquer staff interno.
create policy pedidos_fatura_select on public.pedidos_fatura
  for select to authenticated
  using (public.is_staff());

-- Criar: staff, e o registo tem de ficar em nome do próprio.
create policy pedidos_fatura_insert on public.pedidos_fatura
  for insert to authenticated
  with check (public.is_staff() and criado_por = auth.uid());

-- Editar: o financeiro (trata do fluxo) ou o próprio criador.
create policy pedidos_fatura_update on public.pedidos_fatura
  for update to authenticated
  using (public.has_financeiro_access() or criado_por = auth.uid())
  with check (public.has_financeiro_access() or criado_por = auth.uid());

-- Apagar: admin ou o próprio criador.
create policy pedidos_fatura_delete on public.pedidos_fatura
  for delete to authenticated
  using (public.is_admin() or criado_por = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE: bucket para os documentos emitidos (fatura / pró-forma em PDF, etc.)
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('pedidos-fatura-docs', 'pedidos-fatura-docs', true)
on conflict (id) do nothing;

drop policy if exists pedidos_fatura_docs_select on storage.objects;
drop policy if exists pedidos_fatura_docs_insert on storage.objects;
drop policy if exists pedidos_fatura_docs_update on storage.objects;
drop policy if exists pedidos_fatura_docs_delete on storage.objects;
create policy pedidos_fatura_docs_select on storage.objects for select to authenticated using (bucket_id = 'pedidos-fatura-docs');
create policy pedidos_fatura_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'pedidos-fatura-docs');
create policy pedidos_fatura_docs_update on storage.objects for update to authenticated using (bucket_id = 'pedidos-fatura-docs') with check (bucket_id = 'pedidos-fatura-docs');
create policy pedidos_fatura_docs_delete on storage.objects for delete to authenticated using (bucket_id = 'pedidos-fatura-docs');
