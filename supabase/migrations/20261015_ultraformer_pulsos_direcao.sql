-- Ultraformer: correção da DIREÇÃO dos pulsos.
-- O contador do manípulo DECRESCE com o uso (mostra os pulsos RESTANTES):
-- entrega 1000 → recolha 500 = 500 pulsos usados.
-- pulsos_utilizados passa a ser (contador_entrega − contador_recolha).
-- Sem dados reais (feature nova), por isso drop/recreate da coluna gerada é seguro.
alter table public.ultraformer_registo_linhas drop column if exists pulsos_utilizados;
alter table public.ultraformer_registo_linhas add column pulsos_utilizados int
  generated always as (case when contador_recolha is null then null else contador_entrega - contador_recolha end) stored;
