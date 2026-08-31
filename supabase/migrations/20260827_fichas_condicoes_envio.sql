-- FICHAS DE PRODUTO v2 — registar as "Condições" comunicadas em cada envio.
-- Cada item enviado passa a guardar que valor/garantia/shipping seguiram, para
-- saber que condições foram comunicadas a cada destinatário.
alter table public.ficha_envio_itens
  add column if not exists moeda            text,
  add column if not exists incluiu_garantia boolean not null default false,
  add column if not exists garantia_texto   text,
  add column if not exists incluiu_shipping boolean not null default false;
