-- Processos de Peças — reconstrói o fluxo Receção/Envio como "processos" ponta-a-ponta.
-- Cada processo agrupa todos os movimentos de um caso (cortesia+reparação, garantia, etc.).
-- Substitui o módulo de Receção de Encomendas.
-- Nota: datado 2026-07-03 (não 2025) porque referencia tabelas criadas em migrações de 2026
-- (fornecedores_reparacao, reparacao_pecas) — um nome de 2025 partiria um replay do zero.

-- ── Coluna auxiliar em pecas: peças avariadas que ficam a aguardar reparação ──
alter table public.pecas add column if not exists status_reparacao text default null;

-- ───────────────────────────────────────────────────────────────────────────
-- TABELA PRINCIPAL: processos_pecas
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.processos_pecas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                                  -- PP-YYYY-NNNN (trigger)
  tipo_fluxo text not null check (tipo_fluxo in (
    'cortesia_reparacao_externa',
    'garantia_substituta_permanente',
    'garantia_cliente_envia_primeiro'
  )),
  estado text not null default 'aberto' check (estado in (
    'aberto','em_curso','aguarda_cliente','aguarda_reparacao','aguarda_pagamento',
    'aguarda_devolucao_cortesia','fechado','cancelado'
  )),
  -- Cliente
  cliente_id uuid references public.clientes(id),
  cliente_nome text not null,
  -- Peça
  peca_id uuid references public.pecas(id),
  peca_descricao text not null,
  tem_sn boolean default false,
  sn_avariado text,
  sn_substituto text,
  equipamento_id uuid references public.equipamentos(id),
  equipamento_sn text,
  -- Garantia
  em_garantia boolean default false,
  tipo_garantia text check (tipo_garantia in ('sem_garantia','garantia_nossa','garantia_fabricante','garantia_fornecedor_servico')),
  responsavel_pagamento text check (responsavel_pagamento in ('cliente','all4laser','fabricante','fornecedor_servico')),
  -- Reparação externa (Caso 1)
  fornecedor_reparacao_id uuid references public.fornecedores_reparacao(id),
  fornecedor_reparacao_nome text,
  -- Faturação (Caso 1 fora de garantia)
  valor_a_faturar numeric,
  faturado boolean default false,
  pago boolean default false,
  data_pagamento date,
  -- Substituta
  substituta_peca_id uuid references public.pecas(id),
  substituta_descricao text,
  substituta_permanente boolean default false,
  -- Notas / meta
  notas text,
  criado_por uuid references auth.users(id),
  criado_por_nome text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Movimentos individuais de cada processo ──
create table if not exists public.processos_pecas_movimentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references public.processos_pecas(id) on delete cascade,
  tipo text not null check (tipo in (
    'enviamos_substituta',
    'cliente_enviou_avariada',
    'enviamos_para_reparacao',
    'recebemos_de_reparacao',
    'enviamos_reparada_cliente',
    'cliente_devolveu_cortesia',
    'entrou_no_stock',
    'manual'
  )),
  data_movimento date not null default current_date,
  quantidade integer default 1,
  itens jsonb,
  sn text,
  origem text,
  destino text,
  notas text,
  criado_por uuid references auth.users(id),
  criado_por_nome text,
  created_at timestamptz default now()
);

-- ── Itens para peças sem SN (tracking de quantidades) ──
create table if not exists public.processos_pecas_itens (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references public.processos_pecas(id) on delete cascade,
  descricao text not null,
  quantidade_total integer default 1,
  quantidade_recebida integer default 0,
  quantidade_pendente integer generated always as (quantidade_total - quantidade_recebida) stored,
  estado text default 'pendente' check (estado in ('pendente','parcial','completo')),
  created_at timestamptz default now()
);

-- ── Contador para numeração PP-YYYY-NNNN ──
create table if not exists public.processos_pecas_contador (
  ano integer primary key,
  ultimo integer default 0
);

create or replace function public.gerar_numero_processo_peca()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ano_atual integer := extract(year from now());
  proximo integer;
begin
  insert into public.processos_pecas_contador (ano, ultimo) values (ano_atual, 1)
  on conflict (ano) do update set ultimo = public.processos_pecas_contador.ultimo + 1
  returning ultimo into proximo;
  new.numero := 'PP-' || ano_atual || '-' || lpad(proximo::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trigger_numero_processo_peca on public.processos_pecas;
create trigger trigger_numero_processo_peca
  before insert on public.processos_pecas
  for each row when (new.numero is null)
  execute function public.gerar_numero_processo_peca();

drop trigger if exists trg_processos_pecas_updated_at on public.processos_pecas;
create trigger trg_processos_pecas_updated_at
  before update on public.processos_pecas
  for each row execute function public.set_updated_at();

-- ── Índices ──
create index if not exists idx_processos_pecas_numero  on public.processos_pecas(numero);
create index if not exists idx_processos_pecas_estado  on public.processos_pecas(estado);
create index if not exists idx_processos_pecas_fluxo   on public.processos_pecas(tipo_fluxo);
create index if not exists idx_processos_pecas_cliente on public.processos_pecas(cliente_id);
create index if not exists idx_processos_pecas_created on public.processos_pecas(created_at desc);
create index if not exists idx_ppm_processo on public.processos_pecas_movimentos(processo_id);
create index if not exists idx_ppi_processo on public.processos_pecas_itens(processo_id);

-- ── RLS ──
alter table public.processos_pecas            enable row level security;
alter table public.processos_pecas_movimentos enable row level security;
alter table public.processos_pecas_itens      enable row level security;
alter table public.processos_pecas_contador   enable row level security; -- sem políticas: só via função

do $$
declare t text;
begin
  foreach t in array array['processos_pecas','processos_pecas_movimentos','processos_pecas_itens'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Delete: processo só admin; filhos caem em cascata (permitido a autenticados)
create policy processos_pecas_delete on public.processos_pecas for delete to authenticated using (is_admin());
create policy processos_pecas_movimentos_delete on public.processos_pecas_movimentos for delete to authenticated using (true);
create policy processos_pecas_itens_delete on public.processos_pecas_itens for delete to authenticated using (true);
