-- ============================================================
-- Reconciliação de stock: stock atual (pecas.quantidade)
-- vs soma dos movimentos (stock_movements).
-- Corre isto quando quiseres detetar divergências.
-- Se vier vazio, está tudo coerente.
-- ============================================================
select
  p.nome,
  p.quantidade                                         as stock_atual,
  coalesce(sum(m.quantidade), 0)                       as soma_movimentos,
  p.quantidade - coalesce(sum(m.quantidade), 0)        as divergencia
from pecas p
left join stock_movements m on m.peca_id = p.id
group by p.id, p.nome, p.quantidade
having p.quantidade <> coalesce(sum(m.quantidade), 0)
order by abs(p.quantidade - coalesce(sum(m.quantidade), 0)) desc;

-- ------------------------------------------------------------
-- Reconciliação do "em reparação" (pecas.quantidade_reparacao) vs
-- EPs realmente ativas (fornecedor, motivo reparação, expedidas, por voltar).
-- Se vier vazio, está coerente. Para corrigir uma peça:
--   select recalcular_reparacao_peca('<id-da-peca>');
-- ------------------------------------------------------------
with derivado as (
  select p.id, p.nome, p.quantidade_reparacao as gravado,
         coalesce((
           select sum(i.quantidade)
             from envios_pecas_itens i
             join envios_pecas e on e.id = i.envio_id
            where i.peca_id = p.id
              and e.destinatario_tipo = 'fornecedor'
              and e.motivo = 'reparacao'
              and e.estado = 'expedido'
              and e.reparacao_voltou_em is null
         ), 0) as correto
  from pecas p
)
select * from derivado where gravado <> correto order by gravado desc;

-- ------------------------------------------------------------
-- Histórico de movimentos de uma peça (auditoria).
-- Substitui o id pela peça que queres inspecionar.
-- ------------------------------------------------------------
-- select created_at, tipo, quantidade, referencia, notas, criado_por_nome
-- from stock_movements
-- where peca_id = '00000000-0000-0000-0000-000000000000'
-- order by created_at;
