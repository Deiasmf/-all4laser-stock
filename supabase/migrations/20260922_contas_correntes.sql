-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONTAS CORRENTES (cc_*) — Passo 1
-- Consignação (Laserix/Dubai) + Prestações + Portal do cliente (só leitura).
--
-- Regras aplicadas:
--  · Reutiliza `equipamentos` e `clientes` existentes (FK, sem duplicar).
--  · Todas as tabelas cc_* têm RLS ativa desde a criação (política interna
--    is_staff()); nenhuma fica legível sem política.
--  · Cálculos vivem em SQL (triggers/funções/views), não no frontend.
--  · Câmbio: taxa = unidades da moeda por 1 EUR (ex.: 4.40 AED/EUR) →
--    valor_eur = valor / taxa. Guardado no momento, nunca recalculado.
--  · Portal lê SÓ as views v_cc_portal_* (SECURITY DEFINER, auto-filtradas por
--    portal_users) — as tabelas base cc_* são inacessíveis ao portal, pelo que
--    valor_compra, notas internas e reconciliações nunca são expostos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABELAS
-- ───────────────────────────────────────────────────────────────────────────

-- cc_contas ─ uma conta por parceiro/cliente
create table if not exists public.cc_contas (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid references public.clientes(id),
  nome                   text not null,
  tipo                   text not null check (tipo in ('consignacao','prestacoes','mista')),
  moeda                  text not null default 'EUR',
  taxa_contratual        numeric(12,6),                 -- unidades/EUR (ex.: 4.40)
  taxa_contratual_inicio date,
  taxa_contratual_fim    date,
  partilha_margem_pct    numeric(5,2) not null default 50,
  prazo_pagamento_dias   integer not null default 30,
  limite_exposicao       numeric(14,2),
  mapeamento_excel       jsonb not null default '{}'::jsonb,
  ativa                  boolean not null default true,
  notas                  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_consignacoes ─ uma linha por máquina enviada ao parceiro
create table if not exists public.cc_consignacoes (
  id                uuid primary key default gen_random_uuid(),
  conta_id          uuid not null references public.cc_contas(id) on delete cascade,
  equipamento_id    uuid references public.equipamentos(id),
  numero_serie      text,
  custo_declarado   numeric(14,2) not null,             -- independente de valor_compra
  moeda_custo       text not null default 'EUR',
  origem            text check (origem in ('envio_direto','medika_bazaar','outro')),
  data_envio        date,
  estado            text not null default 'em_stock'
                      check (estado in ('em_stock','vendido','devolvido','cancelado')),
  entidade_faturada text check (entidade_faturada in ('laserix','dermamed')),
  acessorios        jsonb not null default '[]'::jsonb, -- ex.: Cynosure + Zimmer 6
  notas             text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_vendas ─ venda de uma consignação (campos calculados por trigger)
create table if not exists public.cc_vendas (
  id                uuid primary key default gen_random_uuid(),
  consignacao_id    uuid not null references public.cc_consignacoes(id) on delete cascade,
  data_venda        date not null,
  preco_venda       numeric(14,2) not null,             -- em moeda_venda
  moeda_venda       text not null default 'AED',
  cliente_final     text,
  taxa_cambio_custo numeric(12,6),                       -- EUR→moeda_venda (unidades/EUR)
  custo_convertido  numeric(14,2),                       -- calculado
  margem            numeric(14,2),                       -- calculado
  valor_devido      numeric(14,2),                       -- calculado
  margem_negativa   boolean not null default false,
  estado            text not null default 'registada'
                      check (estado in ('registada','confirmada','recebida')),
  notas             text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_movimentos ─ o ledger
create table if not exists public.cc_movimentos (
  id                   uuid primary key default gen_random_uuid(),
  conta_id             uuid not null references public.cc_contas(id) on delete cascade,
  tipo                 text not null
                         check (tipo in ('esperado','recebido','nota_credito','ajuste')),
  data                 date not null,
  valor                numeric(14,2) not null,
  moeda                text not null default 'EUR',
  taxa_cambio_eur      numeric(12,6) not null default 1, -- unidades/EUR
  valor_eur            numeric(14,2),                     -- calculado
  origem_tipo          text check (origem_tipo in ('venda','prestacao','manual','reconciliacao')),
  origem_id            uuid,
  referencia_bancaria  text,
  fatura_keyinvoice_id uuid,
  notas                text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_planos_pagamento
create table if not exists public.cc_planos_pagamento (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid not null references public.cc_contas(id) on delete cascade,
  descricao      text,
  equipamento_id uuid references public.equipamentos(id),
  valor_total    numeric(14,2) not null,
  moeda          text not null default 'EUR',
  n_prestacoes   integer not null check (n_prestacoes > 0),
  periodicidade  text not null default 'mensal'
                   check (periodicidade in ('mensal','trimestral','custom')),
  data_inicio    date not null,
  entrada        numeric(14,2),
  estado         text not null default 'ativo'
                   check (estado in ('ativo','concluido','cancelado')),
  notas          text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_prestacoes ─ geradas na criação do plano; editáveis à mão
create table if not exists public.cc_prestacoes (
  id              uuid primary key default gen_random_uuid(),
  plano_id        uuid not null references public.cc_planos_pagamento(id) on delete cascade,
  numero          integer not null,                     -- 0 = entrada
  data_vencimento date not null,
  valor           numeric(14,2) not null,
  moeda           text not null default 'EUR',
  estado          text not null default 'pendente'
                    check (estado in ('pendente','paga','parcial','atrasada')),
  movimento_id    uuid references public.cc_movimentos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- cc_reconciliacoes ─ uma linha por importação do Excel da Laserix
create table if not exists public.cc_reconciliacoes (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references public.cc_contas(id) on delete cascade,
  data_import   timestamptz not null default now(),
  ficheiro_nome text,
  linhas_total  integer,
  divergencias  jsonb not null default '[]'::jsonb,
  estado        text not null default 'aberta' check (estado in ('aberta','resolvida')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text
);

-- portal_users ─ liga login do portal a uma conta (1 user ↔ N contas)
create table if not exists public.portal_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  conta_id   uuid not null references public.cc_contas(id) on delete cascade,
  email      text not null,
  nome       text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  unique (user_id, conta_id)
);

-- Índices
create index if not exists cc_consignacoes_conta_idx    on public.cc_consignacoes(conta_id);
create index if not exists cc_consignacoes_equip_idx     on public.cc_consignacoes(equipamento_id);
create index if not exists cc_vendas_consignacao_idx     on public.cc_vendas(consignacao_id);
create index if not exists cc_movimentos_conta_idx       on public.cc_movimentos(conta_id);
create index if not exists cc_movimentos_origem_idx      on public.cc_movimentos(origem_tipo, origem_id);
create index if not exists cc_planos_conta_idx           on public.cc_planos_pagamento(conta_id);
create index if not exists cc_prestacoes_plano_idx       on public.cc_prestacoes(plano_id);
create index if not exists cc_reconciliacoes_conta_idx   on public.cc_reconciliacoes(conta_id);
create index if not exists portal_users_user_idx         on public.portal_users(user_id);
create index if not exists portal_users_conta_idx        on public.portal_users(conta_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TRIGGERS DE CÁLCULO
-- ───────────────────────────────────────────────────────────────────────────

-- updated_at (reutiliza public.set_updated_at())
do $$
declare t text;
begin
  foreach t in array array[
    'cc_contas','cc_consignacoes','cc_vendas','cc_movimentos',
    'cc_planos_pagamento','cc_prestacoes','cc_reconciliacoes'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- cc_movimentos: valor_eur = valor / taxa_cambio_eur (taxa = unidades/EUR)
create or replace function public.cc_movimentos_eur()
returns trigger language plpgsql
set search_path to 'public'
as $$
begin
  if new.taxa_cambio_eur is null or new.taxa_cambio_eur = 0 then
    new.taxa_cambio_eur := 1;
  end if;
  new.valor_eur := round(new.valor / new.taxa_cambio_eur, 2);
  return new;
end;
$$;

drop trigger if exists trg_cc_movimentos_eur on public.cc_movimentos;
create trigger trg_cc_movimentos_eur
  before insert or update on public.cc_movimentos
  for each row execute function public.cc_movimentos_eur();

-- cc_vendas: custo_convertido, margem, valor_devido (fórmulas da spec)
create or replace function public.cc_vendas_calcular()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_custo numeric;
  v_pct   numeric;
  v_taxa  numeric;
  v_conta public.cc_contas%rowtype;
  v_conta_id uuid;
begin
  select custo_declarado, conta_id into v_custo, v_conta_id
    from public.cc_consignacoes where id = new.consignacao_id;
  if v_custo is null then
    raise exception 'Consignação % não encontrada ou sem custo declarado', new.consignacao_id;
  end if;
  select * into v_conta from public.cc_contas where id = v_conta_id;
  v_pct := coalesce(v_conta.partilha_margem_pct, 50);

  -- Taxa: manual se fornecida; senão a contratual da conta se a data cai no intervalo.
  v_taxa := new.taxa_cambio_custo;
  if v_taxa is null and v_conta.taxa_contratual is not null
     and new.data_venda >= coalesce(v_conta.taxa_contratual_inicio, new.data_venda)
     and new.data_venda <= coalesce(v_conta.taxa_contratual_fim, new.data_venda) then
    v_taxa := v_conta.taxa_contratual;
  end if;
  if v_taxa is null then
    raise exception 'Taxa de câmbio do custo obrigatória: a conta não tem taxa contratual aplicável em %', new.data_venda;
  end if;

  new.taxa_cambio_custo := v_taxa;
  new.custo_convertido  := round(v_custo * v_taxa, 2);
  new.margem            := round(new.preco_venda - new.custo_convertido, 2);
  new.valor_devido      := round(new.custo_convertido + new.margem * v_pct / 100, 2);
  new.margem_negativa   := (new.margem < 0);
  return new;
end;
$$;

drop trigger if exists trg_cc_vendas_calcular on public.cc_vendas;
create trigger trg_cc_vendas_calcular
  before insert or update on public.cc_vendas
  for each row execute function public.cc_vendas_calcular();

-- cc_vendas: ao confirmar → cria movimento esperado (idempotente) + marca consignação vendida
create or replace function public.cc_vendas_confirmar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conta_id uuid;
  v_prazo    integer;
  v_existe   boolean;
begin
  if new.estado = 'confirmada' then
    select cs.conta_id, coalesce(c.prazo_pagamento_dias, 30)
      into v_conta_id, v_prazo
      from public.cc_consignacoes cs
      join public.cc_contas c on c.id = cs.conta_id
     where cs.id = new.consignacao_id;

    select exists (
      select 1 from public.cc_movimentos
       where origem_tipo = 'venda' and origem_id = new.id and tipo = 'esperado'
    ) into v_existe;

    if not v_existe then
      insert into public.cc_movimentos
        (conta_id, tipo, data, valor, moeda, taxa_cambio_eur,
         origem_tipo, origem_id, notas, criado_por, criado_por_nome)
      values
        (v_conta_id, 'esperado', new.data_venda + v_prazo, new.valor_devido,
         new.moeda_venda, coalesce(new.taxa_cambio_custo, 1),
         'venda', new.id, 'Valor devido da venda em consignação',
         new.criado_por, new.criado_por_nome);
    end if;

    update public.cc_consignacoes
       set estado = 'vendido'
     where id = new.consignacao_id and estado <> 'vendido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cc_vendas_confirmar on public.cc_vendas;
create trigger trg_cc_vendas_confirmar
  after insert or update on public.cc_vendas
  for each row execute function public.cc_vendas_confirmar();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. FUNÇÕES RPC (security definer + guarda is_staff)
-- ───────────────────────────────────────────────────────────────────────────

-- Custo declarado sugerido por família (editável no frontend)
create or replace function public.cc_custo_declarado_sugerido(
  p_equipamento_id uuid,
  p_n_conjuntos integer default 1
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_marca text;
  v_modelo text;
  v_base numeric;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão.';
  end if;
  select marca, modelo, coalesce(valor_compra, 0)
    into v_marca, v_modelo, v_base
    from public.equipamentos where id = p_equipamento_id;
  if not found then
    return null;
  end if;
  -- Candela GentleMax Pro / Pro-U → valor_compra + 4 000 €
  if v_modelo ilike '%gentlemax pro%' then
    return v_base + 4000;
  end if;
  -- Cynosure Elite+ com Zimmer 6 → custo + 2 500 € (Zimmer) + 1 500 € por conjunto
  if v_modelo ilike '%elite%' then
    return v_base + 2500 + 1500 * coalesce(p_n_conjuntos, 1);
  end if;
  -- Outros → valor_compra (a confirmar à mão)
  return v_base;
end;
$$;

-- Gerar prestações de um plano (+ movimentos esperados). Idempotente para as
-- prestações ainda pendentes/atrasadas sem recebimento.
create or replace function public.cc_gerar_prestacoes(p_plano_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.cc_planos_pagamento%rowtype;
  v_step   integer;
  v_valor  numeric;
  v_venc   date;
  v_prest  numeric;
  v_ultima numeric;
  v_prest_id uuid;
  i integer;
  v_count integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão.';
  end if;
  select * into p from public.cc_planos_pagamento where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.';
  end if;

  -- limpar prestações regeráveis (não pagas e sem movimento ligado) e os seus esperados
  delete from public.cc_movimentos
   where origem_tipo = 'prestacao'
     and origem_id in (select id from public.cc_prestacoes
                        where plano_id = p_plano_id
                          and estado in ('pendente','atrasada')
                          and movimento_id is null);
  delete from public.cc_prestacoes
   where plano_id = p_plano_id
     and estado in ('pendente','atrasada')
     and movimento_id is null;

  v_step := case p.periodicidade when 'trimestral' then 3 else 1 end;

  -- entrada = prestação nº 0
  if coalesce(p.entrada, 0) > 0 then
    insert into public.cc_prestacoes (plano_id, numero, data_vencimento, valor, moeda)
      values (p_plano_id, 0, p.data_inicio, p.entrada, p.moeda)
      returning id into v_prest_id;
    insert into public.cc_movimentos
      (conta_id, tipo, data, valor, moeda, origem_tipo, origem_id, notas)
      values (p.conta_id, 'esperado', p.data_inicio, p.entrada, p.moeda,
              'prestacao', v_prest_id, 'Entrada do plano ' || coalesce(p.descricao, ''));
    v_count := v_count + 1;
  end if;

  v_valor  := round((p.valor_total - coalesce(p.entrada, 0)) / p.n_prestacoes, 2);
  v_ultima := (p.valor_total - coalesce(p.entrada, 0)) - v_valor * (p.n_prestacoes - 1);

  for i in 1 .. p.n_prestacoes loop
    v_venc  := (p.data_inicio + ((i * v_step) || ' months')::interval)::date;
    v_prest := case when i < p.n_prestacoes then v_valor else v_ultima end;
    insert into public.cc_prestacoes (plano_id, numero, data_vencimento, valor, moeda)
      values (p_plano_id, i, v_venc, v_prest, p.moeda)
      returning id into v_prest_id;
    insert into public.cc_movimentos
      (conta_id, tipo, data, valor, moeda, origem_tipo, origem_id, notas)
      values (p.conta_id, 'esperado', v_venc, v_prest, p.moeda,
              'prestacao', v_prest_id, 'Prestação ' || i || '/' || p.n_prestacoes);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Registar recebimento ligado a uma prestação ou venda
create or replace function public.cc_registar_recebimento(
  p_origem_tipo text,
  p_origem_id   uuid,
  p_valor       numeric,
  p_moeda       text default 'EUR',
  p_taxa        numeric default 1,
  p_ref         text default null,
  p_fatura_kv   uuid default null,
  p_data        date default current_date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conta_id uuid;
  v_mov_id   uuid;
  v_valor_prest numeric;
begin
  if not public.is_staff() then
    raise exception 'Sem permissão.';
  end if;

  if p_origem_tipo = 'prestacao' then
    select pl.conta_id, pr.valor into v_conta_id, v_valor_prest
      from public.cc_prestacoes pr
      join public.cc_planos_pagamento pl on pl.id = pr.plano_id
     where pr.id = p_origem_id;
  elsif p_origem_tipo = 'venda' then
    select cs.conta_id into v_conta_id
      from public.cc_vendas v
      join public.cc_consignacoes cs on cs.id = v.consignacao_id
     where v.id = p_origem_id;
  else
    raise exception 'Origem inválida: %', p_origem_tipo;
  end if;

  if v_conta_id is null then
    raise exception 'Origem % / % não encontrada.', p_origem_tipo, p_origem_id;
  end if;

  insert into public.cc_movimentos
    (conta_id, tipo, data, valor, moeda, taxa_cambio_eur,
     origem_tipo, origem_id, referencia_bancaria, fatura_keyinvoice_id)
  values
    (v_conta_id, 'recebido', p_data, p_valor, p_moeda, coalesce(p_taxa, 1),
     p_origem_tipo, p_origem_id, p_ref, p_fatura_kv)
  returning id into v_mov_id;

  if p_origem_tipo = 'prestacao' then
    update public.cc_prestacoes
       set movimento_id = v_mov_id,
           estado = case when p_valor >= v_valor_prest then 'paga' else 'parcial' end
     where id = p_origem_id;
  elsif p_origem_tipo = 'venda' then
    update public.cc_vendas set estado = 'recebida' where id = p_origem_id;
  end if;

  return v_mov_id;
end;
$$;

-- Job diário: prestações vencidas e pendentes → atrasadas
create or replace function public.cc_marcar_atrasos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_count integer;
begin
  -- interno (staff) ou contexto de serviço (cron sem auth.uid())
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Sem permissão.';
  end if;
  with upd as (
    update public.cc_prestacoes
       set estado = 'atrasada'
     where estado = 'pendente' and data_vencimento < current_date
    returning 1
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

-- Helper: o utilizador atual é do portal? (claim app_metadata.role = 'portal')
create or replace function public.cc_is_portal()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'portal', false);
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. VIEWS INTERNAS (security_invoker = on → RLS das tabelas base aplica-se)
-- ───────────────────────────────────────────────────────────────────────────

create or replace view public.v_cc_saldo_conta with (security_invoker = on) as
select
  c.id   as conta_id,
  c.nome,
  c.moeda,
  coalesce(sum(case m.tipo when 'esperado' then m.valor when 'ajuste' then m.valor
                           when 'recebido' then -m.valor when 'nota_credito' then -m.valor end), 0) as saldo_moeda,
  coalesce(sum(case m.tipo when 'esperado' then m.valor_eur when 'ajuste' then m.valor_eur
                           when 'recebido' then -m.valor_eur when 'nota_credito' then -m.valor_eur end), 0) as saldo_eur,
  coalesce(sum(case when m.tipo in ('esperado','ajuste') then m.valor_eur else 0 end), 0) as total_esperado_eur,
  coalesce(sum(case when m.tipo in ('recebido','nota_credito') then m.valor_eur else 0 end), 0) as total_recebido_eur,
  (select count(*) from public.cc_consignacoes cs
     where cs.conta_id = c.id and cs.estado = 'em_stock') as maquinas_em_stock,
  (select min(pr.data_vencimento) from public.cc_prestacoes pr
     join public.cc_planos_pagamento pl on pl.id = pr.plano_id
    where pl.conta_id = c.id and pr.estado in ('pendente','atrasada','parcial')) as proximo_vencimento
from public.cc_contas c
left join public.cc_movimentos m on m.conta_id = c.id
group by c.id, c.nome, c.moeda;

create or replace view public.v_cc_extrato with (security_invoker = on) as
select
  m.*,
  sum(case m.tipo when 'esperado' then m.valor when 'ajuste' then m.valor
                  when 'recebido' then -m.valor when 'nota_credito' then -m.valor end)
    over (partition by m.conta_id order by m.data, m.created_at
          rows between unbounded preceding and current row) as saldo_acumulado
from public.cc_movimentos m;

create or replace view public.v_cc_consignacao_stock with (security_invoker = on) as
select
  cs.id, cs.conta_id, cs.equipamento_id, cs.numero_serie,
  e.modelo, e.marca, e.ano,
  cs.custo_declarado, cs.moeda_custo, cs.data_envio, cs.estado,
  (current_date - cs.data_envio) as dias_desde_envio
from public.cc_consignacoes cs
left join public.equipamentos e on e.id = cs.equipamento_id
where cs.estado = 'em_stock';

create or replace view public.v_cc_cashflow_mensal with (security_invoker = on) as
-- prestações agendadas por receber
select
  pl.conta_id,
  date_trunc('month', pr.data_vencimento)::date as mes,
  pr.moeda,
  'prestacao'::text as categoria,
  sum(pr.valor)     as valor,
  sum(pr.valor)     as valor_eur   -- prestações assumidas em EUR; refinar se multi-moeda
from public.cc_prestacoes pr
join public.cc_planos_pagamento pl on pl.id = pr.plano_id
where pr.estado in ('pendente','atrasada','parcial')
group by pl.conta_id, date_trunc('month', pr.data_vencimento), pr.moeda
union all
-- vendas confirmadas por receber (mês = data_venda + prazo_pagamento_dias)
select
  cs.conta_id,
  date_trunc('month', (v.data_venda + coalesce(c.prazo_pagamento_dias, 30)))::date,
  v.moeda_venda,
  'venda',
  sum(v.valor_devido),
  sum(round(v.valor_devido / nullif(v.taxa_cambio_custo, 0), 2))
from public.cc_vendas v
join public.cc_consignacoes cs on cs.id = v.consignacao_id
join public.cc_contas c on c.id = cs.conta_id
where v.estado = 'confirmada'
group by cs.conta_id, date_trunc('month', (v.data_venda + coalesce(c.prazo_pagamento_dias, 30))), v.moeda_venda
union all
-- recebido real (meses passados)
select
  m.conta_id,
  date_trunc('month', m.data)::date,
  m.moeda,
  'recebido',
  sum(m.valor),
  sum(m.valor_eur)
from public.cc_movimentos m
where m.tipo = 'recebido'
group by m.conta_id, date_trunc('month', m.data), m.moeda;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. VIEWS DO PORTAL (SECURITY DEFINER → auto-filtram por portal_users;
--    só colunas seguras; nunca valor_compra / notas / reconciliações)
-- ───────────────────────────────────────────────────────────────────────────

create or replace view public.v_cc_portal_resumo with (security_invoker = off) as
select
  c.id as conta_id, c.nome as conta_nome, c.moeda,
  coalesce(sum(case m.tipo when 'esperado' then m.valor when 'ajuste' then m.valor
                           when 'recebido' then -m.valor when 'nota_credito' then -m.valor end), 0) as saldo,
  coalesce(sum(case when m.tipo in ('esperado','ajuste') then m.valor else 0 end), 0) as total_esperado,
  coalesce(sum(case when m.tipo in ('recebido','nota_credito') then m.valor else 0 end), 0) as total_recebido,
  (select count(*) from public.cc_consignacoes cs
     where cs.conta_id = c.id and cs.estado = 'em_stock') as maquinas_em_stock,
  (select min(pr.data_vencimento) from public.cc_prestacoes pr
     join public.cc_planos_pagamento pl on pl.id = pr.plano_id
    where pl.conta_id = c.id and pr.estado in ('pendente','atrasada','parcial')) as proximo_vencimento
from public.cc_contas c
left join public.cc_movimentos m on m.conta_id = c.id
where c.id in (select conta_id from public.portal_users where user_id = auth.uid() and ativo)
group by c.id, c.nome, c.moeda;

create or replace view public.v_cc_portal_equipamentos with (security_invoker = off) as
select
  cs.conta_id, cs.id as consignacao_id,
  e.modelo, e.ano, cs.numero_serie,
  cs.custo_declarado, cs.moeda_custo, cs.data_envio, cs.estado
from public.cc_consignacoes cs
left join public.equipamentos e on e.id = cs.equipamento_id
where cs.conta_id in (select conta_id from public.portal_users where user_id = auth.uid() and ativo);

create or replace view public.v_cc_portal_vendas with (security_invoker = off) as
select
  cs.conta_id, v.data_venda, cs.numero_serie,
  v.preco_venda, v.moeda_venda, v.custo_convertido, v.margem,
  round(v.margem * c.partilha_margem_pct / 100, 2) as partilha,
  v.valor_devido, v.estado
from public.cc_vendas v
join public.cc_consignacoes cs on cs.id = v.consignacao_id
join public.cc_contas c on c.id = cs.conta_id
where v.estado in ('confirmada','recebida')
  and cs.conta_id in (select conta_id from public.portal_users where user_id = auth.uid() and ativo);

create or replace view public.v_cc_portal_prestacoes with (security_invoker = off) as
select
  pl.conta_id, pl.descricao, pr.numero, pr.data_vencimento,
  pr.valor, pr.moeda, pr.estado, m.data as data_pagamento
from public.cc_prestacoes pr
join public.cc_planos_pagamento pl on pl.id = pr.plano_id
left join public.cc_movimentos m on m.id = pr.movimento_id
where pl.conta_id in (select conta_id from public.portal_users where user_id = auth.uid() and ativo);

create or replace view public.v_cc_portal_extrato with (security_invoker = off) as
select
  m.conta_id, m.data,
  case m.tipo
    when 'esperado'     then 'Valor esperado'
    when 'recebido'     then 'Recebimento'
    when 'nota_credito' then 'Nota de crédito'
    when 'ajuste'       then 'Ajuste'
  end as descricao,
  case when m.tipo in ('esperado','ajuste')      then m.valor else 0 end as esperado,
  case when m.tipo in ('recebido','nota_credito') then m.valor else 0 end as recebido,
  m.moeda,
  sum(case m.tipo when 'esperado' then m.valor when 'ajuste' then m.valor
                  when 'recebido' then -m.valor when 'nota_credito' then -m.valor end)
    over (partition by m.conta_id order by m.data, m.created_at
          rows between unbounded preceding and current row) as saldo
from public.cc_movimentos m
where m.conta_id in (select conta_id from public.portal_users where user_id = auth.uid() and ativo);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RLS + GRANTS
-- ───────────────────────────────────────────────────────────────────────────

-- Tabelas base cc_* + portal_users: RLS interna (is_staff). O portal NÃO acede
-- às tabelas base — só às views v_cc_portal_* (definer). Assim valor_compra,
-- notas internas e reconciliações nunca ficam expostos ao portal.
do $$
declare t text;
begin
  foreach t in array array[
    'cc_contas','cc_consignacoes','cc_vendas','cc_movimentos',
    'cc_planos_pagamento','cc_prestacoes','cc_reconciliacoes','portal_users'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_interno', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())',
      t || '_interno', t
    );
  end loop;
end $$;

-- Views internas: leitura só a staff (RLS das bases já filtra via security_invoker,
-- mas garantimos que o portal não lê estas views).
revoke all on public.v_cc_saldo_conta        from anon, authenticated;
revoke all on public.v_cc_extrato            from anon, authenticated;
revoke all on public.v_cc_consignacao_stock  from anon, authenticated;
revoke all on public.v_cc_cashflow_mensal    from anon, authenticated;
grant select on public.v_cc_saldo_conta       to authenticated;
grant select on public.v_cc_extrato           to authenticated;
grant select on public.v_cc_consignacao_stock to authenticated;
grant select on public.v_cc_cashflow_mensal   to authenticated;

-- Views do portal: leitura a authenticated (o portal usa estas; o filtro por
-- portal_users está embutido). Definer → não precisam de acesso às bases.
grant select on public.v_cc_portal_resumo       to authenticated;
grant select on public.v_cc_portal_equipamentos to authenticated;
grant select on public.v_cc_portal_vendas       to authenticated;
grant select on public.v_cc_portal_prestacoes   to authenticated;
grant select on public.v_cc_portal_extrato      to authenticated;

-- Execução das funções
revoke all on function public.cc_custo_declarado_sugerido(uuid, integer) from public;
revoke all on function public.cc_gerar_prestacoes(uuid) from public;
revoke all on function public.cc_registar_recebimento(text, uuid, numeric, text, numeric, text, uuid, date) from public;
revoke all on function public.cc_marcar_atrasos() from public;
grant execute on function public.cc_custo_declarado_sugerido(uuid, integer) to authenticated;
grant execute on function public.cc_gerar_prestacoes(uuid) to authenticated;
grant execute on function public.cc_registar_recebimento(text, uuid, numeric, text, numeric, text, uuid, date) to authenticated;
grant execute on function public.cc_marcar_atrasos() to authenticated, service_role;
grant execute on function public.cc_is_portal() to authenticated;
