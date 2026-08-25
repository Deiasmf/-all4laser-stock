-- View de completude da ficha de produto por equipamento (read-only).
-- feitos = quantos dos 5 critérios estão cumpridos: condição, descrição do
-- estado, nº mínimo de fotos (config), ≥1 handpiece com contador+data, ≥1 acessório.
-- security_invoker => respeita a RLS das tabelas de base para quem consulta.
create or replace view public.equipamento_completude
with (security_invoker = on) as
select
  e.id as equipamento_id,
  (
    (coalesce(p.condicao, '') <> '')::int
    + (coalesce(p.condicao_descricao, '') <> '')::int
    + (coalesce(f.n_fotos, 0) >= coalesce(cfg.min_fotos, 5))::int
    + (coalesce(h.n_hp_ok, 0) > 0)::int
    + (coalesce(a.n_acess, 0) > 0)::int
  ) as feitos,
  5 as total
from public.equipamentos e
left join public.equipamento_produto p on p.equipamento_id = e.id
left join (
  select equipamento_id, count(*) as n_fotos
  from public.media where tipo is null or tipo = 'foto'
  group by equipamento_id
) f on f.equipamento_id = e.id
left join (
  select equipamento_id, count(*) as n_hp_ok
  from public.equipamento_handpieces
  where contador_pulsos is not null and data_leitura is not null
  group by equipamento_id
) h on h.equipamento_id = e.id
left join (
  select equipamento_id, count(*) as n_acess
  from public.equipamento_acessorios group by equipamento_id
) a on a.equipamento_id = e.id
cross join (select min_fotos from public.ficha_config where id = true) cfg;

grant select on public.equipamento_completude to authenticated;
