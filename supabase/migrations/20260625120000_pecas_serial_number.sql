-- Campo Serial Number nas peças.
-- Peças individuais (ex.: aplicadores/HP) podem ter serial próprio → 1 peça = 1 QR.
-- Peças sem serial ficam por quantidade (serial_number a null).
alter table public.pecas add column if not exists serial_number text;

create index if not exists idx_pecas_serial on public.pecas(serial_number);
