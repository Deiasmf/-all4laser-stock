-- Módulo Notas de Encomenda (Área Comercial) — All4laser Internal Platform
-- Tabelas: notas_encomenda (+ contador p/ numeração) e notas_encomenda_material.
-- Numeração automática NE-YYYY-NNNN (sequência reinicia a cada ano), trigger de
-- updated_at, RLS e índices. Segue os mesmos padrões do módulo Folhas de Obra.

-- ───────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL: notas_encomenda
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.notas_encomenda (
  id                  uuid primary key default gen_random_uuid(),
  numero              text unique,                         -- NE-YYYY-NNNN (gerado por trigger)
  data_pedido         date not null default current_date,

  -- Cliente (id ligado + cópia desnormalizada para histórico)
  cliente_id          uuid references public.clientes(id),
  cliente_nome        text,
  pais_destino        text,

  -- Equipamento (id ligado + cópia desnormalizada)
  equipamento_id      uuid references public.equipamentos(id),
  equipamento_modelo  text,
  equipamento_sn      text,
  equipamento_ano     text,

  detalhes_tecnicos   text,

  capas               text check (capas in ('Originais','Substituição','Sem capas')),
  observacoes         text,

  estado              text not null default 'emitida'
                        check (estado in ('emitida','em_preparacao','expedida','cancelada')),

  criado_por          uuid references auth.users(id),
  criado_por_nome     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- MATERIAL que acompanha a nota (uma linha por item escolhido)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.notas_encomenda_material (
  id         uuid primary key default gen_random_uuid(),
  nota_id    uuid not null references public.notas_encomenda(id) on delete cascade,
  categoria  text,                                          -- ex.: 'Candela', 'Comuns', 'Outros acessórios'
  item       text,
  ordem      int not null default 0
);

-- ───────────────────────────────────────────────────────────────────────────
-- NUMERAÇÃO AUTOMÁTICA: NE-YYYY-NNNN (sequência por ano, reinicia em 0001)
-- Contador atómico (ON CONFLICT) seguro em concorrência. SECURITY DEFINER para
-- gerir o contador sem expor a tabela à RLS.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.notas_encomenda_contador (
  ano    int  primary key,
  ultimo int  not null default 0
);

create or replace function public.gerar_numero_nota_encomenda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ano int;
  v_seq int;
begin
  -- Respeita um número já fornecido manualmente (migração/importação)
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  v_ano := extract(year from coalesce(new.data_pedido, current_date))::int;

  insert into public.notas_encomenda_contador as c (ano, ultimo)
       values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;

  new.numero := 'NE-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_notas_encomenda_numero on public.notas_encomenda;
create trigger trg_notas_encomenda_numero
  before insert on public.notas_encomenda
  for each row execute function public.gerar_numero_nota_encomenda();

-- set_updated_at() já existe (criada no módulo Folhas de Obra)
drop trigger if exists trg_notas_encomenda_updated_at on public.notas_encomenda;
create trigger trg_notas_encomenda_updated_at
  before update on public.notas_encomenda
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_notas_encomenda_numero  on public.notas_encomenda(numero);
create index if not exists idx_notas_encomenda_cliente on public.notas_encomenda(cliente_id);
create index if not exists idx_notas_encomenda_estado  on public.notas_encomenda(estado);
create index if not exists idx_notas_encomenda_data    on public.notas_encomenda(data_pedido desc);
create index if not exists idx_nem_nota               on public.notas_encomenda_material(nota_id);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.notas_encomenda          enable row level security;
alter table public.notas_encomenda_material enable row level security;
alter table public.notas_encomenda_contador enable row level security;  -- sem políticas: só via função SECURITY DEFINER

-- notas_encomenda: leitura/escrita p/ autenticados; eliminar só admin
drop policy if exists notas_encomenda_select on public.notas_encomenda;
drop policy if exists notas_encomenda_insert on public.notas_encomenda;
drop policy if exists notas_encomenda_update on public.notas_encomenda;
drop policy if exists notas_encomenda_delete on public.notas_encomenda;
create policy notas_encomenda_select on public.notas_encomenda for select to authenticated using (true);
create policy notas_encomenda_insert on public.notas_encomenda for insert to authenticated with check (true);
create policy notas_encomenda_update on public.notas_encomenda for update to authenticated using (true) with check (true);
create policy notas_encomenda_delete on public.notas_encomenda for delete to authenticated using (is_admin());

-- notas_encomenda_material: leitura/escrita p/ autenticados; eliminar só admin
drop policy if exists nem_select on public.notas_encomenda_material;
drop policy if exists nem_insert on public.notas_encomenda_material;
drop policy if exists nem_update on public.notas_encomenda_material;
drop policy if exists nem_delete on public.notas_encomenda_material;
create policy nem_select on public.notas_encomenda_material for select to authenticated using (true);
create policy nem_insert on public.notas_encomenda_material for insert to authenticated with check (true);
create policy nem_update on public.notas_encomenda_material for update to authenticated using (true) with check (true);
create policy nem_delete on public.notas_encomenda_material for delete to authenticated using (is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- GRANTs (tabelas criadas por SQL não recebem privilégios automáticos; a RLS
-- continua a ser a barreira real). O contador NÃO é concedido — só a função.
-- ───────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.notas_encomenda          to authenticated;
grant select, insert, update, delete on public.notas_encomenda_material  to authenticated;
