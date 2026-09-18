-- Um evento de calendário = um PERÍODO DE ALUGUER (dia inteiro, título = cliente).
-- Gera DUAS paragens: entrega (data de início) + recolha (data de fim).
-- A idempotência passa de google_event_id para (google_event_id, tipo).
alter table public.transport_stops drop constraint if exists transport_stops_google_event_id_key;
create unique index if not exists transport_stops_event_tipo_uk
  on public.transport_stops(google_event_id, tipo) where google_event_id is not null;
