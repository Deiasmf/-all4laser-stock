-- ───────────────────────────────────────────────────────────────────────────
-- Courier codes do Ship24 + cobertura, confirmados na Fase E.
--   Fonte: GET /public/v1/couriers (1664 couriers) + validação com envios reais
--   (UPS/FedEx/NACEX devolveram eventos corretos; carga aérea por AWB não tem
--   cobertura no Ship24 -> companhias aéreas ficam em modo manual).
-- Correções ao seed de 20260803_shipments_tracking.sql:
--   CTT: 'ctt' não existe no Ship24 -> 'pt-post' (CTT / Portugal Post).
--   DHL: para expresso o código correto é 'dhl-express' (não o genérico 'dhl').
-- Idempotente.
-- ───────────────────────────────────────────────────────────────────────────

update public.carriers set carrier_code_api = 'pt-post'     where codigo = 'CTT' and coalesce(carrier_code_api,'') <> 'pt-post';
update public.carriers set carrier_code_api = 'dhl-express' where codigo = 'DHL' and coalesce(carrier_code_api,'') <> 'dhl-express';
-- ups / fedex / nacex já estavam corretos no seed.

update public.carriers set suporta_ship24 = true
  where codigo in ('UPS','FEDEX','DHL','NACEX','CTT') and suporta_ship24 = false;
