-- Reflexo de peças enviadas para reparação no Stock de Peças.

-- Quantidade de unidades desta peça que estão fora, em reparação num fornecedor.
-- O total (quantidade) mantém-se; disponível = quantidade - quantidade_reparacao.
alter table public.pecas
  add column if not exists quantidade_reparacao integer not null default 0;

-- Marca quando as peças de um envio de reparação voltaram do fornecedor.
-- Enquanto null e o envio está expedido, as peças contam como "em reparação".
alter table public.envios_pecas
  add column if not exists reparacao_voltou_em timestamp with time zone;
