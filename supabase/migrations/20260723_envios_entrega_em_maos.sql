-- ============================================================
-- Envios de Peças — "Entrega em Mãos".
-- Quando o método de envio é "Entrega em Mãos" não há carta de porte.
-- Campos opcionais para registar a quem foi entregue e quando.
-- ============================================================
alter table public.envios_pecas
  add column if not exists entregue_a text,
  add column if not exists entregue_em date;
