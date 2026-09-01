-- ───────────────────────────────────────────────────────────────────────────
-- KEYINVOICE → CONTAS CORRENTES: pró-formas, categorias, pagamento,
-- cobranças (pedidos ao cliente) e comissões do serviço técnico.
--
-- 1. financeiro_movimentos ganha:
--      • tipo_documento 'pro_forma' (documento NÃO fiscal: fica fora do saldo,
--        marcado por afeta_saldo=false — a proposta não é dívida do cliente)
--      • categoria (servico_tecnico | aluguer | venda | outro) + categoria_manual
--        (true = classificada à mão; a reimportação não sobrepõe)
--      • descricao (texto do documento — base da classificação automática)
--      • data_pagamento / metodo_pagamento (confirmação explícita do pagamento)
--      • lembretes_auto / lembrete_ultimo (pedidos de pagamento periódicos)
-- 2. financeiro_config  — cadência e janela dos pedidos de pagamento (singleton).
-- 3. financeiro_cobrancas — histórico de pedidos de pagamento enviados.
-- 4. tecnico_comissao_taxas — % de comissão por técnico.
-- 5. tecnico_comissoes (+ despesas) — as faturas de serviço técnico canalizadas
--    para a área técnica, onde se retiram deslocações/alimentação/estadia e se
--    apura a comissão. Alimentada por trigger a partir dos movimentos.
--
-- RLS: o Financeiro continua restrito (has_financeiro_access). As comissões
-- vivem na área técnica e seguem a regra da app: geríveis por qualquer staff
-- (is_staff); as taxas (%) só o financeiro/admin define.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. Movimentos: pró-forma, categoria, pagamento, lembretes ───────────────

alter table public.financeiro_movimentos
  drop constraint if exists financeiro_movimentos_tipo_documento_check;
alter table public.financeiro_movimentos
  add constraint financeiro_movimentos_tipo_documento_check check (tipo_documento in
    ('fatura','pro_forma','nota_credito','recibo','pagamento','adiantamento'));

alter table public.financeiro_movimentos
  add column if not exists categoria         text,
  add column if not exists categoria_manual  boolean not null default false,
  add column if not exists descricao         text,
  add column if not exists data_pagamento    date,
  add column if not exists metodo_pagamento  text,
  add column if not exists afeta_saldo       boolean not null default true,
  add column if not exists lembretes_auto    boolean not null default false,
  add column if not exists lembrete_ultimo   timestamptz;

alter table public.financeiro_movimentos
  drop constraint if exists financeiro_movimentos_categoria_check;
alter table public.financeiro_movimentos
  add constraint financeiro_movimentos_categoria_check check (
    categoria is null or categoria in ('servico_tecnico','aluguer','venda','outro'));

create index if not exists idx_fin_mov_categoria on public.financeiro_movimentos(categoria)
  where categoria is not null;
create index if not exists idx_fin_mov_lembretes on public.financeiro_movimentos(lembretes_auto)
  where lembretes_auto;

-- Trigger de normalização (substitui a versão anterior):
--   • afeta_saldo: só as pró-formas ficam de fora da conta corrente
--   • fatura/pró-forma: estado deriva de valor_liquidado vs valor do documento
--   • restantes documentos: liquidam o próprio valor
--   • data_pagamento acompanha o estado (preenche ao liquidar, limpa ao repor)
create or replace function public.financeiro_movimentos_normalizar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.afeta_saldo := new.tipo_documento <> 'pro_forma';

  if new.tipo_documento in ('fatura','pro_forma') then
    if new.valor_liquidado <= 0 then
      new.estado := 'pendente';
    elsif new.valor_liquidado >= new.valor_debito then
      new.estado := 'liquidado';
      new.valor_liquidado := new.valor_debito;
    else
      new.estado := 'parcial';
    end if;
  else
    new.valor_liquidado := greatest(new.valor_debito, new.valor_credito);
    new.estado := 'liquidado';
  end if;

  -- A data de pagamento só faz sentido nos documentos a cobrar (fatura/pró-forma):
  -- num recibo/pagamento o próprio documento já é a liquidação.
  if new.tipo_documento in ('fatura','pro_forma') then
    if new.estado = 'liquidado' and new.data_pagamento is null then
      new.data_pagamento := current_date;
    elsif new.estado = 'pendente' then
      new.data_pagamento := null;
      new.metodo_pagamento := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Recalcula afeta_saldo/estado nas linhas já existentes.
update public.financeiro_movimentos set updated_at = updated_at;

-- ── 2. Configuração dos pedidos de pagamento (singleton) ────────────────────

