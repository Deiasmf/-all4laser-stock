-- FICHAS DE PRODUTO v2 — descrições standard por MODELO (PT/EN).
-- Escrita uma vez por modelo (marca+modelo) e usada automaticamente na ficha de
-- qualquer equipamento desse modelo.
create table if not exists public.equipment_model_descriptions (
  id              uuid primary key default gen_random_uuid(),
  marca           text,
  modelo          text not null,
  descricao_pt    text,
  descricao_en    text,
  criado_por      uuid,
  criado_por_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Único por modelo (normalizado: sem espaços extra, minúsculas).
create unique index if not exists emd_marca_modelo_uidx
  on public.equipment_model_descriptions (lower(btrim(coalesce(marca, ''))), lower(btrim(modelo)));

alter table public.equipment_model_descriptions enable row level security;
drop policy if exists emd_rw on public.equipment_model_descriptions;
create policy emd_rw on public.equipment_model_descriptions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
