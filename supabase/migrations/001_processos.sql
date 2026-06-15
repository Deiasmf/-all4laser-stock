-- Módulo Processos — tabelas, RLS e view
-- All4laser Internal Platform
-- Gaps são modelados ao nível da ÁREA (é assim que o Manual de Processos os lista).

-- ÁREAS FUNCIONAIS
create table if not exists public.areas_processos (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  nome        text not null,
  icone       text not null,
  cor_accent  text not null,        -- hex sem '#'
  ordem       int  not null default 0,
  created_at  timestamptz default now()
);

-- PROCESSOS
create table if not exists public.processos (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.areas_processos(id) on delete cascade,
  nome        text not null,
  descricao   text not null,
  responsavel text not null,
  status      text not null check (status in ('ativo','em-transicao','por-criar','planeamento','parcial')),
  notas       text,
  ordem       int  not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- PASSOS DO FLUXO
create table if not exists public.processo_steps (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  ordem       int  not null,
  acao        text not null
);

-- INPUTS
create table if not exists public.processo_inputs (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  texto       text not null,
  ordem       int  not null default 0
);

-- OUTPUTS
create table if not exists public.processo_outputs (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  texto       text not null,
  ordem       int  not null default 0
);

-- KPIs
create table if not exists public.processo_kpis (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  texto       text not null,
  ordem       int  not null default 0
);

-- FERRAMENTAS
create table if not exists public.processo_ferramentas (
  id          uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  texto       text not null,
  ordem       int  not null default 0
);

-- GAPS (ao nível da área)
create table if not exists public.area_gaps (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.areas_processos(id) on delete cascade,
  nivel       text not null check (nivel in ('critico','medio','baixo')),
  texto       text not null,
  resolvido   boolean default false,
  resolved_at timestamptz,
  ordem       int  not null default 0
);

-- ÍNDICES
create index if not exists idx_processos_area    on public.processos(area_id);
create index if not exists idx_steps_processo    on public.processo_steps(processo_id, ordem);
create index if not exists idx_inputs_processo   on public.processo_inputs(processo_id, ordem);
create index if not exists idx_outputs_processo  on public.processo_outputs(processo_id, ordem);
create index if not exists idx_kpis_processo     on public.processo_kpis(processo_id, ordem);
create index if not exists idx_ferr_processo     on public.processo_ferramentas(processo_id, ordem);
create index if not exists idx_gaps_area         on public.area_gaps(area_id);
create index if not exists idx_gaps_nivel        on public.area_gaps(nivel) where resolvido = false;

-- RLS: leitura para todos os autenticados, escrita só admin (is_admin() já existe na plataforma)
alter table public.areas_processos     enable row level security;
alter table public.processos           enable row level security;
alter table public.processo_steps      enable row level security;
alter table public.processo_inputs     enable row level security;
alter table public.processo_outputs    enable row level security;
alter table public.processo_kpis       enable row level security;
alter table public.processo_ferramentas enable row level security;
alter table public.area_gaps           enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'areas_processos','processos','processo_steps','processo_inputs',
    'processo_outputs','processo_kpis','processo_ferramentas','area_gaps'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write',  t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t||'_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (is_admin()) with check (is_admin())',
      t||'_write', t);
  end loop;
end $$;

-- VIEW consolidada (gaps vêm de area_gaps, não por processo)
create or replace view public.v_processos_completos as
select
  p.id,
  p.nome,
  p.descricao,
  p.responsavel,
  p.status,
  p.notas,
  p.ordem,
  p.area_id,
  a.slug       as area_slug,
  a.nome       as area_nome,
  a.icone      as area_icone,
  a.cor_accent as area_cor,
  (select coalesce(json_agg(json_build_object('ordem', s.ordem, 'acao', s.acao) order by s.ordem), '[]')
     from public.processo_steps s where s.processo_id = p.id)        as steps,
  (select coalesce(json_agg(i.texto order by i.ordem), '[]')
     from public.processo_inputs i where i.processo_id = p.id)       as inputs,
  (select coalesce(json_agg(o.texto order by o.ordem), '[]')
     from public.processo_outputs o where o.processo_id = p.id)      as outputs,
  (select coalesce(json_agg(k.texto order by k.ordem), '[]')
     from public.processo_kpis k where k.processo_id = p.id)         as kpis,
  (select coalesce(json_agg(f.texto order by f.ordem), '[]')
     from public.processo_ferramentas f where f.processo_id = p.id)  as ferramentas
from public.processos p
join public.areas_processos a on a.id = p.area_id
order by a.ordem, p.ordem;
