-- Receção de Encomendas — registo central de entradas/saídas de peças e "matches"
-- (agrupamento de movimentos que se relacionam, ex.: peça enviada a reparar e
--  depois devolvida).
--
-- Nota de ordenação: este ficheiro tem data 2025-06-30 conforme pedido. A
-- sincronização automática a partir de reparacao_pecas (criado em 2026-06/07) é
-- feita por um trigger que só é criado se a tabela de origem já existir
-- (guarda com to_regclass), para o push funcionar mesmo com ordem de migração
-- diferente.

-- Função partilhada de updated_at (idempotente; definida noutras migrações também)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Tabela de matches (agrupamento de movimentos relacionados) ──
create table if not exists public.recepcao_match (
  id                uuid primary key default gen_random_uuid(),
  numero            text unique,                                  -- MC-YYYY-NNNN (trigger)
  descricao         text,
  contraparte       text,                                         -- quem enviou/recebeu
  contraparte_tipo  text check (contraparte_tipo in ('cliente','fornecedor_reparacao','interno')),
  estado            text check (estado in ('pendente','fechado','parcial')) default 'pendente',
  movimentos_saida   integer default 0,
  movimentos_entrada integer default 0,
  itens_pendentes    integer default 0,
  notas             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ── Tabela central de movimentos (todas as entradas e saídas) ──
create table if not exists public.recepcao_movimentos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('entrada','saida')),
  data_movimento    date not null default current_date,
  origem_destino    text not null,                                -- ex.: "Meditek", "João Silva"
  descricao         text not null,                                -- ex.: "Fibra 18mm × 3"
  quantidade        integer default 1,
  serial_numbers    text[],                                       -- SNs quando aplicável
  equipamento_sn    text,                                         -- SN do equipamento associado
  equipamento_id    uuid references public.equipamentos(id),
  referencia_tipo   text check (referencia_tipo in ('reparacao','envio_pecas','nota_encomenda','manual')),
  referencia_id     uuid,                                         -- id da reparação / envio / etc.
  referencia_numero text,                                         -- ex.: RPC-2025-0001, EP-2025-0001
  match_status      text check (match_status in ('pendente','fechado','parcial')) default 'pendente',
  match_referencia_id uuid,                                       -- movimento que faz par com este
  match_id          uuid references public.recepcao_match(id) on delete set null,
  qr_lido           boolean default false,
  notas             text,
  criado_por        uuid references auth.users(id),
  criado_por_nome   text,
  created_at        timestamptz default now()
);

create index if not exists idx_recepcao_mov_data       on public.recepcao_movimentos(data_movimento desc);
create index if not exists idx_recepcao_mov_tipo       on public.recepcao_movimentos(tipo);
create index if not exists idx_recepcao_mov_match      on public.recepcao_movimentos(match_id);
create index if not exists idx_recepcao_mov_ref        on public.recepcao_movimentos(referencia_tipo, referencia_id);
create index if not exists idx_recepcao_mov_origem     on public.recepcao_movimentos(origem_destino);
create index if not exists idx_recepcao_match_numero   on public.recepcao_match(numero);

-- ── Contador para numeração automática MC-YYYY-NNNN ──
create table if not exists public.recepcao_match_contador (
  ano    integer primary key,
  ultimo integer default 0
);

-- ── Função + trigger: número MC-YYYY-NNNN ──
create or replace function public.gerar_numero_recepcao_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ano_atual integer := extract(year from now());
  proximo   integer;
begin
  insert into public.recepcao_match_contador (ano, ultimo)
  values (ano_atual, 1)
  on conflict (ano) do update set ultimo = public.recepcao_match_contador.ultimo + 1
  returning ultimo into proximo;
  new.numero := 'MC-' || ano_atual || '-' || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trigger_numero_recepcao_match on public.recepcao_match;
create trigger trigger_numero_recepcao_match
  before insert on public.recepcao_match
  for each row
  when (new.numero is null)
  execute function public.gerar_numero_recepcao_match();

drop trigger if exists trg_recepcao_match_updated_at on public.recepcao_match;
create trigger trg_recepcao_match_updated_at
  before update on public.recepcao_match
  for each row execute function public.set_updated_at();

-- ── Sincronização automática: reparacao_pecas_movimentos → recepcao_movimentos ──
-- Cada movimento de uma reparação gera um movimento central de receção:
--   saída (envio a reparar)        → entrada/saída p/ fornecedor
--   entrada (devolvida reparada)   → entrada do fornecedor
--   substituta_enviada             → saída para o cliente
--   avariada_recebida              → entrada do cliente
create or replace function public.sync_recepcao_from_reparacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rep        public.reparacao_pecas%rowtype;
  v_tipo     text;
  v_origem   text;
  v_desc     text;
begin
  select * into rep from public.reparacao_pecas where id = new.reparacao_id;

  if new.tipo = 'saida' then
    v_tipo := 'saida';  v_origem := coalesce(rep.fornecedor, 'Fornecedor');
  elsif new.tipo = 'entrada' then
    v_tipo := 'entrada'; v_origem := coalesce(rep.fornecedor, 'Fornecedor');
  elsif new.tipo = 'substituta_enviada' then
    v_tipo := 'saida';  v_origem := coalesce(rep.cliente_nome, 'Cliente');
  elsif new.tipo = 'avariada_recebida' then
    v_tipo := 'entrada'; v_origem := coalesce(rep.cliente_nome, 'Cliente');
  else
    return new; -- tipo desconhecido: não sincroniza
  end if;

  v_desc := coalesce(rep.peca, 'Peça');
  if new.sn is not null then v_desc := v_desc || ' · S/N ' || new.sn; end if;

  insert into public.recepcao_movimentos (
    tipo, data_movimento, origem_destino, descricao, quantidade,
    serial_numbers, equipamento_sn, referencia_tipo, referencia_id,
    referencia_numero, notas, criado_por, criado_por_nome
  ) values (
    v_tipo, coalesce(new.data, current_date), v_origem, v_desc, coalesce(new.quantidade, 1),
    case when new.sn is not null then array[new.sn] else null end,
    rep.equipamento_sn, 'reparacao', new.reparacao_id,
    rep.numero, new.notas, new.criado_por, new.criado_por_nome
  );

  return new;
end;
$$;

-- Cria o trigger de sincronização apenas se a tabela de origem já existir.
do $$
begin
  if to_regclass('public.reparacao_pecas_movimentos') is not null then
    drop trigger if exists trigger_sync_recepcao on public.reparacao_pecas_movimentos;
    create trigger trigger_sync_recepcao
      after insert on public.reparacao_pecas_movimentos
      for each row execute function public.sync_recepcao_from_reparacao();
  end if;
end $$;

-- ── RLS: SELECT/INSERT/UPDATE para autenticados ──
alter table public.recepcao_movimentos     enable row level security;
alter table public.recepcao_match           enable row level security;
alter table public.recepcao_match_contador  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'recepcao_movimentos','recepcao_match','recepcao_match_contador'
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
