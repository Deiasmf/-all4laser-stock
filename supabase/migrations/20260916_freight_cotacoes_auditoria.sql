-- ───────────────────────────────────────────────────────────────────────────
-- COTAÇÕES DE TRANSPORTE — auditoria + soft delete nas cotações recebidas
--
-- ADITIVO. Só acrescenta colunas de auditoria a freight_quotes para suportar
-- editar/apagar cotações com registo de quem/quando (ponto 4 do pacote v3).
-- O apagar passa a ser SOFT delete (deleted_at) — nunca se perde histórico.
-- A RLS existente (has_administrativo_access) já cobre a tabela; nada a mudar.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.freight_quotes
  add column if not exists created_by       uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_nome  text,
  add column if not exists updated_at        timestamptz,
  add column if not exists updated_by        uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by_nome   text,
  add column if not exists deleted_at         timestamptz,
  add column if not exists deleted_by         uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_by_nome    text;

-- Índice para listar apenas as cotações ativas de um pedido.
create index if not exists idx_freight_quotes_request_ativas
  on public.freight_quotes(request_id) where deleted_at is null;
