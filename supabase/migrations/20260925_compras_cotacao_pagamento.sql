-- ───────────────────────────────────────────────────────────────────────────
-- PEDIDOS DE COMPRA — pedido de pagamento a partir de uma cotação
--
-- Ao adicionar/ver uma cotação de fornecedor, pode-se encaminhar por email
-- (editável) para a equipa com um pedido de pagamento. Enquanto não for marcado
-- como pago, um cron reenvia lembretes a cada 24h.
--
-- Campos na cotação:
--   pagamento_pedido_em  → quando o pedido de pagamento foi enviado (1.ª vez)
--   pago / pago_em / pago_por(_nome) → liquidação (pára os lembretes)
--   lembrete_ultimo / lembretes_count → controlo da cadência de 24h
--   destinatarios        → emails usados (reaproveitados nos lembretes)
-- ───────────────────────────────────────────────────────────────────────────

alter table public.pedidos_compra_cotacoes
  add column if not exists pagamento_pedido_em timestamptz,
  add column if not exists pago boolean not null default false,
  add column if not exists pago_em timestamptz,
  add column if not exists pago_por uuid,
  add column if not exists pago_por_nome text,
  add column if not exists lembrete_ultimo timestamptz,
  add column if not exists lembretes_count integer not null default 0,
  add column if not exists destinatarios text[];
