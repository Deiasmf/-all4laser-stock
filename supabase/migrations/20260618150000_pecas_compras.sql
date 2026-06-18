-- Módulo Gestão de Peças e Compras.
-- Peças em falta por equipamento + pedidos de compra (com cotações/receção) +
-- fornecedores. Segue os padrões dos módulos anteriores (numeração por ano,
-- updated_at, RLS authenticated com delete só admin).

-- ───────────────────────────────────────────────────────────────────────────
-- Stock de peças: localização + alertas de stock mínimo
-- ───────────────────────────────────────────────────────────────────────────
alter table public.pecas add column if not exists localizacao text;
alter table public.pecas add column if not exists stock_minimo_alerta1 integer default 20;
alter table public.pecas add column if not exists stock_minimo_alerta2 integer default 10;

-- ───────────────────────────────────────────────────────────────────────────
-- Peças em falta por equipamento (equipamento_id nullable: permite SN ainda
-- não catalogado no stock de equipamentos)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.equipamento_pecas_em_falta (
  id                     uuid primary key default gen_random_uuid(),
  equipamento_id         uuid references public.equipamentos(id) on delete cascade,
  equipamento_sn         text,
  equipamento_modelo     text,
  peca_id                uuid references public.pecas(id),
  peca_nome              text,
  quantidade_necessaria  integer not null default 1,
  estado                 text not null default 'em_falta' check (estado in ('em_falta','pedida','recebida')),
  notas                  text,
  criado_por             uuid references auth.users(id),
  criado_por_nome        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_epf_equip on public.equipamento_pecas_em_falta(equipamento_id);
create index if not exists idx_epf_sn    on public.equipamento_pecas_em_falta(equipamento_sn);
create index if not exists idx_epf_peca  on public.equipamento_pecas_em_falta(peca_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Pedidos de compra (numeração PC-YYYY-NNNN)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pedidos_compra (
  id               uuid primary key default gen_random_uuid(),
  numero           text unique,
  estado           text not null default 'rascunho'
                     check (estado in ('rascunho','enviado','em_cotacao','aprovado','encomendado','recebido_parcial','recebido_total','cancelado')),
  urgente          boolean not null default false,
  notas            text,
  criado_por       uuid references auth.users(id),
  criado_por_nome  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.pedidos_compra_itens (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references public.pedidos_compra(id) on delete cascade,
  peca_id              uuid references public.pecas(id),
  peca_nome            text,
  quantidade           integer not null default 1,
  quantidade_recebida  integer not null default 0,
  notas                text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_pci_pedido on public.pedidos_compra_itens(pedido_id);
create index if not exists idx_pci_peca   on public.pedidos_compra_itens(peca_id);

create table if not exists public.pedidos_compra_cotacoes (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references public.pedidos_compra(id) on delete cascade,
  fornecedor           text,
  valor_total          numeric,
  prazo_entrega_dias   integer,
  notas                text,
  selecionado          boolean not null default false,
  criado_por           uuid references auth.users(id),
  criado_por_nome      text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_pcc_pedido on public.pedidos_compra_cotacoes(pedido_id);

create table if not exists public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text unique not null,
  contacto    text,
  email       text,
  notas       text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.fornecedores (nome) values
  ('Parts4Laser'), ('Friomedic'), ('Repair4Laser'), ('Meditek')
on conflict (nome) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- Numeração PC-YYYY-NNNN
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pedidos_compra_contador (
  ano    int primary key,
  ultimo int not null default 0
);

create or replace function public.gerar_numero_pedido_compra()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ano int; v_seq int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then return new; end if;
  v_ano := extract(year from now())::int;
  insert into public.pedidos_compra_contador as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1 returning ultimo into v_seq;
  new.numero := 'PC-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
  return new;
end; $$;

drop trigger if exists trg_pedidos_compra_numero on public.pedidos_compra;
create trigger trg_pedidos_compra_numero before insert on public.pedidos_compra
  for each row execute function public.gerar_numero_pedido_compra();

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at (set_updated_at() já existe)
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_pedidos_compra_updated_at on public.pedidos_compra;
create trigger trg_pedidos_compra_updated_at before update on public.pedidos_compra
  for each row execute function public.set_updated_at();

drop trigger if exists trg_pcc_updated_at on public.pedidos_compra_cotacoes;
create trigger trg_pcc_updated_at before update on public.pedidos_compra_cotacoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_epf_updated_at on public.equipamento_pecas_em_falta;
create trigger trg_epf_updated_at before update on public.equipamento_pecas_em_falta
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- Incrementar stock de uma peça (receção). SECURITY DEFINER: a RLS de `pecas`
-- só deixa o admin escrever; isto permite registar receções como qualquer
-- utilizador autenticado sem abrir a escrita direta da tabela.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.incrementar_stock_peca(p_peca_id uuid, p_qtd integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_peca_id is null or coalesce(p_qtd, 0) = 0 then return; end if;
  update public.pecas set quantidade = quantidade + p_qtd, updated_at = now() where id = p_peca_id;
end; $$;
grant execute on function public.incrementar_stock_peca(uuid, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: select/insert/update authenticated; delete só admin
-- ───────────────────────────────────────────────────────────────────────────
alter table public.equipamento_pecas_em_falta enable row level security;
alter table public.pedidos_compra            enable row level security;
alter table public.pedidos_compra_itens      enable row level security;
alter table public.pedidos_compra_cotacoes   enable row level security;
alter table public.fornecedores              enable row level security;

do $$
declare t text;
begin
  foreach t in array array['equipamento_pecas_em_falta','pedidos_compra','pedidos_compra_itens','pedidos_compra_cotacoes','fornecedores']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (is_admin())', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- SEED: peças em falta por equipamento (liga por serial_number; SN sem
-- equipamento fica com equipamento_id null mas guarda o SN)
-- ───────────────────────────────────────────────────────────────────────────
with dados(sn, peca_nome, qtd) as (
  values
    ('9914-9030-16661','flash lamps',45),
    ('9914-9030-16661','Flowtubes',100),
    ('9914-9030-16661','counts yag',20),
    ('9914-9030-16661','Shutter mecanismo',4),
    ('9914-9030-16661','Shutter bloco inteiro',4),
    ('9914-9030-16661','Rod yag',1),
    ('9914-9030-16661','Triple Bore yag',10),
    ('9914-9030-16661','Triple Bore Alex',10),
    ('9914-9030-16661','Conector agua direito PN:CAWC3146',15),
    ('9914-9030-16661','Condensadores',1),
    ('9914-9030-16661','Contator Preto Gmax/Gpro',2),
    ('9914-9030-16661','Bloco Focais completo',2),
    ('9914-9030-16661','Cilindro lentes focais',2),
    ('9914-9030-16661','O-rings Pretos bloco focais',1),
    ('9914-9030-16661','Bloco lentes 20',2),
    ('9914-9030-16661','Lente #20',2),
    ('9914-9030-16661','Lente #11',10),
    ('9914-9030-16661','Parafusos cabeças',40),
    ('9914-9030-16661','conjunto de fibras azul/amarela',4),
    ('9914-9030-16661','ligações filtro Água macho e femea',1),
    ('9914-9030-16661','Canhões chave',1),
    ('9914-9030-16661','Botões de emergencia',1),
    ('9914-9030-16661','fibras MGL',8),
    ('9914-9030-16661','Ligação água Fino',15),
    ('9914-9030-16661','Ligação Água grosso',15),
    ('9914-9030-16661','T Fino',5),
    ('9914-9030-16661','Bomba de água',1),

    ('9914-9035-14867','fonte',1),
    ('9914-9035-14867','sensor Temperatura',1),
    ('9914-9035-14867','condensador',1),
    ('9914-9035-14867','conjunto de fibras azul/amarela',1),
    ('9914-9035-14867','botao de emergencia e canhão',1),

    ('9914-9030-18943','fonte',1),
    ('9914-9030-18943','sensor temperatura',1),
    ('9914-9030-18943','sensor de nivel de agua',1),
    ('9914-9030-18943','cpu',1),
    ('9914-9030-18943','bloco shutter',1),
    ('9914-9030-18943','calport',1),
    ('9914-9030-18943','botao de emergencia e canhão',1),

    ('9914-9035-16092','lin ID',1),
    ('9914-9035-16092','ecrâ completo com cpu',1),
    ('9914-9035-16092','fonte',1),
    ('9914-9035-16092','calport',1),
    ('9914-9035-16092','conjunto de fibras azul/amarela',1),
    ('9914-9035-16092','Shutter mecanismo',1),
    ('9914-9035-16092','condensador',1),

    ('9914-9030-15002','ecrâ completo com cpu',1),
    ('9914-9030-15002','Fonte',1),
    ('9914-9030-15002','sensor temperatura',1),
    ('9914-9030-15002','cpu',1),
    ('9914-9030-15002','shutter mecanismo',1),
    ('9914-9030-15002','Valvula de crio',1),
    ('9914-9030-15002','placa de distribuição',1),
    ('9914-9030-15002','contactor',1),
    ('9914-9030-15002','placas do condensador',1),
    ('9914-9030-15002','condensador',1),
    ('9914-9030-15002','ventoinha copo crio',1),
    ('9914-9030-15002','botao de emergencia e canhão',1),

    ('9914-9030-19997','placas do condensador',1),
    ('9914-9030-19997','condensador',1),
    ('9914-9030-19997','bloco lente 20',1),
    ('9914-9030-19997','bloco lente 21',1),
    ('9914-9030-19997','shutter',1),
    ('9914-9030-19997','Válvula crio',1),

    ('9914-9035-10869','ecrâ completo com cpu',1),
    ('9914-9035-10869','Fonte',1),
    ('9914-9035-10869','calport',1),
    ('9914-9035-10869','botao de emergencia e canhão',1),
    ('9914-9035-10869','valvula crio',1),

    ('9914-9035-14282','fonte',1),
    ('9914-9035-14282','shutter',1),

    ('9914-9035-15753','Fonte',1),
    ('9914-9035-15753','sensor nivel agua',1),
    ('9914-9035-15753','sensor temperatura',1),
    ('9914-9035-15753','bloco focais',1),
    ('9914-9035-15753','lin id',1),
    ('9914-9035-15753','calport',1),
    ('9914-9035-15753','bloco lente 22',1),
    ('9914-9035-15753','dump',1),
    ('9914-9035-15753','condensador',1),
    ('9914-9035-15753','conjunto fibras azuis/amarelas',1),
    ('9914-9035-15753','botao de emergencia e canhão',1),
    ('9914-9035-15753','válvula crio',1),

    ('9914-9035-10899','ecrâ completo',1),
    ('9914-9035-10899','Fonte',1),
    ('9914-9035-10899','sensor temperatura',1),

    ('9914-9035-10881','Lin ID',1),
    ('9914-9035-10881','shutter',1),
    ('9914-9035-10881','bloco focais',1),
    ('9914-9035-10881','cpu',1),
    ('9914-9035-10881','dump',1),
    ('9914-9035-10881','condensador',1),
    ('9914-9035-10881','fonte',1),
    ('9914-9035-10881','calport',1),

    ('9914-9030-18577','bloco focais',1),
    ('9914-9030-18577','botao de emergencia e canhão',1),
    ('9914-9030-18577','placas do condensador',1),
    ('9914-9030-18577','condensador',1),
    ('9914-9030-18577','placa de delivery',1),
    ('9914-9030-18577','valvula crio',1),
    ('9914-9030-18577','fonte',1),

    ('9914-9030-18348','fonte',1),

    ('9914-9030-18579','fonte',1),

    ('9914-9036-15077','fonte',1),
    ('9914-9036-15077','cabeça yag',1),

    ('9914-9036-15866','cabeça yag (em falta)',1),
    ('9914-9036-15866','fonte',1)
)
insert into public.equipamento_pecas_em_falta
  (equipamento_id, equipamento_sn, equipamento_modelo, peca_nome, quantidade_necessaria, estado)
select e.id, d.sn, e.modelo, d.peca_nome, d.qtd, 'em_falta'
from dados d
left join public.equipamentos e on e.serial_number = d.sn;
