-- Novos estados dos pedidos de compra (fluxo manual, escolhido pela equipa):
--   submetido, em_analise, aguarda_pagamento, enviado, recebido, cancelado.
-- Substitui os estados antigos (rascunho/em_cotacao/aprovado/encomendado/
-- recebido_parcial/recebido_total). Converte os pedidos existentes.

alter table public.pedidos_compra drop constraint if exists pedidos_compra_estado_check;
alter table public.pedidos_compra alter column estado drop default;

update public.pedidos_compra set estado = case estado
  when 'rascunho'         then 'submetido'
  when 'enviado'          then 'submetido'
  when 'em_cotacao'       then 'em_analise'
  when 'aprovado'         then 'em_analise'
  when 'encomendado'      then 'enviado'
  when 'recebido_parcial' then 'enviado'
  when 'recebido_total'   then 'recebido'
  else estado
end;

alter table public.pedidos_compra
  add constraint pedidos_compra_estado_check
  check (estado in ('submetido','em_analise','aguarda_pagamento','enviado','recebido','cancelado'));

alter table public.pedidos_compra alter column estado set default 'submetido';
