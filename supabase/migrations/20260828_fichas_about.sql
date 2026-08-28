-- FICHAS DE PRODUTO v2 — bloco "About All4laser" editável (PT/EN) no ficha_config.
alter table public.ficha_config
  add column if not exists about_pt text,
  add column if not exists about_en text;

-- Garante a linha singleton e semeia o texto proposto (só se ainda vazio).
insert into public.ficha_config (id) values (true) on conflict (id) do nothing;

update public.ficha_config set
  about_pt = coalesce(nullif(btrim(about_pt), ''), 'A All4laser é uma empresa portuguesa especializada na venda, aluguer e reacondicionamento de equipamentos de laser e luz para medicina estética das principais marcas — Candela, Cynosure, Alma e Lumenis, entre outras. Com serviço técnico próprio e uma equipa dedicada, entregamos equipamentos testados e prontos a operar, com apoio a clientes em Portugal e no mercado internacional.'),
  about_en = coalesce(nullif(btrim(about_en), ''), 'All4laser is a Portuguese company specialised in the sale, rental and refurbishment of aesthetic laser and light-based equipment from the leading brands — Candela, Cynosure, Alma and Lumenis, among others. With our own in-house technical service and a dedicated team, we deliver fully tested, ready-to-use systems, supporting clients across Portugal and international markets.')
where id = true;
