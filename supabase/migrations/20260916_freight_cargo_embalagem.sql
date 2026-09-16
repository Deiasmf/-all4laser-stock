-- ───────────────────────────────────────────────────────────────────────────
-- COTAÇÕES — descrição da mercadoria: tipo de embalagem (caixa/palete/outro,
-- com escrita livre) e se é sobreponível. ADITIVO, tudo nullable.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.freight_quote_cargo_lines
  add column if not exists embalagem      text check (embalagem in ('caixa','palete','outro')),
  add column if not exists embalagem_desc text,      -- escrita livre (sobretudo p/ "outro")
  add column if not exists sobreponivel   boolean;   -- null = não especificado
