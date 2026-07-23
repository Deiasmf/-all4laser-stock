-- ============================================================
-- Corrige o CHECK da transportadora para incluir "Entrega em Mãos".
-- Sem isto, gravar transportadora='Entrega em Mãos' era rejeitado pela BD
-- (envios_pecas_transportadora_check só permitia Nacex/UPS/FedEx/Outro).
-- ============================================================
alter table public.envios_pecas drop constraint if exists envios_pecas_transportadora_check;
alter table public.envios_pecas add constraint envios_pecas_transportadora_check
  check (transportadora = any (array['Nacex'::text, 'UPS'::text, 'FedEx'::text, 'Entrega em Mãos'::text, 'Outro'::text]));
