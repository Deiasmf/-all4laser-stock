-- Fluxo de preparação e expedição das Notas de Encomenda.
-- 4 fases: logística (preparação) → técnico (preparação) → logística
-- (encaixotamento) → administrativo (expedição). Cada fase é um registo em
-- ne_fluxo; encaixotamento e expedição têm dados próprios + ficheiros.
-- Segue os padrões dos módulos Folhas de Obra / Notas de Encomenda.

-- ───────────────────────────────────────────────────────────────────────────
-- ne_fluxo — uma linha por fase de cada nota
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.ne_fluxo (
  id               uuid primary key default gen_random_uuid(),
  nota_id          uuid not null references public.notas_encomenda(id) on delete cascade,
  fase             text not null
                     check (fase in ('logistica_preparacao','tecnico_preparacao','logistica_encaixotamento','admin_expedicao')),
  estado           text not null default 'pendente'
                     check (estado in ('pendente','em_curso','concluido')),
  responsavel_id   uuid references auth.users(id),
  responsavel_nome text,
  notas            text,
  concluido_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (nota_id, fase)
);

-- ───────────────────────────────────────────────────────────────────────────
-- ne_encaixotamento — dados da fase de encaixotamento
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.ne_encaixotamento (
  id                    uuid primary key default gen_random_uuid(),
  nota_id               uuid not null references public.notas_encomenda(id) on delete cascade,
  caixa_tipo            text,
  interior_comprimento  numeric,
  interior_largura      numeric,
  interior_altura       numeric,
  exterior_comprimento  numeric,
  exterior_largura      numeric,
  exterior_altura       numeric,
  peso_bruto            numeric,
  peso_liquido          numeric,
  notas                 text,
  created_at            timestamptz not null default now()
);
create index if not exists idx_ne_encaix_nota on public.ne_encaixotamento(nota_id);

-- ne_encaixotamento_fotos — fotos/vídeos do encaixotamento
create table if not exists public.ne_encaixotamento_fotos (
  id          uuid primary key default gen_random_uuid(),
  nota_id     uuid not null references public.notas_encomenda(id) on delete cascade,
  url         text,
  caminho     text,
  tipo        text check (tipo in ('foto','video')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_ne_encaix_fotos_nota on public.ne_encaixotamento_fotos(nota_id);

-- ───────────────────────────────────────────────────────────────────────────
-- ne_expedicao — dados da fase administrativa (uma por nota)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.ne_expedicao (
  id                    uuid primary key default gen_random_uuid(),
  nota_id               uuid not null unique references public.notas_encomenda(id) on delete cascade,
  transportador         text,
  valor_transporte      numeric,
  fatura_url            text,
  fatura_caminho        text,
  packing_list_url      text,
  packing_list_caminho  text,
  doc_exportacao_url    text,
  doc_exportacao_caminho text,
  doc_exportacao_tipo   text,
  notas                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- ÍNDICES ne_fluxo
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_ne_fluxo_nota        on public.ne_fluxo(nota_id);
create index if not exists idx_ne_fluxo_fase_estado on public.ne_fluxo(fase, estado);

-- ───────────────────────────────────────────────────────────────────────────
-- TRIGGERS updated_at (set_updated_at() já existe)
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_ne_fluxo_updated_at on public.ne_fluxo;
create trigger trg_ne_fluxo_updated_at before update on public.ne_fluxo
  for each row execute function public.set_updated_at();

drop trigger if exists trg_ne_expedicao_updated_at on public.ne_expedicao;
create trigger trg_ne_expedicao_updated_at before update on public.ne_expedicao
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — leitura/escrita (select/insert/update) para autenticados
-- ───────────────────────────────────────────────────────────────────────────
alter table public.ne_fluxo               enable row level security;
alter table public.ne_encaixotamento      enable row level security;
alter table public.ne_encaixotamento_fotos enable row level security;
alter table public.ne_expedicao           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ne_fluxo','ne_encaixotamento','ne_encaixotamento_fotos','ne_expedicao']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- STORAGE — buckets públicos para fotos/vídeos do encaixotamento e documentos
-- de expedição (URL com caminho aleatório; mesmo padrão das folhas de obra).
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('ne-encaixotamento','ne-encaixotamento', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('ne-expedicao','ne-expedicao', true)
  on conflict (id) do nothing;

do $$
declare b text;
begin
  foreach b in array array['ne-encaixotamento','ne-expedicao']
  loop
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_') || '_select');
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_') || '_insert');
    execute format('drop policy if exists %I on storage.objects', replace(b,'-','_') || '_delete');
    execute format('create policy %I on storage.objects for select using (bucket_id = %L)', replace(b,'-','_') || '_select', b);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)', replace(b,'-','_') || '_insert', b);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)', replace(b,'-','_') || '_delete', b);
  end loop;
end $$;
