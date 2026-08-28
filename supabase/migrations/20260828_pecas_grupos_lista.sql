-- STOCK DE PEÇAS — lista gerível de GRUPOS (modelo/grupo compatível).
-- Normalização mantém o "+" (Elite ≠ Elite +); só colapsa maiúsculas/acentos.
create or replace function public.norm_grupo(t text)
returns text language sql immutable
as $$
  select nullif(btrim(regexp_replace(
    translate(lower(coalesce(t,'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g')), '')
$$;

create table if not exists public.grupos_pecas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists grupos_pecas_norm_uidx
  on public.grupos_pecas (public.norm_grupo(nome));

alter table public.grupos_pecas enable row level security;
drop policy if exists grupos_pecas_rw on public.grupos_pecas;
create policy grupos_pecas_rw on public.grupos_pecas
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.grupos_pecas to authenticated;

-- Semear: por cada grupo normalizado, a grafia mais frequente.
insert into public.grupos_pecas (nome)
select nome from (
  select nome, row_number() over (partition by public.norm_grupo(nome) order by n desc, nome) rn
  from (
    select btrim(grupo) as nome, count(*) as n
    from public.pecas
    where nullif(btrim(grupo), '') is not null
    group by btrim(grupo)
  ) t
) s where rn = 1
on conflict do nothing;

-- Normalizar pecas.grupo para a grafia canónica (só colapsa maiúsculas/acentos;
-- "Elite" e "Elite +" ficam separados).
update public.pecas p
   set grupo = g.nome
  from public.grupos_pecas g
 where public.norm_grupo(p.grupo) = public.norm_grupo(g.nome)
   and btrim(p.grupo) <> g.nome
   and nullif(btrim(p.grupo), '') is not null;
