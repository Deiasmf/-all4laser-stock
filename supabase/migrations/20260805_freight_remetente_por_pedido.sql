-- Remetente por pedido + lista de remetentes permitidos (gerível na config).
-- O envio (Gmail API) personifica este endereço @all4laser.com; a lista é
-- editável em Cotações de Transporte → Templates & configuração.
alter table public.freight_quote_requests
  add column if not exists remetente text default 'vanessa.tavares@all4laser.com';

alter table public.freight_settings
  add column if not exists remetentes text[] not null
    default array['comercial@all4laser.com','andreia.fernandes@all4laser.com','vanessa.tavares@all4laser.com'];

update public.freight_settings
  set remetentes = array['comercial@all4laser.com','andreia.fernandes@all4laser.com','vanessa.tavares@all4laser.com']
  where id = 1 and (remetentes is null or array_length(remetentes,1) is null);
