-- Data em que o cliente enviou / a All4laser recebeu a peça avariada.
-- Relevante sobretudo no fluxo "garantia_cliente_envia_primeiro", em que a
-- receção é o evento inicial (já aconteceu quando se cria o processo).
alter table public.processos_pecas
  add column if not exists data_rececao_avariada date;
