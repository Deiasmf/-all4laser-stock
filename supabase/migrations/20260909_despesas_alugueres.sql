-- Módulo Despesas de Alugueres (PR1 #147 + PR2 #148).
-- BACKFILL: este schema foi originalmente aplicado via Supabase apply_migration
-- (MCP) e não tinha ficheiro no repo. Reconstruído a partir da definição real da
-- base de dados para ficar versionado. É idempotente — aplicar sobre a BD atual
-- é inócuo; num rebuild de raiz recria o módulo. Depende de profiles/clientes e
-- das funções is_staff() / has_financeiro_access().
--
-- Nota: o bucket privado de Storage `despesas-alugueres` (fotos dos talões) é
-- criado à parte (Storage), não neste ficheiro.

-- ── Tipos de despesa (categorias; staff cria → 'pendente', financeiro aprova/funde) ──
create table if not exists public.despesas_tipos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  estado          text not null default 'aprovado' check (estado in ('aprovado','pendente')),
  fundido_em      uuid references public.despesas_tipos(id),
  criado_por      uuid references public.profiles(id),
  criado_por_nome text,
  ordem           integer not null default 0,
  created_at      timestamptz not null default now()
);
create unique index if not exists despesas_tipos_nome_uniq on public.despesas_tipos (lower(nome));

