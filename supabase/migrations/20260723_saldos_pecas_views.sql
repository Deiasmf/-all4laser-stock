-- ============================================================
-- Saldos de Peças (Fase A) — views sobre reparacao_pecas (dados reais).
-- entidade = fornecedor (texto); peça = peca (texto) / peca_id quando existe.
-- Quantidades: se houver itens (peças sem SN) usa quantidade_saida/entrada;
-- caso contrário 1 por registo (data_entrada => recebido).
-- ============================================================

-- Detalhe: uma linha por reparação (para o drill-down de movimentos).
create or replace view public.parts_movements
with (security_invoker = true) as
with base as (
  select
    r.*,
    btrim(r.fornecedor) as entidade_calc,
    coalesce(nullif(btrim(r.peca), ''), '(sem nome)') as peca_calc,
    it.qtd_saida, it.qtd_entrada
  from public.reparacao_pecas r
  left join lateral (
    select sum(quantidade_saida) as qtd_saida, sum(quantidade_entrada) as qtd_entrada
    from public.reparacao_pecas_itens i where i.reparacao_id = r.id
  ) it on true
  where r.fornecedor is not null and btrim(r.fornecedor) <> ''
)
select
  id,
  entidade_calc as entidade,
  peca_calc as peca,
  peca_id,
  numero as referencia,
  serial_number,
  sn_avariado,
  tipo_dono,
  status,
  data_saida,
  data_entrada,
  coalesce(qtd_saida, 1)::int as enviado,
  (case when qtd_saida is not null then coalesce(qtd_entrada, 0)
        when data_entrada is not null then 1 else 0 end)::int as recebido,
  case
    when (case when qtd_saida is not null then coalesce(qtd_entrada, 0)
               when data_entrada is not null then 1 else 0 end) >= coalesce(qtd_saida, 1)
      then 'recebido'
    when lower(coalesce(status, '')) ~ '(devol|n[ãa]o repar|abatid|perdid)' then 'sem_retorno'
    else 'em_reparacao'
  end as estado,
  coalesce(data_saida, created_at::date) as data
from base;

grant select on public.parts_movements to authenticated;

-- Agregado por entidade + tipo de peça.
create or replace view public.entity_parts_balance
with (security_invoker = true) as
select
  entidade,
  peca,
  bool_or(peca_id is not null) as tem_peca_id,
  sum(enviado)::int as total_enviado,
  sum(recebido)::int as total_recebido,
  sum(enviado - recebido) filter (where estado = 'em_reparacao')::int as em_reparacao,
  (sum(recebido) - sum(enviado))::int as saldo,
  min(data_saida) filter (where estado = 'em_reparacao') as em_reparacao_desde,
  count(*)::int as n_movimentos
from public.parts_movements
group by entidade, peca;

grant select on public.entity_parts_balance to authenticated;
