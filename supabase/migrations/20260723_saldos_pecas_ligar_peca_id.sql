-- ============================================================
-- Saldos de Peças — ligar reparacao_pecas.peca_id ao catálogo pecas,
-- APENAS quando o nome casa (normalizado) com exatamente 1 peça do catálogo
-- (evita ligar à peça errada quando o catálogo tem nomes duplicados).
-- Liga ~126 registos; os restantes ~1810 são descrições de reparação em
-- texto livre que não existem no catálogo (ficam como texto).
-- ============================================================
with cat as (
  select regexp_replace(translate(lower(btrim(nome)),
           'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g') as chave_nome,
         min(id::text) as id, count(*) as cnt
  from public.pecas group by 1
)
update public.reparacao_pecas r
set peca_id = cat.id::uuid
from cat
where r.peca_id is null
  and r.peca is not null and btrim(r.peca) <> ''
  and cat.cnt = 1
  and regexp_replace(translate(lower(btrim(r.peca)),
        'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g') = cat.chave_nome;
