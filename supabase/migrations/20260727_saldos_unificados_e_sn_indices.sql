-- ───────────────────────────────────────────────────────────────────────────
-- SALDOS UNIFICADOS (clientes + fornecedores) + índices de Serial Number.
--
-- Decisões (com a Andreia):
--   • Saldos = movimentos reais unidos: reparacao_pecas (legado) + envios_pecas
--     (saídas p/ reparação) + rececoes_pecas (entradas), por ENTIDADE (cliente
--     OU fornecedor) + peça. Agrupa por (entidade_tipo, nome normalizado) — não
--     há remapeamento de IDs (a maioria dos 28 nomes legados é texto livre).
--   • Convenção de entidade: a mesma do resto da app — tipo + nome; sem
--     entity_type/entity_id genérico.
--   • Nada de migração de dados destrutiva.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1) Índices para pesquisa de Serial Number ────────────────────────────────
create index if not exists idx_epi_sn on public.envios_pecas_itens (lower(serial_number)) where serial_number is not null;
create index if not exists idx_rpi_sn on public.rececoes_pecas_itens (lower(serial_number)) where serial_number is not null;
create index if not exists idx_rep_sn on public.reparacao_pecas (lower(serial_number)) where serial_number is not null;

-- ── 2) View de movimentos (unificada) ────────────────────────────────────────
-- Recriar (mudam as colunas → drop + create, pela ordem de dependência).
drop view if exists public.entity_parts_balance;
drop view if exists public.parts_movements;

create view public.parts_movements with (security_invoker = on) as
-- (A) LEGADO: reparacao_pecas — entidade = quem repara (fornecedor, texto).
with legado as (
  select r.id,
    coalesce(nullif(btrim(r.fornecedor), ''), '(sem nome)') as entidade,
    coalesce(nullif(btrim(r.peca), ''), '(sem nome)') as peca,
    r.peca_id, r.numero as referencia, r.serial_number, r.sn_avariado,
    r.tipo_dono, r.status, r.data_saida, r.data_entrada, r.created_at,
    it.qtd_saida, it.qtd_entrada
  from public.reparacao_pecas r
  left join lateral (
    select sum(i.quantidade_saida) as qtd_saida, sum(i.quantidade_entrada) as qtd_entrada
    from public.reparacao_pecas_itens i where i.reparacao_id = r.id
  ) it on true
  where r.fornecedor is not null and btrim(r.fornecedor) <> ''
)
select id, 'fornecedor'::text as entidade_tipo, null::uuid as entidade_id,
  entidade, peca, peca_id, referencia, serial_number, sn_avariado, tipo_dono, status,
  data_saida, data_entrada,
  coalesce(qtd_saida, 1)::int as enviado,
  (case when qtd_saida is not null then coalesce(qtd_entrada, 0)
        when data_entrada is not null then 1 else 0 end)::int as recebido,
  (case
     when (case when qtd_saida is not null then coalesce(qtd_entrada, 0)
                when data_entrada is not null then 1 else 0 end) >= coalesce(qtd_saida, 1) then 'recebido'
     when lower(coalesce(status, '')) ~ '(devol|n[ãa]o repar|abatid|perdid)' then 'sem_retorno'
     else 'em_reparacao' end) as estado,
  coalesce(data_saida, created_at::date) as data
from legado

union all
-- (B) ENVIOS expedidos com motivo='reparacao' → "enviado".
select e.id, e.destinatario_tipo,
  coalesce(e.cliente_id, e.fornecedor_id),
  coalesce(nullif(btrim(coalesce(e.cliente_nome, e.fornecedor_nome)), ''), '(sem nome)'),
  coalesce(nullif(btrim(it.peca_nome), ''), '(sem nome)'),
  it.peca_id, e.numero, it.serial_number, null::text, null::text, null::text,
  e.expedido_em::date, null::date,
  it.quantidade::int, 0,
  'em_reparacao'::text,
  coalesce(e.expedido_em::date, e.created_at::date)
from public.envios_pecas e
join public.envios_pecas_itens it on it.envio_id = e.id
where e.estado = 'expedido' and e.motivo = 'reparacao'

union all
-- (C) RECEÇÕES conferidas → "recebido".
select rc.id, rc.origem_tipo,
  coalesce(rc.cliente_id, rc.fornecedor_id),
  coalesce(nullif(btrim(coalesce(rc.cliente_nome, rc.fornecedor_nome)), ''), '(sem nome)'),
  coalesce(nullif(btrim(ri.peca_nome), ''), '(sem nome)'),
  ri.peca_id, rc.numero, ri.serial_number, null::text, null::text, null::text,
  null::date, rc.recebido_em::date,
  0, ri.quantidade::int,
  'recebido'::text,
  coalesce(rc.recebido_em::date, rc.created_at::date)
from public.rececoes_pecas rc
join public.rececoes_pecas_itens ri on ri.rececao_id = rc.id
where rc.estado = 'conferido';

-- ── 3) View de saldo agregado por entidade + peça ────────────────────────────
create view public.entity_parts_balance with (security_invoker = on) as
select entidade_tipo, entidade, peca,
  bool_or(peca_id is not null) as tem_peca_id,
  sum(enviado)::int as total_enviado,
  sum(recebido)::int as total_recebido,
  -- Em reparação = enviado (exceto o que é "sem retorno") menos recebido, nunca < 0.
  greatest(sum(enviado) filter (where estado <> 'sem_retorno') - sum(recebido), 0)::int as em_reparacao,
  (sum(recebido) - sum(enviado))::int as saldo,
  min(data) filter (where enviado > 0 and estado = 'em_reparacao') as em_reparacao_desde,
  count(*)::int as n_movimentos
from public.parts_movements
group by entidade_tipo, entidade, peca;

-- ── 4) Grants (views herdam a RLS das tabelas base via security_invoker) ──────
grant select on public.parts_movements to authenticated;
grant select on public.entity_parts_balance to authenticated;