create table if not exists public.financeiro_config (
  id                    boolean primary key default true check (id),
  lembretes_ativos      boolean not null default false,
  cadencia_dias         int not null default 15 check (cadencia_dias between 1 and 365),
  dias_apos_vencimento  int not null default 1 check (dias_apos_vencimento between 0 and 365),
  valor_minimo          numeric(12,2) not null default 0 check (valor_minimo >= 0),
  assunto_modelo        text,
  mensagem_modelo       text,
  atualizado_em         timestamptz not null default now(),
  atualizado_por_nome   text
);
insert into public.financeiro_config (id) values (true) on conflict (id) do nothing;

alter table public.financeiro_config enable row level security;
grant select, insert, update on public.financeiro_config to authenticated;
grant all on public.financeiro_config to service_role;
drop policy if exists financeiro_config_acesso on public.financeiro_config;
create policy financeiro_config_acesso on public.financeiro_config
  for all to authenticated
  using (public.has_financeiro_access())
  with check (public.has_financeiro_access());

-- ── 3. Histórico de pedidos de pagamento ────────────────────────────────────

create table if not exists public.financeiro_cobrancas (
  id                uuid primary key default gen_random_uuid(),
  movimento_id      uuid references public.financeiro_movimentos(id) on delete set null,
  cliente_id        uuid references public.clientes(id) on delete set null,
  cliente_nome      text,
  documento_ref     text,
  valor             numeric(12,2) not null default 0,
  dias_atraso       int not null default 0,
  destinatario      text,
  assunto           text,
  automatico        boolean not null default false,
  ok                boolean not null default true,
  erro              text,
  enviado_em        timestamptz not null default now(),
  enviado_por       uuid,
  enviado_por_nome  text
);

create index if not exists idx_fin_cobr_mov     on public.financeiro_cobrancas(movimento_id);
create index if not exists idx_fin_cobr_cliente on public.financeiro_cobrancas(cliente_id);
create index if not exists idx_fin_cobr_data    on public.financeiro_cobrancas(enviado_em desc);

alter table public.financeiro_cobrancas enable row level security;
grant select, insert, update, delete on public.financeiro_cobrancas to authenticated;
grant all on public.financeiro_cobrancas to service_role;
drop policy if exists financeiro_cobrancas_acesso on public.financeiro_cobrancas;
create policy financeiro_cobrancas_acesso on public.financeiro_cobrancas
  for all to authenticated
  using (public.has_financeiro_access())
  with check (public.has_financeiro_access());

-- ── 4. Taxas de comissão por técnico ────────────────────────────────────────

create table if not exists public.tecnico_comissao_taxas (
  tecnico_id      uuid primary key references public.profiles(id) on delete cascade,
  tecnico_nome    text,
  percentagem     numeric(5,2) not null default 0 check (percentagem >= 0 and percentagem <= 100),
  notas           text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por_nome text
);

alter table public.tecnico_comissao_taxas enable row level security;
grant select, insert, update, delete on public.tecnico_comissao_taxas to authenticated;
grant all on public.tecnico_comissao_taxas to service_role;
drop policy if exists tecnico_taxas_select on public.tecnico_comissao_taxas;
drop policy if exists tecnico_taxas_escrita on public.tecnico_comissao_taxas;
-- Ver: qualquer staff (a área técnica precisa da taxa para apurar).
create policy tecnico_taxas_select on public.tecnico_comissao_taxas
  for select to authenticated using (public.is_staff());
-- Definir a %: decisão de gestão → só financeiro/admin.
create policy tecnico_taxas_escrita on public.tecnico_comissao_taxas
  for all to authenticated
  using (public.has_financeiro_access())
  with check (public.has_financeiro_access());

-- ── 5. Comissões do serviço técnico ─────────────────────────────────────────

