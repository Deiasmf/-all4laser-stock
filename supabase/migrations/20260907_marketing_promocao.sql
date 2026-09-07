-- ───────────────────────────────────────────────────────────────────────────
-- MARKETING — Promoção: Orgânica vs A promover (reutiliza estrategia_promocao)
--
-- Reutiliza o campo existente marketing_posts.estrategia_promocao como
-- "promotion_type" (organica = ORGANIC, candidata_paga = CANDIDATE_PAID,
-- paga_aprovada = já aprovada). Acrescenta o ESTADO da promoção por publicação
-- e enriquece a tabela existente marketing_paid_proposals (detalhes da promoção).
-- NÃO liga nem ativa campanhas em plataformas de anúncios.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Estado da promoção por publicação (novo — não existia equivalente).
alter table public.marketing_posts
  add column if not exists promotion_status text not null default 'NOT_APPLICABLE'
    check (promotion_status in
      ('NOT_APPLICABLE','PLANNED','APPROVED','ACTIVE','COMPLETED','CANCELLED'));

comment on column public.marketing_posts.promotion_status is
  'Estado da promoção paga. Regra: organica→NOT_APPLICABLE; candidata_paga→PLANNED; nunca APPROVED/ACTIVE automaticamente.';

-- 2) Detalhes da promoção na tabela que JÁ existe (sem duplicar objetivo/orçamento/datas).
alter table public.marketing_paid_proposals
  add column if not exists ad_platform text
    check (ad_platform in ('META_ADS','LINKEDIN_ADS','GOOGLE_ADS','TIKTOK_ADS','OTHER')),
  add column if not exists moeda text not null default 'EUR';

-- Estende o objetivo existente para cobrir também MESSAGES e AWARENESS.
alter table public.marketing_paid_proposals
  drop constraint if exists marketing_paid_proposals_objetivo_check;
alter table public.marketing_paid_proposals
  add constraint marketing_paid_proposals_objetivo_check
  check (objetivo in ('leads','mensagens','trafego','conversao','notoriedade','alcance'));

-- 3) Backfill do estado a partir da estratégia atual (idempotente).
update public.marketing_posts set promotion_status = case
  when estrategia_promocao = 'paga_aprovada' then 'APPROVED'
  when estrategia_promocao = 'candidata_paga' then 'PLANNED'
  else 'NOT_APPLICABLE'
end
where promotion_status is distinct from (case
  when estrategia_promocao = 'paga_aprovada' then 'APPROVED'
  when estrategia_promocao = 'candidata_paga' then 'PLANNED'
  else 'NOT_APPLICABLE'
end);

-- 4) As 9 publicações a promover (identificadas pela data prevista da série
--    quinzenal "Aluguer"). Determinístico, não adivinha: só estas datas.
update public.marketing_posts
set estrategia_promocao = 'candidata_paga', promotion_status = 'PLANNED'
where deleted_at is null
  and data_prevista in (
    '2026-09-01','2026-09-15','2026-09-29','2026-10-13','2026-10-27',
    '2026-11-10','2026-11-24','2026-12-08','2026-12-22'
  );
