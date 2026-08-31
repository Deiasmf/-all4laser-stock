-- ───────────────────────────────────────────────────────────────────────────
-- BACKFILL do módulo Tracking — migra os envios/AWB já existentes.
-- APLICAR SÓ DEPOIS de 20260803_shipments_tracking.sql (triggers têm de existir).
-- Estratégia: fazer um UPDATE "no-op" nas linhas de origem relevantes para que
-- os triggers de sincronização criem as entradas em shipments_tracking, usando
-- exatamente o mesmo mapeamento da sincronização automática (sem lógica
-- duplicada). Idempotente: correr de novo não cria duplicados (upsert por origem).
-- Efeito colateral: bump de updated_at nas ~23 linhas tocadas.
-- ───────────────────────────────────────────────────────────────────────────

-- Envios de peças com informação de expedição (transportadora/tracking/AWB).
update public.envios_pecas
   set transportadora = transportadora
 where coalesce(transportadora,'') <> ''
    or coalesce(tracking_numero,'') <> ''
    or coalesce(awb_numero,'') <> '';

-- Equipamentos com AWB/DAU preenchido.
update public.equipamentos
   set awb_dau = awb_dau
 where coalesce(awb_dau,'') <> '';
