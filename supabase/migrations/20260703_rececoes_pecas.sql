-- Receção de Encomenda — documento espelho do Envio de Encomenda.
-- Tabelas: rececoes_pecas (+ contador p/ numeração RC-YYYY-NNNN), rececoes_pecas_itens.
-- Cada receção gera automaticamente um movimento de ENTRADA no livro central
-- (recepcao_movimentos), tal como cada envio gera um de SAÍDA. Assim as receções
-- entram na correspondência (match) com os envios/reparações.

-- ── Permitir referencia_tipo = 'rececao' no livro central ──
alter table public.recepcao_movimentos
  drop constraint if exists recepcao_movimentos_referencia_tipo_check;
alter table public.recepcao_movimentos
  add constraint recepcao_movimentos_referencia_tipo_check
  check (referencia_tipo in ('reparacao','envio_pecas','nota_encomenda','manual','rececao'));

-- ───────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL: rececoes_pecas
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.rececoes_pecas (
  id                uuid primary key default gen_random_uuid(),
  numero            text unique,                       -- RC-YYYY-NNNN (trigger)
  estado            text not null default 'aberto'
                      check (estado in ('aberto','conferido','cancelado')),

  -- Origem: de quem recebemos (cliente ou fornecedor)
  origem_tipo       text check (origem_tipo in ('cliente','fornecedor')) default 'fornecedor',
  cliente_id        uuid references public.clientes(id),
  cliente_nome      text,
  fornecedor_id     uuid references public.fornecedores(id),
  fornecedor_nome   text,

  -- Motivo da receção
  motivo            text check (motivo in ('reparacao','garantia','devolucao','compra')) default 'reparacao',

  -- Equipamento associado (ligado ao stock de equipamentos)
  equipamento_id    uuid references public.equipamentos(id),
  equipamento_sn    text,

  -- Ligação ao documento existente (envio ou reparação) para o match
  referencia_tipo   text check (referencia_tipo in ('reparacao','envio_pecas','nota_encomenda','manual')) default 'manual',
  referencia_id     uuid,
  referencia_numero text,

  responsavel_id    uuid references public.profiles(id),
  responsavel_nome  text,

  notas             text,

  criado_por        uuid references auth.users(id),
  criado_por_nome   text,
  recebido_em       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Itens da receção ──
create table if not exists public.rececoes_pecas_itens (
  id              uuid primary key default gen_random_uuid(),
  rececao_id      uuid not null references public.rececoes_pecas(id) on delete cascade,
  peca_id         uuid references public.pecas(id),
  peca_nome       text,
  serial_number   text,
  quantidade      integer not null default 1,
  preco_unitario  numeric not null default 0,
  preco_total     numeric generated always as (quantidade * preco_unitario) stored,
  created_at      timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- NUMERAÇÃO AUTOMÁTICA: RC-YYYY-NNNN (sequência por ano, reinicia em 0001)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.rececoes_pecas_contador (
  ano    int primary key,
  ultimo int not null default 0
);

create or replace function public.gerar_numero_rececao_pecas()
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

  insert into public.rececoes_pecas_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'RC-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_rececoes_pecas_numero on public.rececoes_pecas;
create trigger trg_rececoes_pecas_numero
  before insert on public.rececoes_pecas
  for each row execute function public.gerar_numero_rececao_pecas();

drop trigger if exists trg_rececoes_pecas_updated_at on public.rececoes_pecas;
create trigger trg_rececoes_pecas_updated_at
  before update on public.rececoes_pecas
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- SINCRONIZAÇÃO: rececoes_pecas → recepcao_movimentos (entrada)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.sync_recepcao_from_rececao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem text;
  v_motivo text;
  v_desc   text;
begin
  v_origem := case when new.origem_tipo = 'cliente'
                   then coalesce(new.cliente_nome, 'Cliente')
                   else coalesce(new.fornecedor_nome, 'Fornecedor') end;
  v_motivo := case new.motivo
                when 'reparacao' then 'Retorno de reparação'
                when 'garantia' then 'Garantia'
                when 'devolucao' then 'Devolução'
                when 'compra' then 'Compra'
                else coalesce(new.motivo, '') end;

  if tg_op = 'INSERT' then
    v_desc := 'Receção ' || coalesce(new.numero, '') || nullif(' · ' || v_motivo, ' · ');
    if new.referencia_numero is not null and btrim(new.referencia_numero) <> '' then
      v_desc := v_desc || ' · ' || new.referencia_numero;
    end if;

    insert into public.recepcao_movimentos (
      tipo, data_movimento, origem_destino, descricao, quantidade,
      equipamento_sn, equipamento_id,
      referencia_tipo, referencia_id, referencia_numero, match_status,
      notas, criado_por, criado_por_nome
    ) values (
      'entrada',
      coalesce(new.recebido_em::date, new.created_at::date, current_date),
      v_origem,
      v_desc,
      1,
      new.equipamento_sn, new.equipamento_id,
      'rececao', new.id, new.numero,
      'pendente',                       -- aguarda correspondência com o envio/reparação
      'Estado: ' || new.estado, new.criado_por, new.criado_por_nome
    );
  elsif tg_op = 'UPDATE' and (new.estado is distinct from old.estado
       or new.origem_tipo is distinct from old.origem_tipo
       or new.cliente_nome is distinct from old.cliente_nome
       or new.fornecedor_nome is distinct from old.fornecedor_nome) then
    update public.recepcao_movimentos
       set notas = 'Estado: ' || new.estado,
           origem_destino = v_origem,
           data_movimento = coalesce(new.recebido_em::date, data_movimento)
     where referencia_tipo = 'rececao' and referencia_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_sync_recepcao_rececao_ins on public.rececoes_pecas;
create trigger trigger_sync_recepcao_rececao_ins
  after insert on public.rececoes_pecas
  for each row execute function public.sync_recepcao_from_rececao();

drop trigger if exists trigger_sync_recepcao_rececao_upd on public.rececoes_pecas;
create trigger trigger_sync_recepcao_rececao_upd
  after update on public.rececoes_pecas
  for each row execute function public.sync_recepcao_from_rececao();

-- ── Índices ──
create index if not exists idx_rececoes_pecas_numero  on public.rececoes_pecas(numero);
create index if not exists idx_rececoes_pecas_estado  on public.rececoes_pecas(estado);
create index if not exists idx_rececoes_pecas_created on public.rececoes_pecas(created_at desc);
create index if not exists idx_rpi_rececao on public.rececoes_pecas_itens(rececao_id);

-- ── RLS ──
alter table public.rececoes_pecas          enable row level security;
alter table public.rececoes_pecas_itens    enable row level security;
alter table public.rececoes_pecas_contador enable row level security; -- sem políticas: só via função

drop policy if exists rececoes_pecas_select on public.rececoes_pecas;
drop policy if exists rececoes_pecas_insert on public.rececoes_pecas;
drop policy if exists rececoes_pecas_update on public.rececoes_pecas;
drop policy if exists rececoes_pecas_delete on public.rececoes_pecas;
create policy rececoes_pecas_select on public.rececoes_pecas for select to authenticated using (true);
create policy rececoes_pecas_insert on public.rececoes_pecas for insert to authenticated with check (true);
create policy rececoes_pecas_update on public.rececoes_pecas for update to authenticated using (true) with check (true);
create policy rececoes_pecas_delete on public.rececoes_pecas for delete to authenticated using (is_admin());

drop policy if exists rpi_select on public.rececoes_pecas_itens;
drop policy if exists rpi_insert on public.rececoes_pecas_itens;
drop policy if exists rpi_update on public.rececoes_pecas_itens;
drop policy if exists rpi_delete on public.rececoes_pecas_itens;
create policy rpi_select on public.rececoes_pecas_itens for select to authenticated using (true);
create policy rpi_insert on public.rececoes_pecas_itens for insert to authenticated with check (true);
create policy rpi_update on public.rececoes_pecas_itens for update to authenticated using (true) with check (true);
create policy rpi_delete on public.rececoes_pecas_itens for delete to authenticated using (true);

grant select, insert, update, delete on public.rececoes_pecas       to authenticated;
grant select, insert, update, delete on public.rececoes_pecas_itens to authenticated;
