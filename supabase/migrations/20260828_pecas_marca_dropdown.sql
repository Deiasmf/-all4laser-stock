-- STOCK DE PEÇAS — marca por seleção (reutiliza a tabela `marcas`).
-- A `pecas.marca` continua a ser TEXTO (nome canónico da marca); a migração só
-- normaliza esse texto. NÃO toca em stock/movimentos (stock_movements) nem em FKs.

-- 1) Similaridade fuzzy (para apanhar typos: "Candella" vs "Candela").
create extension if not exists pg_trgm;

-- 2) marcas: coluna `ativo`.
alter table public.marcas add column if not exists ativo boolean not null default true;

-- 3) RPC: marcas semelhantes (igual normalizado OU parecido por similaridade).
create or replace function public.marcas_semelhantes(p_nome text)
returns table (id uuid, nome text, ativo boolean, exato boolean, sim real)
language sql stable security definer set search_path to 'public'
as $$
  select m.id, m.nome, m.ativo,
    (public.norm_txt(m.nome) = public.norm_txt(p_nome)) as exato,
    similarity(lower(m.nome), lower(coalesce(p_nome, ''))) as sim
  from public.marcas m
  where public.is_staff()
    and length(btrim(coalesce(p_nome, ''))) >= 2
    and (
      public.norm_txt(m.nome) = public.norm_txt(p_nome)
      or similarity(lower(m.nome), lower(p_nome)) >= 0.4
    )
  order by exato desc, sim desc
  limit 8;
$$;
revoke all on function public.marcas_semelhantes(text) from public, anon;
grant execute on function public.marcas_semelhantes(text) to authenticated;

-- 4) MIGRAÇÃO DE DADOS — normalizar `pecas.marca` (só casos claros aprovados).
update public.pecas set marca = 'Alma Lasers' where public.norm_txt(marca) = 'almalaser';
update public.pecas set marca = 'Candela'     where public.norm_txt(marca) in ('candela', 'candale');
update public.pecas set marca = 'Cynosure'    where public.norm_txt(marca) in ('cynosure', 'cynosre', 'cynosrure');
update public.pecas set marca = 'Deka'        where public.norm_txt(marca) = 'deka';
update public.pecas set marca = 'Zimmer'      where public.norm_txt(marca) = 'zimmer';
update public.pecas set marca = 'Lumenis'     where public.norm_txt(marca) = 'lumenis';
-- «Cynosyre/Lutronic», «Varios» e as 37 sem marca ficam INTACTAS (classificação manual).
