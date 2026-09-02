-- ───────────────────────────────────────────────────────────────────────────
-- FINANCEIRO — Categorização RICA por cima do #118
--
-- O #118 guarda a categoria do documento em financeiro_movimentos.categoria
-- (chave de texto: servico_tecnico|aluguer|venda|outro) e as comissões dependem
-- da chave 'servico_tecnico'. Aqui tornamos as CATEGORIAS DE TOPO geríveis (numa
-- tabela, em vez de uma lista fixa), acrescentamos SUBCATEGORIAS geríveis e
-- REGRAS automáticas geríveis — sem mexer no significado da coluna `categoria`
-- (continua a ser a chave de topo), por isso as comissões ficam intactas.
--
-- Também limpa os objetos da tentativa anterior (#119), que chegou a ser
-- aplicada à BD mas foi descartada.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 0. Limpeza da tentativa #119 (se existir) ────────────────────────────────
alter table public.financeiro_movimentos drop column if exists categoria_id;
alter table public.financeiro_movimentos drop column if exists subcategoria_id;
drop table if exists public.financeiro_regras_categoria cascade;
drop table if exists public.financeiro_categorias cascade;
-- financeiro_import_perfis mantém-se (será usada na importação completa / B2).

-- ── 1. Categorias de topo (geríveis). Seed com as 4 canónicas do #118. ────────
create table public.financeiro_categorias (
  id         uuid primary key default gen_random_uuid(),
  chave      text not null unique,            -- estável; a 'categoria' do movimento aponta para aqui
  label      text not null,
  icon       text,
  cor        text,
  bg         text,
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  protegida  boolean not null default false,  -- true = não se pode apagar (ex.: alimenta as comissões)
  created_at timestamptz not null default now()
);
insert into public.financeiro_categorias (chave, label, icon, cor, bg, ordem, protegida) values
  ('servico_tecnico', 'Serviço técnico', '🔧', '#1E40AF', '#DBEAFE', 1, true),
  ('aluguer',         'Aluguer',         '📅', '#5B21B6', '#EDE9FE', 2, true),
  ('venda',           'Venda',           '🛒', '#065F46', '#D1FAE5', 3, true),
  ('outro',           'Outro',           '📄', '#374151', '#F3F4F6', 4, true);

-- ── 2. Subcategorias (geríveis) por categoria ────────────────────────────────
create table public.financeiro_subcategorias (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.financeiro_categorias(id) on delete cascade,
  nome         text not null,
  ordem        int  not null default 0,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index uq_fin_subcat_nome on public.financeiro_subcategorias(categoria_id, lower(nome));
create index idx_fin_subcat_cat on public.financeiro_subcategorias(categoria_id);

-- ── 3. Movimentos: subcategoria opcional (o topo continua na coluna `categoria`)
alter table public.financeiro_movimentos
  add column if not exists subcategoria_id uuid references public.financeiro_subcategorias(id) on delete set null;
-- Deixar de restringir a categoria a uma lista fixa (agora é gerível).
alter table public.financeiro_movimentos drop constraint if exists financeiro_movimentos_categoria_check;
create index if not exists idx_fin_mov_subcat on public.financeiro_movimentos(subcategoria_id) where subcategoria_id is not null;

-- ── 4. Regras automáticas de categorização (geríveis) ────────────────────────
create table public.financeiro_regras_categoria (
  id              uuid primary key default gen_random_uuid(),
  ordem           int  not null default 0,     -- 1ª regra ativa que casa vence
  ativo           boolean not null default true,
  campo           text not null default 'descricao'
                    check (campo in ('descricao','documento_ref','entidade_nome')),
  operador        text not null default 'contem'
                    check (operador in ('contem','comeca','igual')),
  valor           text not null,
  categoria_chave text not null,               -- chave da categoria de topo
  subcategoria_id uuid references public.financeiro_subcategorias(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_fin_regra_ordem on public.financeiro_regras_categoria(ordem);

-- ── 5. RLS + grants (só admin + financeiro) ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'financeiro_categorias',
    'financeiro_subcategorias',
    'financeiro_regras_categoria'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_acesso', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_financeiro_access()) with check (public.has_financeiro_access())',
      t || '_acesso', t
    );
  end loop;
end $$;
