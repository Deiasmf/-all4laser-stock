-- IVA das encomendas/envios: taxa de IVA (ex.: 23, 6) ou isento.
-- iva_valor = valor_a_faturar * iva_taxa/100 (0 quando isento); total = valor + iva.
alter table public.envios_pecas
  add column if not exists iva_isento boolean not null default false,
  add column if not exists iva_taxa numeric not null default 23;
