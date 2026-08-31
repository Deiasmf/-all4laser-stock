-- Migra o texto livre de equipamentos.acessorios para itens estruturados
-- (equipamento_acessorios). Separa por vírgula, ponto-e-vírgula, barra ou +.
-- O texto original mantém-se em equipamentos.acessorios (legado, não se apaga).
insert into public.equipamento_acessorios (equipamento_id, descricao, ordem)
select e.id, trim(x.item), x.ord
from public.equipamentos e
cross join lateral (
  select item, row_number() over () as ord
  from regexp_split_to_table(e.acessorios, '\s*[,;/+]\s*') as item
) x
where coalesce(trim(e.acessorios),'') <> '' and trim(x.item) <> '';