-- ── Despesas ──────────────────────────────────────────────────────────────────
create table if not exists public.despesas_alugueres (
  id                   uuid primary key default gen_random_uuid(),
  colaborador_id       uuid not null default auth.uid() references public.profiles(id),
  colaborador_nome     text,
  tipo_id              uuid references public.despesas_tipos(id),
  fornecedor           text,
  data_despesa         date not null,
  valor                numeric not null,
  iva                  numeric,
  num_documento        text,
  cliente_id           uuid references public.clientes(id),
  aluguer_ref          text,
  nota                 text,
  estado               text not null default 'registada' check (estado in ('registada','conferida')),
  mes_apuramento       text not null default '',
  registado_apos_fecho boolean not null default false,
  extracao_json        jsonb,
  extracao_confianca   jsonb,
  conferida_por        uuid references public.profiles(id),
  conferida_por_nome   text,
  conferida_em         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists despesas_colab_idx on public.despesas_alugueres (colaborador_id);
create index if not exists despesas_data_idx  on public.despesas_alugueres (data_despesa);
create index if not exists despesas_mes_idx   on public.despesas_alugueres (mes_apuramento);

-- ── Fotos dos talões (bucket privado despesas-alugueres) ───────────────────────
create table if not exists public.despesas_fotos (
  id         uuid primary key default gen_random_uuid(),
  despesa_id uuid not null references public.despesas_alugueres(id) on delete cascade,
  caminho    text not null,
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── Fundos em mãos (entrada = recebido do cliente; entrega = entregue ao caixa) ─
create table if not exists public.despesas_fundos (
  id                   uuid primary key default gen_random_uuid(),
  colaborador_id       uuid not null default auth.uid() references public.profiles(id),
  colaborador_nome     text,
  tipo                 text not null check (tipo in ('entrada','entrega')),
  valor                numeric not null,
  data                 date not null,
  cliente_id           uuid references public.clientes(id),
  aluguer_ref          text,
  nota                 text,
  mes_apuramento       text not null default '',
  registado_apos_fecho boolean not null default false,
  criado_por           uuid references public.profiles(id),
  criado_por_nome      text,
  created_at           timestamptz not null default now()
);
create index if not exists fundos_colab_idx on public.despesas_fundos (colaborador_id);
create index if not exists fundos_mes_idx   on public.despesas_fundos (mes_apuramento);

-- ── Meses fechados (imutáveis; snapshot do apuramento) ─────────────────────────
create table if not exists public.despesas_meses_fechados (
  mes              text primary key,
  snapshot         jsonb,
  fechado_por      uuid references public.profiles(id),
  fechado_por_nome text,
  fechado_em       timestamptz not null default now()
);

-- ── Triggers: mês pela data do documento + imutabilidade do mês fechado ────────
create or replace function public.despesas_definir_mes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare mes_doc text; mes_atual text;
begin
  mes_doc := to_char(new.data_despesa, 'YYYY-MM');
  mes_atual := to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM');
  if exists (select 1 from despesas_meses_fechados where mes = mes_doc) then
    new.mes_apuramento := mes_atual; new.registado_apos_fecho := true;
  else
    new.mes_apuramento := mes_doc;  new.registado_apos_fecho := false;
  end if;
  return new;
end $$;

create or replace function public.fundos_definir_mes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare mes_doc text; mes_atual text;
begin
  mes_doc := to_char(new.data, 'YYYY-MM');
  mes_atual := to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM');
  if exists (select 1 from despesas_meses_fechados where mes = mes_doc) then
    new.mes_apuramento := mes_atual; new.registado_apos_fecho := true;
  else
    new.mes_apuramento := mes_doc;  new.registado_apos_fecho := false;
  end if;
  return new;
end $$;

create or replace function public.despesas_bloquear_fechado()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from despesas_meses_fechados f where f.mes = old.mes_apuramento) then
    raise exception 'Mês % já fechado — registo imutável.', old.mes_apuramento;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists t_despesas_mes on public.despesas_alugueres;
create trigger t_despesas_mes before insert on public.despesas_alugueres
  for each row execute function public.despesas_definir_mes();
drop trigger if exists t_despesas_imut on public.despesas_alugueres;
create trigger t_despesas_imut before delete or update on public.despesas_alugueres
  for each row execute function public.despesas_bloquear_fechado();

drop trigger if exists t_fundos_mes on public.despesas_fundos;
create trigger t_fundos_mes before insert on public.despesas_fundos
  for each row execute function public.fundos_definir_mes();
drop trigger if exists t_fundos_imut on public.despesas_fundos;
create trigger t_fundos_imut before delete or update on public.despesas_fundos
  for each row execute function public.despesas_bloquear_fechado();

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- Regras: o dono vê/gere as suas enquanto 'registada'; o financeiro
-- (has_financeiro_access()) vê e gere tudo; qualquer staff pode inserir as suas.
alter table public.despesas_tipos          enable row level security;
alter table public.despesas_alugueres      enable row level security;
alter table public.despesas_fotos          enable row level security;
alter table public.despesas_fundos         enable row level security;
alter table public.despesas_meses_fechados enable row level security;

-- despesas_alugueres
drop policy if exists desp_sel on public.despesas_alugueres;
create policy desp_sel on public.despesas_alugueres for select
  using ((colaborador_id = auth.uid()) or has_financeiro_access());
drop policy if exists desp_ins on public.despesas_alugueres;
create policy desp_ins on public.despesas_alugueres for insert
  with check ((colaborador_id = auth.uid()) and is_staff());
drop policy if exists desp_upd on public.despesas_alugueres;
create policy desp_upd on public.despesas_alugueres for update
  using (((colaborador_id = auth.uid()) and (estado = 'registada')) or has_financeiro_access());
drop policy if exists desp_del on public.despesas_alugueres;
create policy desp_del on public.despesas_alugueres for delete
  using (((colaborador_id = auth.uid()) and (estado = 'registada')) or has_financeiro_access());

-- despesas_fotos (segue o dono/financeiro da despesa)
drop policy if exists fotos_all on public.despesas_fotos;
create policy fotos_all on public.despesas_fotos for all
  using (exists (select 1 from public.despesas_alugueres d
                 where d.id = despesas_fotos.despesa_id
                   and ((d.colaborador_id = auth.uid()) or has_financeiro_access())))
  with check (exists (select 1 from public.despesas_alugueres d
                 where d.id = despesas_fotos.despesa_id
                   and ((d.colaborador_id = auth.uid()) or has_financeiro_access())));

-- despesas_fundos
drop policy if exists fundos_sel on public.despesas_fundos;
create policy fundos_sel on public.despesas_fundos for select
  using ((colaborador_id = auth.uid()) or has_financeiro_access());
drop policy if exists fundos_ins on public.despesas_fundos;
create policy fundos_ins on public.despesas_fundos for insert
  with check ((colaborador_id = auth.uid()) and is_staff());
drop policy if exists fundos_upd on public.despesas_fundos;
create policy fundos_upd on public.despesas_fundos for update using (has_financeiro_access());
drop policy if exists fundos_del on public.despesas_fundos;
create policy fundos_del on public.despesas_fundos for delete
  using ((colaborador_id = auth.uid()) or has_financeiro_access());

-- despesas_tipos
drop policy if exists tipos_sel on public.despesas_tipos;
create policy tipos_sel on public.despesas_tipos for select using (is_staff());
drop policy if exists tipos_ins on public.despesas_tipos;
create policy tipos_ins on public.despesas_tipos for insert with check (is_staff());
drop policy if exists tipos_upd on public.despesas_tipos;
create policy tipos_upd on public.despesas_tipos for update using (has_financeiro_access());
drop policy if exists tipos_del on public.despesas_tipos;
create policy tipos_del on public.despesas_tipos for delete using (has_financeiro_access());

-- despesas_meses_fechados
drop policy if exists meses_sel on public.despesas_meses_fechados;
create policy meses_sel on public.despesas_meses_fechados for select using (is_staff());
drop policy if exists meses_ins on public.despesas_meses_fechados;
create policy meses_ins on public.despesas_meses_fechados for insert with check (has_financeiro_access());
drop policy if exists meses_upd on public.despesas_meses_fechados;
create policy meses_upd on public.despesas_meses_fechados for update using (has_financeiro_access());
