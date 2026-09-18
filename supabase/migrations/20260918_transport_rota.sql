-- Agenda de Transportes (Rota otimizada via OpenRouteService).
-- Coordenadas + ordem da rota nas paragens; ponto de partida do motorista; km/dia.
alter table public.transport_stops
  add column if not exists lat            numeric,
  add column if not exists lng            numeric,
  add column if not exists geocode_status text,   -- ok | falhou | pendente
  add column if not exists ordem          int;     -- ordem na rota do motorista/dia

alter table public.transport_drivers
  add column if not exists partida_morada text,
  add column if not exists partida_lat    numeric,
  add column if not exists partida_lng    numeric;

alter table public.transport_driver_days
  add column if not exists km_total numeric;

update public.transport_drivers
  set partida_morada = 'Mogege, Vila Nova de Famalicão, Portugal'
  where nome = 'José' and partida_morada is null;