create table if not exists public.tecnico_comissoes (
  id              uuid primary key default gen_random_uuid(),
  -- Documento de origem (fatura de serviço técnico na conta corrente).
  movimento_id    uuid references public.financeiro_movimentos(id) on delete set null,
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_nome    text,
  documento_ref   text,
  data_documento  date,
  valor_documento numeric(12,2) not null default 0,
  descricao       text,
  -- Apuramento
  tecnico_id      uuid references public.profiles(id) on delete set null,
  tecnico_nome    text,
  folha_obra_id   uuid references public.folhas_obra(id) on delete set null,
  folha_numero    text,
  percentagem     numeric(5,2) check (percentagem is null or (percentagem >= 0 and percentagem <= 100)),
  estado          text not null default 'por_apurar'
                    check (estado in ('por_apurar','apurada','paga')),
  notas           text,
  -- O documento de origem deixou de ser serviço técnico (ou foi apagado).
  origem_anulada  boolean not null default false,
  apurada_em      timestamptz,
  apurada_por_nome text,
  paga_em         date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists uq_tecnico_comissoes_movimento
  on public.tecnico_comissoes(movimento_id) where movimento_id is not null;
create index if not exists idx_comissoes_tecnico on public.tecnico_comissoes(tecnico_id);
create index if not exists idx_comissoes_estado  on public.tecnico_comissoes(estado);
create index if not exists idx_comissoes_data    on public.tecnico_comissoes(data_documento desc);

create table if not exists public.tecnico_comissoes_despesas (
  id              uuid primary key default gen_random_uuid(),
  comissao_id     uuid not null references public.tecnico_comissoes(id) on delete cascade,
  tipo            text not null check (tipo in ('deslocacao','alimentacao','estadia','outro')),
  descricao       text,
  valor           numeric(12,2) not null default 0 check (valor >= 0),
  origem          text not null default 'manual' check (origem in ('manual','auto')),
  criado_por      uuid,
  criado_por_nome text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_comissoes_desp on public.tecnico_comissoes_despesas(comissao_id);

drop trigger if exists trg_comissoes_updated_at on public.tecnico_comissoes;
create trigger trg_comissoes_updated_at
  before update on public.tecnico_comissoes
  for each row execute function public.set_updated_at();

alter table public.tecnico_comissoes          enable row level security;
alter table public.tecnico_comissoes_despesas enable row level security;
grant select, insert, update, delete on public.tecnico_comissoes to authenticated;
grant select, insert, update, delete on public.tecnico_comissoes_despesas to authenticated;
grant all on public.tecnico_comissoes to service_role;
grant all on public.tecnico_comissoes_despesas to service_role;

drop policy if exists comissoes_select on public.tecnico_comissoes;
drop policy if exists comissoes_update on public.tecnico_comissoes;
drop policy if exists comissoes_delete on public.tecnico_comissoes;
-- Ver e apurar: área técnica (staff). As linhas nascem do trigger, não à mão.
create policy comissoes_select on public.tecnico_comissoes
  for select to authenticated using (public.is_staff());
create policy comissoes_update on public.tecnico_comissoes
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- Apagar: só admin/financeiro (a linha é o espelho de um documento).
create policy comissoes_delete on public.tecnico_comissoes
  for delete to authenticated using (public.has_financeiro_access());

drop policy if exists comissoes_desp_acesso on public.tecnico_comissoes_despesas;
create policy comissoes_desp_acesso on public.tecnico_comissoes_despesas
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ── Sincronização movimentos → comissões ────────────────────────────────────
-- Uma fatura de cliente categorizada como "serviço técnico" cria (ou atualiza)
-- a linha de comissão. Se deixar de o ser — ou se o documento for apagado — a
-- linha fica "origem anulada" e sai do apuramento, preservando o histórico.
create or replace function public.sync_comissao_tecnica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    update public.tecnico_comissoes
       set origem_anulada = true, updated_at = now()
     where movimento_id = old.id;
    return old;
  end if;

  if new.categoria = 'servico_tecnico'
     and new.tipo_documento = 'fatura'
     and new.entidade_tipo = 'cliente' then
    insert into public.tecnico_comissoes as tc
      (movimento_id, cliente_id, cliente_nome, documento_ref, data_documento, valor_documento, descricao)
    values
      (new.id, new.cliente_id, new.entidade_nome, new.documento_ref, new.data_documento, new.valor_debito, new.descricao)
    -- O índice único é parcial (movimento_id not null): o predicado tem de vir aqui.
    on conflict (movimento_id) where movimento_id is not null do update set
      cliente_id      = excluded.cliente_id,
      cliente_nome    = excluded.cliente_nome,
      documento_ref   = excluded.documento_ref,
      data_documento  = excluded.data_documento,
      valor_documento = excluded.valor_documento,
      descricao       = coalesce(excluded.descricao, tc.descricao),
      origem_anulada  = false,
      updated_at      = now();
  else
    update public.tecnico_comissoes
       set origem_anulada = true, updated_at = now()
     where movimento_id = new.id and not origem_anulada;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_comissao_tecnica on public.financeiro_movimentos;
create trigger trg_sync_comissao_tecnica
  after insert or update on public.financeiro_movimentos
  for each row execute function public.sync_comissao_tecnica();

-- A eliminação tem de ser marcada ANTES: a chave estrangeira é "on delete set
-- null", e essa ação corre antes dos triggers AFTER — depois já não há
-- movimento_id por onde encontrar a linha.
drop trigger if exists trg_sync_comissao_tecnica_del on public.financeiro_movimentos;
create trigger trg_sync_comissao_tecnica_del
  before delete on public.financeiro_movimentos
  for each row execute function public.sync_comissao_tecnica();
