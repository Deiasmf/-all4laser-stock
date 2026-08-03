-- ============================================================
-- Envios de Peças — Tracking e AWB.
-- Número de tracking (seguimento) da transportadora para acompanhar a
-- encomenda, e número de AWB (Air Waybill) para localizar envios aéreos.
-- Ambos opcionais e de texto livre.
-- ============================================================
alter table public.envios_pecas
  add column if not exists tracking_numero text,
  add column if not exists awb_numero text;

comment on column public.envios_pecas.tracking_numero is 'Número de seguimento (tracking) da transportadora.';
comment on column public.envios_pecas.awb_numero is 'Número de AWB (Air Waybill) para localizar envios aéreos.';
