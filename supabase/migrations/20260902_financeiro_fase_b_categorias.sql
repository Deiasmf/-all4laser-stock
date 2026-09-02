-- ───────────────────────────────────────────────────────────────────────────
-- FINANCEIRO · FASE B — Categorização + Regras automáticas + Perfil de import
--
-- Acrescenta a categorização dos documentos (movimentos), regras que aplicam
-- categorias automaticamente na importação, e um perfil de mapeamento de colunas
-- do Excel/Keyinvoice para não reconfigurar em cada importação.
--
-- Não altera valores nem a lógica de liquidação existente (isso é a Fase B2).
-- Acesso só a admin + financeiro via has_financeiro_access() (mesmo padrão).
-- ───────────────────────────────────────────────────────────────────────────

-- ── Categorias (e subcategorias, via parent_id auto-referência) ──────────────
create table if not exists public.financeiro_categorias (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.financeiro_categorias(id) on delete cascade,
  nome       text not null,
  cor        text,                       -- badge opcional (ex.: '#DBEAFE')
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
-- Nome único por nível (categorias de topo entre si; subcategorias dentro do pai).
create unique index if not exists uq_fin_cat_nome
  on public.financeiro_categorias(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
create index if not exists idx_fin_cat_parent on public.financeiro_categorias(parent_id);

-- Seed das categorias iniciais (só se a tabela estiver vazia).
insert into public.financeiro_categorias (nome, ordem)
select v.nome, v.ordem
from (values
  ('Venda de equipamento', 1),
  ('Aluguer',              2),
  ('Peças',                3),
  ('Reparação/Serviço',    4),
  ('Outros',               5)
) as v(nome, ordem)
where not exists (select 1 from public.financeiro_categorias);

-- ── Regras automáticas de categorização (aplicadas na importação) ────────────
create table if not exists public.financeiro_regras_categoria (
  id             uuid primary key default gen_random_uuid(),
  ordem          int  not null default 0,      -- 1ª regra que casa vence
  ativo          boolean not null default true,
  campo          text not null default 'descricao'
                   check (campo in ('descricao','documento_ref','entidade_nome')),
  operador       text not null default 'contem'
                   check (operador in ('contem','comeca','igual')),
  valor          text not null,                -- texto a procurar (case-insensitive)
  categoria_id   uuid references public.financeiro_categorias(id) on delete cascade,
  subcategoria_id uuid references public.financeiro_categorias(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_fin_regra_ordem on public.financeiro_regras_categoria(ordem);

-- ── Perfil de mapeamento do import (colunas do Excel → campos) ───────────────
-- Guarda o último mapeamento usado para não reconfigurar em cada importação.
create table if not exists public.financeiro_import_perfis (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null default 'Keyinvoice',
  mapeamento  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Colunas novas nos movimentos: categoria, subcategoria e descrição ────────
alter table public.financeiro_movimentos
  add column if not exists categoria_id    uuid references public.financeiro_categorias(id) on delete set null,
  add column if not exists subcategoria_id uuid references public.financeiro_categorias(id) on delete set null,
  add column if not exists descricao       text;
create index if not exists idx_fin_mov_categoria on public.financeiro_movimentos(categoria_id) where categoria_id is not null;

-- ── RLS + grants (só admin + financeiro) para as tabelas novas ───────────────
do $$
declare t text;
begin
  foreach t in array array[
    'financeiro_categorias',
    'financeiro_regras_categoria',
    'financeiro_import_perfis'
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
