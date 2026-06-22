-- Envio das faturas dos alugueres por email ao cliente:
--  • clientes.email — email do cliente (reutilizado e editável no envio)
--  • alugueres.fatura_enviada_em / _para — regista quando e para quem foi enviada

alter table clientes add column if not exists email text;

alter table alugueres add column if not exists fatura_enviada_em timestamptz;
alter table alugueres add column if not exists fatura_enviada_para text;
