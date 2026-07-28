-- ───────────────────────────────────────────────────────────────────────────
-- ALUGUERES — recolha só no fim do contrato (contratos de vários meses).
--
-- Um contrato de vários meses (ex.: 12/24 meses) é guardado como N registos de
-- aluguer, um por mês, para a faturação mensal (pago/não pago mês a mês). Mas
-- fisicamente há UM equipamento, recolhido UMA vez, no fim do contrato.
--
-- Nova coluna recolha_aplicavel:
--   • true  → este mês corresponde à recolha física (mês único ou último mês
--             de um contrato). Aparece em "Registar recolha" e conta como
--             "Em curso (por devolver)".
--   • false → mês intermédio, só para faturação. NÃO aparece na recolha nem
--             conta como equipamento por devolver.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.alugueres
  add column if not exists recolha_aplicavel boolean not null default true;

-- Backfill dos contratos já existentes.
-- Os N meses de um contrato são inseridos na MESMA instrução, pelo que partilham
-- o mesmo created_at (now() é constante na transação) e o mesmo serial_number.
-- Agrupa por (cliente, serial, created_at) e marca como "só faturação" todos
-- menos o mês mais tardio de cada grupo.
--
-- IMPORTANTE: só agrupa registos com serial_number preenchido. Os dados legados
-- importados em massa têm serial_number a NULL e vários clientes partilham o
-- mesmo created_at — agrupá-los seria incorreto. Ficam todos como recolha=true
-- (comportamento atual, sem regressão).
with grupos as (
  select id,
    row_number() over (
      partition by cliente_id, serial_number, created_at
      order by data_entrega desc, id desc
    ) as rn
  from public.alugueres
  where serial_number is not null and serial_number <> ''
)
update public.alugueres a
set recolha_aplicavel = false
from grupos g
where a.id = g.id and g.rn > 1;
