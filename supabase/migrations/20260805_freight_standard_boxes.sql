-- =====================================================================
-- Cotações de Transporte — Parte B: catálogo de caixas standard
-- Medidas em cm, formato C x L x A. Para cotação usam-se SEMPRE as ext.
-- =====================================================================
create table if not exists public.standard_boxes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  int_c       numeric, int_l numeric, int_a numeric,   -- interior (nullable)
  ext_c       numeric not null, ext_l numeric not null, ext_a numeric not null, -- exterior
  peso_tipico numeric,                                  -- nullable, preencher depois
  notas       text,
  ativo       boolean not null default true,
  ordem       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.standard_boxes enable row level security;
create policy standard_boxes_rw on public.standard_boxes for all to authenticated
  using (public.has_administrativo_access())
  with check (public.has_administrativo_access());
grant select, insert, update, delete on public.standard_boxes to authenticated;

-- Seed ---------------------------------------------------------------
insert into public.standard_boxes (nome, int_c,int_l,int_a, ext_c,ext_l,ext_a, notas, ordem) values
  ('Manípulos',                       null,null,null,  50,41,15,   null,                 10),
  ('Candela',                         null,null,null, 105,68,126,  null,                 20),
  ('Gpro/MGL/Elite individual',       100,61,120,     108,70,136,  'ANTALVES',           30),
  ('Gpro/MGL/Elite DUO',              100,125,120,    133,107,137, 'ANTALVES',           40),
  ('Zimmer',                          75,59,94,        83,67,112,  'ANTALVES',           50),
  ('MGL x4',                          162,104,91,     204,132,136, 'ANTALVES',           60),
  ('Gpro x3',                         185,105,120,    194,112,140, 'ANTALVES',           70),
  ('Gpro x4',                         197,125,120,    204,133,136, 'ANTALVES',           80);
