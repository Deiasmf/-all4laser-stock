-- ───────────────────────────────────────────────────────────────────────────
-- MARKETING — Canais geríveis (multi-seleção das publicações)
--
-- ADITIVO. Passa a lista de canais (Instagram/Facebook/LinkedIn/Site) de uma
-- constante no código para uma tabela editável nas Configurações. As publicações
-- continuam a guardar o SLUG do canal em marketing_posts.canais[] — por isso
-- desativar/renomear um canal nunca perde dados (os slugs antigos mantêm-se).
-- Acesso: is_staff() (todo o staff), como o resto do módulo.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.marketing_canais (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,          -- identificador estável (ex.: instagram, tiktok)
  label      text not null,                 -- nome mostrado (ex.: Instagram)
  emoji      text,
  ordem      int not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Semear os 4 canais atuais (idempotente).
insert into public.marketing_canais (slug, label, emoji, ordem) values
  ('instagram', 'Instagram', '📸', 1),
  ('facebook',  'Facebook',  '👍', 2),
  ('linkedin',  'LinkedIn',  '💼', 3),
  ('site',      'Site/Blog', '🌐', 4)
on conflict (slug) do nothing;

-- updated_at
drop trigger if exists trg_marketing_canais_updated_at on public.marketing_canais;
create trigger trg_marketing_canais_updated_at before update on public.marketing_canais
  for each row execute function public.set_updated_at();

create index if not exists idx_mkt_canais_ordem on public.marketing_canais(ordem);

-- RLS + GRANTS (is_staff)
alter table public.marketing_canais enable row level security;
grant select, insert, update, delete on public.marketing_canais to authenticated;
grant all on public.marketing_canais to service_role;
drop policy if exists marketing_canais_select on public.marketing_canais;
drop policy if exists marketing_canais_insert on public.marketing_canais;
drop policy if exists marketing_canais_update on public.marketing_canais;
drop policy if exists marketing_canais_delete on public.marketing_canais;
create policy marketing_canais_select on public.marketing_canais for select to authenticated using (public.is_staff());
create policy marketing_canais_insert on public.marketing_canais for insert to authenticated with check (public.is_staff());
create policy marketing_canais_update on public.marketing_canais for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy marketing_canais_delete on public.marketing_canais for delete to authenticated using (public.is_staff());
